import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type SessionEventDocument = HydratedDocument<SessionEvent>;

/**
 * Extensible enum for event types.
 * Add new event types here as needed.
 */
export enum EventType {
  // Face Recognition (existing)
  FACE_RECOGNITION = 'FACE_RECOGNITION',

  // Face Position
  FACE_TURNED_AWAY = 'FACE_TURNED_AWAY',
  FACE_RETURNED = 'FACE_RETURNED',
  FACE_NOT_DETECTED = 'FACE_NOT_DETECTED',
  FACE_DETECTED = 'FACE_DETECTED',

  // Gaze/Eye Direction
  GAZE_AWAY = 'GAZE_AWAY',
  GAZE_RETURNED = 'GAZE_RETURNED',

  // Eye State
  EYES_CLOSED_EXTENDED = 'EYES_CLOSED_EXTENDED',
  EYES_OPENED = 'EYES_OPENED',
  EXCESSIVE_BLINKING = 'EXCESSIVE_BLINKING',
  SQUINTING_DETECTED = 'SQUINTING_DETECTED',

  // Speaking
  SPEAKING_DETECTED = 'SPEAKING_DETECTED',
  SPEAKING_STOPPED = 'SPEAKING_STOPPED',

  // Head Movement
  HEAD_MOVEMENT_EXCESSIVE = 'HEAD_MOVEMENT_EXCESSIVE',
  HEAD_TILTED = 'HEAD_TILTED',
  HEAD_POSITION_NORMAL = 'HEAD_POSITION_NORMAL',

  // Expression
  EXPRESSION_CONFUSED = 'EXPRESSION_CONFUSED',
  LIP_READING_DETECTED = 'LIP_READING_DETECTED',

  // Browser/Session (face tracking)
  TAB_SWITCHED_AWAY = 'TAB_SWITCHED_AWAY',
  TAB_RETURNED = 'TAB_RETURNED',
  WINDOW_BLUR = 'WINDOW_BLUR',
  WINDOW_FOCUS = 'WINDOW_FOCUS',
  MULTIPLE_FACES_DETECTED = 'MULTIPLE_FACES_DETECTED',

  // Face Verification
  VERIFICATION_STARTED = 'VERIFICATION_STARTED',
  VERIFICATION_SUCCESS = 'VERIFICATION_SUCCESS',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  VERIFICATION_ERROR = 'VERIFICATION_ERROR',

  // Client Events - Clipboard
  CLIPBOARD_COPY = 'CLIPBOARD_COPY',
  CLIPBOARD_PASTE = 'CLIPBOARD_PASTE',
  CLIPBOARD_CUT = 'CLIPBOARD_CUT',

  // Client Events - Visibility
  TAB_HIDDEN = 'TAB_HIDDEN',
  TAB_VISIBLE = 'TAB_VISIBLE',
  CLIENT_WINDOW_BLUR = 'CLIENT_WINDOW_BLUR',
  CLIENT_WINDOW_FOCUS = 'CLIENT_WINDOW_FOCUS',

  // Client Events - Keyboard
  DEVTOOLS_OPENED = 'DEVTOOLS_OPENED',
  PRINT_SCREEN = 'PRINT_SCREEN',

  // Client Events - Context
  CONTEXT_MENU = 'CONTEXT_MENU',

  // Client Events - Window
  FULLSCREEN_EXIT = 'FULLSCREEN_EXIT',
  WINDOW_RESIZE = 'WINDOW_RESIZE',

  // Client Events - Display
  MULTIPLE_DISPLAYS_DETECTED = 'MULTIPLE_DISPLAYS_DETECTED',
  DISPLAY_CHECK_DENIED = 'DISPLAY_CHECK_DENIED',
  DISPLAY_CHECK_UNSUPPORTED = 'DISPLAY_CHECK_UNSUPPORTED',

  // Chat Response Events
  AI_RESPONDED = 'AI_RESPONDED',
  USER_RESPONDED = 'USER_RESPONDED',
}

/**
 * Data structure for face recognition events
 */
export interface FaceRecognitionEventData {
  confidence: number;
  isMatch: boolean;
  message?: string;
}

/**
 * Head pose data
 */
export interface HeadPoseData {
  pitch: number;
  yaw: number;
  roll: number;
}

/**
 * Data structure for face tracking events
 */
export interface FaceTrackingEventData {
  message: string;
  details?: string;
  headPose?: HeadPoseData;
  gazeDirection?: string;
  mouthOpenness?: number;
  faceDetected?: boolean;
  faceCount?: number;
  eyeOpenness?: { left: number; right: number };
  squintLevel?: { left: number; right: number };
  blinkRate?: number;
  eyeClosureDuration?: number;
  headMovementCount?: number;
  browDown?: number;
  lipMovement?: number;
}

/**
 * Data structure for client events (copy/paste, tab switching, etc.)
 */
export interface ClientEventData {
  message: string;
  details?: string;
  severity: 'info' | 'warning' | 'critical';

  // Clipboard data
  clipboardLength?: number;
  hasText?: boolean;

  // Visibility data
  visibilityState?: string;
  hiddenDuration?: number;

  // Window data
  windowWidth?: number;
  windowHeight?: number;
  previousWidth?: number;
  previousHeight?: number;
  isFullscreen?: boolean;

  // Keyboard data
  key?: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };

  // Context
  targetElement?: string;
  url?: string;
}

/**
 * Data structure for chat response events
 */
export interface ChatEventData {
  message: string;
  role: 'user' | 'assistant';
  contentPreview?: string; // Truncated content for display
  contentLength?: number;
}

/**
 * Union type for all event data types.
 * Extend this as new event types are added.
 */
export type EventData =
  | FaceRecognitionEventData
  | FaceTrackingEventData
  | ClientEventData
  | ChatEventData;

@Schema({ timestamps: false })
export class SessionEvent {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, enum: EventType, index: true })
  type: EventType;

  @Prop({ required: true, default: () => new Date() })
  timestamp: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  data: EventData;

  @Prop({ type: MongooseSchema.Types.Mixed })
  rawData?: Record<string, unknown>;
}

export const SessionEventSchema = SchemaFactory.createForClass(SessionEvent);

// Create compound index for efficient queries
SessionEventSchema.index({ sessionId: 1, timestamp: -1 });
SessionEventSchema.index({ type: 1, timestamp: -1 });
