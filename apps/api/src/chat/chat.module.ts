import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { FaceModule } from '../face/face.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [FaceModule, SessionModule],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}

