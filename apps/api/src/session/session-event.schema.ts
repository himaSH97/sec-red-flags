import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type SessionEventDocument = HydratedDocument<SessionEvent>;

/**
 * Extensible enum for event types.
 * Add new event types here as needed.
 */
export enum EventType {
  FACE_RECOGNITION = 'FACE_RECOGNITION',
  // Future event types can be added here:
  // SESSION_START = 'SESSION_START',
  // SESSION_END = 'SESSION_END',
  // CHAT_MESSAGE = 'CHAT_MESSAGE',
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
 * Union type for all event data types.
 * Extend this as new event types are added.
 */
export type EventData = FaceRecognitionEventData;

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

