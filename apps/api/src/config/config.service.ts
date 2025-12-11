import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemConfig, SystemConfigDocument } from './config.schema';

export interface UpdateConfigDto {
  faceRecognitionEnabled?: boolean;
  screenShareEnabled?: boolean;
  multiDisplayCheckEnabled?: boolean;
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
   * Also ensures new fields have default values for existing documents.
   */
  async getConfig(): Promise<SystemConfig> {
    let config = await this.configModel
      .findOne({ key: this.CONFIG_KEY })
      .exec();

    if (!config) {
      this.logger.log('No config found, creating default configuration');
      config = await this.configModel.create({
        key: this.CONFIG_KEY,
        faceRecognitionEnabled: true,
        screenShareEnabled: true,
        multiDisplayCheckEnabled: true,
      });
    } else {
      // Check if existing document is missing new fields and update if needed
      const needsUpdate =
        config.screenShareEnabled === undefined ||
        config.multiDisplayCheckEnabled === undefined;

      if (needsUpdate) {
        this.logger.log('Migrating config with new default fields');
        config = await this.configModel
          .findOneAndUpdate(
            { key: this.CONFIG_KEY },
            {
              $set: {
                screenShareEnabled: config.screenShareEnabled ?? true,
                multiDisplayCheckEnabled:
                  config.multiDisplayCheckEnabled ?? true,
              },
            },
            { new: true }
          )
          .exec();
      }
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

  /**
   * Check if screen sharing is enabled
   */
  async isScreenShareEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.screenShareEnabled;
  }

  /**
   * Check if multi-display check is enabled
   */
  async isMultiDisplayCheckEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.multiDisplayCheckEnabled;
  }
}
