import { Controller, Get, Put, Body } from '@nestjs/common';
import { SystemConfigService, UpdateConfigDto } from '../config';

@Controller('admin')
export class AdminController {
  constructor(private readonly configService: SystemConfigService) {}

  /**
   * Get current system configuration
   * GET /admin/config
   */
  @Get('config')
  async getConfig() {
    return this.configService.getConfig();
  }

  /**
   * Update system configuration
   * PUT /admin/config
   */
  @Put('config')
  async updateConfig(@Body() updates: UpdateConfigDto) {
    return this.configService.updateConfig(updates);
  }
}
