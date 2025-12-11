import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  NotFoundException,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { SessionService } from './session.service';
import { KeystrokeAnalyticsService } from '../keystroke/keystroke-analytics.service';
import { S3Service } from '../s3/s3.service';

@Controller('sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly keystrokeAnalyticsService: KeystrokeAnalyticsService,
    private readonly s3Service: S3Service
  ) {}

  /**
   * Get paginated list of sessions
   * GET /sessions?page=1&limit=10
   */
  @Get()
  async getSessions(@Query('page') page = '1', @Query('limit') limit = '10') {
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
    const analysis = await this.keystrokeAnalyticsService.analyzeSession(
      sessionId
    );

    if (!analysis) {
      throw new NotFoundException(
        `No keystroke data found for session ${sessionId}`
      );
    }

    return analysis;
  }

  /**
   * Get video chunks with download URLs (proxied through API)
   * GET /sessions/:sessionId/video-chunks
   */
  @Get(':sessionId/video-chunks')
  async getVideoChunks(@Param('sessionId') sessionId: string) {
    const session = await this.sessionService.getSessionById(sessionId);

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Get chunks from session metadata
    const chunks = await this.sessionService.getVideoChunks(sessionId);

    if (!chunks || chunks.length === 0) {
      return {
        sessionId,
        videoStatus: session.videoStatus || 'idle',
        videoStartedAt: session.videoStartedAt,
        videoEndedAt: session.videoEndedAt,
        chunks: [],
        totalDurationMs: 0,
        chunkDurationMs: 30000, // Default chunk duration
      };
    }

    // Generate API proxy URLs for each chunk (avoids CORS issues)
    const chunksWithUrls = chunks.map((chunk) => ({
      index: chunk.index,
      s3Key: chunk.s3Key,
      size: chunk.size,
      uploadedAt: chunk.uploadedAt,
      // Use API proxy endpoint instead of direct S3 URL
      downloadUrl: `/api/sessions/${sessionId}/video/${chunk.index}`,
    }));

    // Calculate total duration (each chunk is ~30 seconds)
    const chunkDurationMs = 30000;
    const totalDurationMs = chunks.length * chunkDurationMs;

    return {
      sessionId,
      videoStatus: session.videoStatus || 'idle',
      videoStartedAt: session.videoStartedAt,
      videoEndedAt: session.videoEndedAt,
      chunks: chunksWithUrls,
      totalDurationMs,
      chunkDurationMs,
    };
  }

  /**
   * Stream a video chunk (proxy to S3)
   * GET /sessions/:sessionId/video/:chunkIndex
   */
  @Get(':sessionId/video/:chunkIndex')
  @Header('Accept-Ranges', 'bytes')
  @Header('Access-Control-Allow-Origin', '*')
  async streamVideoChunk(
    @Param('sessionId') sessionId: string,
    @Param('chunkIndex') chunkIndex: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const session = await this.sessionService.getSessionById(sessionId);

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const chunks = await this.sessionService.getVideoChunks(sessionId);
    const chunkIdx = parseInt(chunkIndex, 10);
    const chunk = chunks.find((c) => c.index === chunkIdx);

    if (!chunk) {
      throw new NotFoundException(`Video chunk ${chunkIndex} not found`);
    }

    try {
      const { stream, contentType, contentLength } =
        await this.s3Service.getVideoChunkStream(chunk.s3Key);

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="chunk-${chunkIndex}.webm"`,
        'Cache-Control': 'public, max-age=86400', // Cache for 1 day
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers':
          'Content-Length, Content-Range, Accept-Ranges',
      });

      if (contentLength) {
        res.set('Content-Length', contentLength.toString());
      }

      return new StreamableFile(stream as any);
    } catch (error) {
      console.error(`Failed to stream video chunk ${chunkIndex}:`, error);
      throw new NotFoundException(
        `Failed to retrieve video chunk ${chunkIndex}`
      );
    }
  }
}
