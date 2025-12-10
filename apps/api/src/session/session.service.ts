import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from './session.schema';
import {
  SessionEvent,
  SessionEventDocument,
  EventType,
  EventData,
  FaceTrackingEventData,
} from './session-event.schema';
import { FaceTrackingEventPayload, FaceTrackingEventType } from '@sec-flags/shared';

/**
 * Map frontend event types to backend EventType enum
 */
const TRACKING_EVENT_TYPE_MAP: Record<FaceTrackingEventType, EventType> = {
  // Face Position
  'face_away': EventType.FACE_TURNED_AWAY,
  'face_returned': EventType.FACE_RETURNED,
  'face_not_detected': EventType.FACE_NOT_DETECTED,
  'face_detected': EventType.FACE_DETECTED,
  
  // Gaze/Eye Direction
  'looking_away': EventType.GAZE_AWAY,
  'looking_back': EventType.GAZE_RETURNED,
  
  // Eye State
  'eyes_closed_extended': EventType.EYES_CLOSED_EXTENDED,
  'eyes_opened': EventType.EYES_OPENED,
  'excessive_blinking': EventType.EXCESSIVE_BLINKING,
  'squinting_detected': EventType.SQUINTING_DETECTED,
  
  // Speaking
  'talking': EventType.SPEAKING_DETECTED,
  'stopped_talking': EventType.SPEAKING_STOPPED,
  
  // Head Movement
  'head_movement_excessive': EventType.HEAD_MOVEMENT_EXCESSIVE,
  'head_tilted': EventType.HEAD_TILTED,
  'head_position_normal': EventType.HEAD_POSITION_NORMAL,
  
  // Expression
  'expression_confused': EventType.EXPRESSION_CONFUSED,
  'lip_reading_detected': EventType.LIP_READING_DETECTED,
  
  // Browser/Session
  'tab_switched_away': EventType.TAB_SWITCHED_AWAY,
  'tab_returned': EventType.TAB_RETURNED,
  'window_blur': EventType.WINDOW_BLUR,
  'window_focus': EventType.WINDOW_FOCUS,
  'multiple_faces_detected': EventType.MULTIPLE_FACES_DETECTED,
};

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(SessionEvent.name)
    private sessionEventModel: Model<SessionEventDocument>,
  ) {}

  /**
   * Create a new session in the database
   */
  async createSession(
    sessionId: string,
    clientId: string,
    initialFaceImage?: Buffer,
  ): Promise<SessionDocument> {
    const session = new this.sessionModel({
      sessionId,
      clientId,
      initialFaceImage,
    });

    const savedSession = await session.save();
    this.logger.log(`Session created in DB: ${sessionId}`);
    return savedSession;
  }

  /**
   * Get a session by sessionId
   */
  async getSessionById(sessionId: string): Promise<SessionDocument | null> {
    return this.sessionModel.findOne({ sessionId }).exec();
  }

  /**
   * Get a session by clientId
   */
  async getSessionByClientId(
    clientId: string,
  ): Promise<SessionDocument | null> {
    return this.sessionModel.findOne({ clientId }).exec();
  }

  /**
   * Update the initial face image for a session
   */
  async updateFaceImage(
    sessionId: string,
    faceImage: Buffer,
  ): Promise<SessionDocument | null> {
    const updated = await this.sessionModel
      .findOneAndUpdate(
        { sessionId },
        { initialFaceImage: faceImage },
        { new: true },
      )
      .exec();

    if (updated) {
      this.logger.log(`Face image updated for session: ${sessionId}`);
    }
    return updated;
  }

  /**
   * Delete a session and all its events
   */
  async deleteSession(sessionId: string): Promise<void> {
    await Promise.all([
      this.sessionModel.deleteOne({ sessionId }).exec(),
      this.sessionEventModel.deleteMany({ sessionId }).exec(),
    ]);
    this.logger.log(`Session and events deleted: ${sessionId}`);
  }

  /**
   * Log an event for a session
   */
  async logEvent(
    sessionId: string,
    type: EventType,
    data: EventData,
    rawData?: Record<string, unknown>,
  ): Promise<SessionEventDocument> {
    const event = new this.sessionEventModel({
      sessionId,
      type,
      timestamp: new Date(),
      data,
      rawData,
    });

    const savedEvent = await event.save();
    this.logger.log(`Event logged for session ${sessionId}: ${type}`);
    return savedEvent;
  }

  /**
   * Log a face recognition event
   */
  async logFaceRecognitionEvent(
    sessionId: string,
    confidence: number,
    isMatch: boolean,
    rawData: Record<string, unknown>,
    message?: string,
  ): Promise<SessionEventDocument> {
    return this.logEvent(
      sessionId,
      EventType.FACE_RECOGNITION,
      {
        confidence,
        isMatch,
        message,
      },
      rawData,
    );
  }

  /**
   * Log a face tracking event (from frontend tracking system)
   */
  async logFaceTrackingEvent(
    sessionId: string,
    payload: FaceTrackingEventPayload,
  ): Promise<SessionEventDocument> {
    // Map frontend event type to backend EventType
    const eventType = TRACKING_EVENT_TYPE_MAP[payload.type];
    
    if (!eventType) {
      this.logger.warn(`Unknown tracking event type: ${payload.type}`);
      // Default to a generic type or throw
      throw new Error(`Unknown tracking event type: ${payload.type}`);
    }

    // Build the event data
    const data: FaceTrackingEventData = {
      message: payload.message,
      details: payload.details,
      headPose: payload.data?.headPose,
      gazeDirection: payload.data?.gazeDirection,
      mouthOpenness: payload.data?.mouthOpenness,
      faceDetected: payload.data?.faceDetected,
      faceCount: payload.data?.faceCount,
      eyeOpenness: payload.data?.eyeOpenness,
      squintLevel: payload.data?.squintLevel,
      blinkRate: payload.data?.blinkRate,
      eyeClosureDuration: payload.data?.eyeClosureDuration,
      headMovementCount: payload.data?.headMovementCount,
      browDown: payload.data?.browDown,
      lipMovement: payload.data?.lipMovement,
    };

    // Store the full payload as rawData for debugging/analysis
    const rawData: Record<string, unknown> = {
      originalType: payload.type,
      timestamp: payload.timestamp,
      ...payload.data,
    };

    return this.logEvent(sessionId, eventType, data, rawData);
  }

  /**
   * Get all events for a session
   */
  async getSessionEvents(
    sessionId: string,
    type?: EventType,
  ): Promise<SessionEventDocument[]> {
    const query: { sessionId: string; type?: EventType } = { sessionId };
    if (type) {
      query.type = type;
    }
    return this.sessionEventModel
      .find(query)
      .sort({ timestamp: -1 })
      .exec();
  }

  /**
   * Get session with all its events
   */
  async getSessionWithEvents(sessionId: string): Promise<{
    session: SessionDocument | null;
    events: SessionEventDocument[];
  }> {
    const [session, events] = await Promise.all([
      this.getSessionById(sessionId),
      this.getSessionEvents(sessionId),
    ]);
    return { session, events };
  }

  /**
   * Get events by type across all sessions
   */
  async getEventsByType(
    type: EventType,
    limit = 100,
  ): Promise<SessionEventDocument[]> {
    return this.sessionEventModel
      .find({ type })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Get event counts by type for a session
   */
  async getEventCountsBySession(
    sessionId: string,
  ): Promise<Record<string, number>> {
    const events = await this.sessionEventModel.find({ sessionId }).exec();
    const counts: Record<string, number> = {};
    
    for (const event of events) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Get all sessions with pagination
   */
  async getAllSessions(
    page: number,
    limit: number,
  ): Promise<{
    sessions: SessionDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.sessionModel
        .find()
        .select('-initialFaceImage') // Exclude large binary data
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.sessionModel.countDocuments().exec(),
    ]);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
