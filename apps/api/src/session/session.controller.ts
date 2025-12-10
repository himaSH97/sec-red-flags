import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { SessionService } from './session.service';
import { KeystrokeAnalyticsService } from '../keystroke/keystroke-analytics.service';

@Controller('sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly keystrokeAnalyticsService: KeystrokeAnalyticsService,
  ) {}

  /**
   * Get paginated list of sessions
   * GET /sessions?page=1&limit=10
   */
  @Get()
  async getSessions(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    return this.sessionService.getAllSessions(pageNum, limitNum);
  }

  /**
   * Get a single session by ID
   * GET /sessions/:sessionId
   */
  @Get(':sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    return this.sessionService.getSessionById(sessionId);
  }

  /**
   * Get all events for a session
   * GET /sessions/:sessionId/events
   */
  @Get(':sessionId/events')
  async getSessionEvents(@Param('sessionId') sessionId: string) {
    return this.sessionService.getSessionEvents(sessionId);
  }

  /**
   * Get typing rhythm analysis for a session
   * GET /sessions/:sessionId/typing-analysis
   */
  @Get(':sessionId/typing-analysis')
  async getTypingAnalysis(@Param('sessionId') sessionId: string) {
    const analysis = await this.keystrokeAnalyticsService.analyzeSession(sessionId);
    
    if (!analysis) {
      throw new NotFoundException(`No keystroke data found for session ${sessionId}`);
    }
    
    return analysis;
  }
}

