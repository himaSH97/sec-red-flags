import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type KeystrokeBatchDocument = HydratedDocument<KeystrokeBatch>;

/**
 * Individual keystroke data
 */
export interface Keystroke {
  key: string;              // The key pressed (e.g., "a", "Enter", "Backspace")
  code: string;             // Physical key code (e.g., "KeyA", "Enter")
  timestamp: number;        // Unix timestamp in ms
  modifiers: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
  targetType: string;       // Input type: "text", "textarea", "password", "other"
  isPassword: boolean;      // True if typed in password field (key will be masked)
}

/**
 * Batch of keystrokes for a session
 * Keystrokes are batched to reduce database writes
 */
@Schema({ timestamps: true, collection: 'keystroke_batches' })
export class KeystrokeBatch {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true })
  batchIndex: number;

  @Prop({ type: [MongooseSchema.Types.Mixed], required: true })
  keystrokes: Keystroke[];

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ required: true })
  keystrokeCount: number;
}

export const KeystrokeBatchSchema = SchemaFactory.createForClass(KeystrokeBatch);

// Create compound index for efficient queries
KeystrokeBatchSchema.index({ sessionId: 1, batchIndex: 1 });
KeystrokeBatchSchema.index({ sessionId: 1, startTime: 1 });

