import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SystemConfigDocument = HydratedDocument<SystemConfig>;

@Schema({ timestamps: true })
export class SystemConfig {
  @Prop({ required: true, unique: true, default: 'system' })
  key: string;

  @Prop({ required: true, default: true })
  faceRecognitionEnabled: boolean;

  @Prop({ required: true, default: true })
  screenShareEnabled: boolean;

  @Prop({ required: true, default: true })
  multiDisplayCheckEnabled: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SystemConfigSchema = SchemaFactory.createForClass(SystemConfig);
