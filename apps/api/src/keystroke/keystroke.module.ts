import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KeystrokeBatch, KeystrokeBatchSchema } from './keystroke.schema';
import { KeystrokeService } from './keystroke.service';
import { KeystrokeAnalyticsService } from './keystroke-analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KeystrokeBatch.name, schema: KeystrokeBatchSchema },
    ]),
  ],
  providers: [KeystrokeService, KeystrokeAnalyticsService],
  exports: [KeystrokeService, KeystrokeAnalyticsService],
})
export class KeystrokeModule {}

