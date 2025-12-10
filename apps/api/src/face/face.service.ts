import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData = require('form-data');

export interface FaceCompareResult {
  confidence: number;
  isMatch: boolean;
  thresholds: {
    '1e-3': number;
    '1e-4': number;
    '1e-5': number;
  };
  faces: {
    face1: { faceToken: string } | null;
    face2: { faceToken: string } | null;
  };
}

export interface FaceSession {
  clientId: string;
  referenceImage: string; // base64
  createdAt: Date;
  lastVerified: Date | null;
  verificationCount: number;
  failedAttempts: number;
}

@Injectable()
export class FaceService {
  private readonly logger = new Logger(FaceService.name);
  private readonly apiUrl = 'https://api-us.faceplusplus.com/facepp/v3/compare';
  private sessions: Map<string, FaceSession> = new Map();

  constructor(private configService: ConfigService) {}

  private get apiKey(): string {
    return this.configService.get<string>('FACEPP_API_KEY', '');
  }

  private get apiSecret(): string {
    return this.configService.get<string>('FACEPP_API_SECRET', '');
  }

  get confidenceThreshold(): number {
    return this.configService.get<number>('FACE_CONFIDENCE_THRESHOLD', 80);
  }

  get checkIntervalMs(): number {
    return this.configService.get<number>('FACE_CHECK_INTERVAL_MS', 60000);
  }

  /**
   * Store reference face for a client session
   */
  storeReferenceFace(clientId: string, imageBase64: string): FaceSession {
    const session: FaceSession = {
      clientId,
      referenceImage: imageBase64,
      createdAt: new Date(),
      lastVerified: null,
      verificationCount: 0,
      failedAttempts: 0,
    };
    this.sessions.set(clientId, session);
    this.logger.log(`Reference face stored for client: ${clientId}`);
    return session;
  }

  /**
   * Get face session for a client
   */
  getSession(clientId: string): FaceSession | undefined {
    return this.sessions.get(clientId);
  }

  /**
   * Remove face session for a client
   */
  removeSession(clientId: string): void {
    this.sessions.delete(clientId);
    this.logger.log(`Face session removed for client: ${clientId}`);
  }

  /**
   * Compare two face images using Face++ API
   */
  async compareFaces(
    imageBase64_1: string,
    imageBase64_2: string,
  ): Promise<FaceCompareResult> {
    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn('Face++ API credentials not configured, using mock response');
      return this.mockCompareResponse();
    }

    try {
      const formData = new FormData();
      formData.append('api_key', this.apiKey);
      formData.append('api_secret', this.apiSecret);
      formData.append('image_base64_1', this.cleanBase64(imageBase64_1));
      formData.append('image_base64_2', this.cleanBase64(imageBase64_2));

      const response = await axios.post(this.apiUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 30000,
      });

      const data = response.data;

      return {
        confidence: data.confidence || 0,
        isMatch: data.confidence >= this.confidenceThreshold,
        thresholds: data.thresholds || { '1e-3': 0, '1e-4': 0, '1e-5': 0 },
        faces: {
          face1: data.faces1?.[0] ? { faceToken: data.faces1[0].face_token } : null,
          face2: data.faces2?.[0] ? { faceToken: data.faces2[0].face_token } : null,
        },
      };
    } catch (error) {
      this.logger.error(`Face++ API error: ${error.message}`);
      
      if (error.response?.data) {
        this.logger.error(`Face++ API response: ${JSON.stringify(error.response.data)}`);
      }

      throw new Error(`Face comparison failed: ${error.message}`);
    }
  }

  /**
   * Verify a face against the stored reference for a client
   */
  async verifyFace(clientId: string, currentImageBase64: string): Promise<{
    success: boolean;
    confidence: number;
    isMatch: boolean;
    message: string;
    rawResult?: FaceCompareResult;
  }> {
    const session = this.sessions.get(clientId);

    if (!session) {
      return {
        success: false,
        confidence: 0,
        isMatch: false,
        message: 'No reference face found for this session',
      };
    }

    try {
      const result = await this.compareFaces(
        session.referenceImage,
        currentImageBase64,
      );

      // Update session stats
      session.lastVerified = new Date();
      session.verificationCount++;

      if (result.isMatch) {
        session.failedAttempts = 0; // Reset on success
        this.logger.log(
          `Face verified for client ${clientId}: ${result.confidence.toFixed(1)}% confidence`,
        );
      } else {
        session.failedAttempts++;
        this.logger.warn(
          `Face verification failed for client ${clientId}: ${result.confidence.toFixed(1)}% confidence (attempt ${session.failedAttempts})`,
        );
      }

      return {
        success: true,
        confidence: result.confidence,
        isMatch: result.isMatch,
        message: result.isMatch
          ? 'Face verified successfully'
          : `Face does not match (${result.confidence.toFixed(1)}% < ${this.confidenceThreshold}% threshold)`,
        rawResult: result,
      };
    } catch (error) {
      this.logger.error(`Verification error for client ${clientId}: ${error.message}`);
      return {
        success: false,
        confidence: 0,
        isMatch: false,
        message: error.message,
      };
    }
  }

  /**
   * Clean base64 string (remove data URL prefix if present)
   */
  private cleanBase64(base64: string): string {
    return base64.replace(/^data:image\/\w+;base64,/, '');
  }

  /**
   * Mock response for development without API credentials
   */
  private mockCompareResponse(): FaceCompareResult {
    // Simulate a successful match with random confidence between 85-98%
    const confidence = 85 + Math.random() * 13;
    return {
      confidence,
      isMatch: confidence >= this.confidenceThreshold,
      thresholds: { '1e-3': 62.327, '1e-4': 69.101, '1e-5': 73.975 },
      faces: {
        face1: { faceToken: 'mock-token-1' },
        face2: { faceToken: 'mock-token-2' },
      },
    };
  }
}

