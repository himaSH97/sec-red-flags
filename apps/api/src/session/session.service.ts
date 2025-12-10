import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from './session.schema';
import {
  SessionEvent,
  SessionEventDocument,
  EventType,
  EventData,
} from './session-event.schema';

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
}

