import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { FaceModule } from '../face/face.module';

@Module({
  imports: [FaceModule],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}

