import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { FaceModule } from '../face/face.module';
import { SessionModule } from '../session/session.module';
import { KeystrokeModule } from '../keystroke/keystroke.module';
import { S3Module } from '../s3/s3.module';
import { SystemConfigModule } from '../config';

@Module({
  imports: [FaceModule, SessionModule, KeystrokeModule, S3Module, SystemConfigModule],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}

