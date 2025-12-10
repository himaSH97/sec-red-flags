import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Session, SessionSchema } from './session.schema';
import { SessionEvent, SessionEventSchema } from './session-event.schema';
import { SessionService } from './session.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: SessionEvent.name, schema: SessionEventSchema },
    ]),
  ],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}

