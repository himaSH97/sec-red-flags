import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Session, SessionSchema } from './session.schema';
import { SessionEvent, SessionEventSchema } from './session-event.schema';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { KeystrokeModule } from '../keystroke/keystroke.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: SessionEvent.name, schema: SessionEventSchema },
    ]),
    forwardRef(() => KeystrokeModule),
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}

