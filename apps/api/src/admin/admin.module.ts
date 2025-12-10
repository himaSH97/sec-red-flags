import { Module } from '@nestjs/common';
import { SystemConfigModule } from '../config';
import { AdminController } from './admin.controller';

@Module({
  imports: [SystemConfigModule],
  controllers: [AdminController],
})
export class AdminModule {}

