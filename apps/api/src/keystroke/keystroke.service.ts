import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  KeystrokeBatch,
  KeystrokeBatchDocument,
  Keystroke,
} from './keystroke.schema';

/**
 * Payload received from frontend for keystroke batch
 */
export interface KeystrokeBatchPayload {
  sessionId: string;
  batchIndex: number;
  keystrokes: Keystroke[];
  startTime: number;
  endTime: number;
}

@Injectable()
export class KeystrokeService {
  private readonly logger = new Logger(KeystrokeService.name);

  constructor(
    @InjectModel(KeystrokeBatch.name)
    private keystrokeBatchModel: Model<KeystrokeBatchDocument>,
  ) {}

  /**
   * Save a batch of keystrokes
   */
  async saveBatch(payload: KeystrokeBatchPayload): Promise<KeystrokeBatchDocument> {
    const batch = new this.keystrokeBatchModel({
      sessionId: payload.sessionId,
      batchIndex: payload.batchIndex,
      keystrokes: payload.keystrokes,
      startTime: new Date(payload.startTime),
      endTime: new Date(payload.endTime),
      keystrokeCount: payload.keystrokes.length,
    });

    const savedBatch = await batch.save();
    this.logger.log(
      `Saved keystroke batch #${payload.batchIndex} for session ${payload.sessionId} (${payload.keystrokes.length} keystrokes)`,
    );
    return savedBatch;
  }

  /**
   * Get all keystroke batches for a session
   */
  async getBatchesBySession(sessionId: string): Promise<KeystrokeBatchDocument[]> {
    return this.keystrokeBatchModel
      .find({ sessionId })
      .sort({ batchIndex: 1 })
      .exec();
  }

  /**
   * Get all keystrokes for a session (flattened from batches)
   */
  async getKeystrokesBySession(sessionId: string): Promise<Keystroke[]> {
    const batches = await this.getBatchesBySession(sessionId);
    return batches.flatMap((batch) => batch.keystrokes);
  }

  /**
   * Get keystroke count for a session
   */
  async getKeystrokeCount(sessionId: string): Promise<number> {
    const result = await this.keystrokeBatchModel.aggregate([
      { $match: { sessionId } },
      { $group: { _id: null, total: { $sum: '$keystrokeCount' } } },
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Get keystroke statistics for a session
   */
  async getKeystrokeStats(sessionId: string): Promise<{
    totalKeystrokes: number;
    totalBatches: number;
    startTime: Date | null;
    endTime: Date | null;
    durationMs: number;
  }> {
    const batches = await this.getBatchesBySession(sessionId);
    
    if (batches.length === 0) {
      return {
        totalKeystrokes: 0,
        totalBatches: 0,
        startTime: null,
        endTime: null,
        durationMs: 0,
      };
    }

    const totalKeystrokes = batches.reduce(
      (sum, batch) => sum + batch.keystrokeCount,
      0,
    );
    const startTime = batches[0].startTime;
    const endTime = batches[batches.length - 1].endTime;
    const durationMs = endTime.getTime() - startTime.getTime();

    return {
      totalKeystrokes,
      totalBatches: batches.length,
      startTime,
      endTime,
      durationMs,
    };
  }

  /**
   * Delete all keystroke batches for a session
   */
  async deleteBySession(sessionId: string): Promise<void> {
    const result = await this.keystrokeBatchModel
      .deleteMany({ sessionId })
      .exec();
    this.logger.log(
      `Deleted ${result.deletedCount} keystroke batches for session ${sessionId}`,
    );
  }
}

