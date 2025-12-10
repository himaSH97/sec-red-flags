import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ type: Buffer })
  initialFaceImage: Buffer;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

