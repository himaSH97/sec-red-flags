import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

// Video chunk tracking subdocument
export class VideoChunk {
  @Prop({ required: true })
  index: number;

  @Prop({ required: true })
  s3Key: string;

  @Prop({ required: true })
  uploadedAt: Date;

  @Prop()
  size?: number;
}

// Video recording status
export type VideoStatus = 'idle' | 'recording' | 'completed' | 'failed';

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ type: Buffer })
  initialFaceImage: Buffer;

  // Video recording fields
  @Prop({ type: String, enum: ['idle', 'recording', 'completed', 'failed'], default: 'idle' })
  videoStatus: VideoStatus;

  @Prop({ type: [{ index: Number, s3Key: String, uploadedAt: Date, size: Number }], default: [] })
  videoChunks: VideoChunk[];

  @Prop()
  videoStartedAt?: Date;

  @Prop()
  videoEndedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
