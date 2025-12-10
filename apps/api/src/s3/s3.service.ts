import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface VideoChunkInfo {
  index: number;
  s3Key: string;
  size?: number;
  lastModified?: Date;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly presignedUrlExpiry: number;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('S3_ENDPOINT'); // For MinIO or other S3-compatible services

    this.bucketName = this.configService.get<string>('S3_BUCKET_NAME', 'sec-flags-videos');
    this.presignedUrlExpiry = this.configService.get<number>('S3_PRESIGNED_URL_EXPIRY', 300);

    // Configure S3 client
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region,
    };

    // Add custom endpoint for MinIO or other S3-compatible services
    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true; // Required for MinIO
    }

    // Only add credentials if they're provided (allows for IAM roles in production)
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    this.s3Client = new S3Client(clientConfig);
    this.logger.log(`S3 Service initialized for bucket: ${this.bucketName}${endpoint ? ` (endpoint: ${endpoint})` : ''}`);
  }

  /**
   * Generate S3 key for a video chunk
   */
  private getChunkKey(sessionId: string, chunkIndex: number): string {
    return `sessions/${sessionId}/chunks/${String(chunkIndex).padStart(5, '0')}.webm`;
  }

  /**
   * Generate a presigned URL for uploading a video chunk
   */
  async generateUploadUrl(
    sessionId: string,
    chunkIndex: number,
  ): Promise<{ url: string; s3Key: string; expiresIn: number }> {
    const s3Key = this.getChunkKey(sessionId, chunkIndex);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: 'video/webm',
    });

    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: this.presignedUrlExpiry,
    });

    this.logger.log(
      `Generated presigned upload URL for session ${sessionId}, chunk ${chunkIndex}`,
    );

    return {
      url,
      s3Key,
      expiresIn: this.presignedUrlExpiry,
    };
  }

  /**
   * Generate a presigned URL for downloading/viewing a video chunk
   */
  async generateDownloadUrl(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: this.presignedUrlExpiry,
    });

    return url;
  }

  /**
   * List all video chunks for a session
   */
  async getVideoChunks(sessionId: string): Promise<VideoChunkInfo[]> {
    const prefix = `sessions/${sessionId}/chunks/`;

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const response = await this.s3Client.send(command);
    const chunks: VideoChunkInfo[] = [];

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key) {
          // Extract chunk index from key (e.g., "sessions/xxx/chunks/00001.webm" -> 1)
          const match = object.Key.match(/(\d+)\.webm$/);
          if (match) {
            chunks.push({
              index: parseInt(match[1], 10),
              s3Key: object.Key,
              size: object.Size,
              lastModified: object.LastModified,
            });
          }
        }
      }
    }

    // Sort by index
    chunks.sort((a, b) => a.index - b.index);

    this.logger.log(
      `Found ${chunks.length} video chunks for session ${sessionId}`,
    );

    return chunks;
  }

  /**
   * Check if a specific chunk exists
   */
  async chunkExists(sessionId: string, chunkIndex: number): Promise<boolean> {
    const s3Key = this.getChunkKey(sessionId, chunkIndex);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get the bucket name (for reference)
   */
  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * Get a video chunk as a readable stream
   */
  async getVideoChunkStream(s3Key: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength?: number;
  }> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    return {
      stream: response.Body as NodeJS.ReadableStream,
      contentType: response.ContentType || 'video/webm',
      contentLength: response.ContentLength,
    };
  }
}

