import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemConfig, SystemConfigSchema } from './config.schema';
import { SystemConfigService } from './config.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemConfig.name, schema: SystemConfigSchema },
    ]),
  ],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}

