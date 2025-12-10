import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from '../chat/chat.module';
import { FaceModule } from '../face/face.module';
import { SessionModule } from '../session/session.module';
import { KeystrokeModule } from '../keystroke/keystroke.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://secflags:secflags_dev@localhost:27017/secflags?authSource=admin',
        ),
      }),
      inject: [ConfigService],
    }),
    ChatModule,
    FaceModule,
    SessionModule,
    KeystrokeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
