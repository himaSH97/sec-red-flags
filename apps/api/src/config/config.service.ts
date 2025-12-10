import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemConfig, SystemConfigDocument } from './config.schema';

export interface UpdateConfigDto {
  faceRecognitionEnabled?: boolean;
}

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);
  private readonly CONFIG_KEY = 'system';

  constructor(
    @InjectModel(SystemConfig.name)
    private configModel: Model<SystemConfigDocument>
  ) {}

  /**
   * Get the system configuration. Creates default config if it doesn't exist.
   */
  async getConfig(): Promise<SystemConfig> {
    let config = await this.configModel.findOne({ key: this.CONFIG_KEY }).exec();

    if (!config) {
      this.logger.log('No config found, creating default configuration');
      config = await this.configModel.create({
        key: this.CONFIG_KEY,
        faceRecognitionEnabled: true,
      });
    }

    return config;
  }

  /**
   * Update the system configuration
   */
  async updateConfig(updates: UpdateConfigDto): Promise<SystemConfig> {
    const config = await this.configModel
      .findOneAndUpdate(
        { key: this.CONFIG_KEY },
        { $set: updates },
        { new: true, upsert: true }
      )
      .exec();

    this.logger.log(`Config updated: ${JSON.stringify(updates)}`);
    return config;
  }

  /**
   * Check if face recognition is enabled
   */
  async isFaceRecognitionEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.faceRecognitionEnabled;
  }
}

