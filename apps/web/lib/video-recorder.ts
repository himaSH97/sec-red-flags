/**
 * Video Recording Service
 *
 * Handles video recording using MediaRecorder API with:
 * - Chunked recording (configurable chunk duration)
 * - Resilient upload with retry logic
 * - Queue system for pending uploads
 * - Recovery after connection issues
 */

export interface VideoChunk {
  index: number;
  blob: Blob;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  retryCount: number;
  s3Key?: string;
  uploadUrl?: string;
}

export interface VideoRecorderConfig {
  chunkDurationMs: number; // Duration of each chunk in milliseconds
  maxRetries: number; // Maximum retry attempts for failed uploads
  retryDelayMs: number; // Base delay between retries (exponential backoff)
  mimeType: string; // Video MIME type
  videoBitsPerSecond: number; // Video bitrate
}

export interface VideoRecorderCallbacks {
  onRequestUrl: (chunkIndex: number) => void;
  onChunkUploaded: (chunkIndex: number, s3Key: string, size: number) => void;
  onError: (chunkIndex: number, error: string) => void;
  onStatusChange: (status: VideoRecorderStatus) => void;
}

export type VideoRecorderStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'error';

const DEFAULT_CONFIG: VideoRecorderConfig = {
  chunkDurationMs: 30000, // 30 seconds per chunk
  maxRetries: 3,
  retryDelayMs: 1000,
  mimeType: 'video/webm;codecs=vp8',
  videoBitsPerSecond: 500000, // 500 kbps - good balance of quality and size
};

class VideoRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private config: VideoRecorderConfig = DEFAULT_CONFIG;
  private callbacks: VideoRecorderCallbacks | null = null;
  private status: VideoRecorderStatus = 'idle';

  // Chunk management
  private currentChunkIndex = 0;
  private chunks: Map<number, VideoChunk> = new Map();
  private pendingUploads: Map<number, VideoChunk> = new Map();

  // URL responses from server (chunkIndex -> upload info)
  private urlResponses: Map<
    number,
    { url: string; s3Key: string; expiresIn: number }
  > = new Map();

  // Timers
  private chunkTimer: NodeJS.Timeout | null = null;
  private retryTimers: Map<number, NodeJS.Timeout> = new Map();

  /**
   * Initialize the video recorder with configuration and callbacks
   */
  initialize(
    callbacks: VideoRecorderCallbacks,
    config: Partial<VideoRecorderConfig> = {}
  ): void {
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[VideoRecorder] Initialized with config:', this.config);
  }

  /**
   * Start recording from a media stream
   */
  async start(stream: MediaStream): Promise<boolean> {
    if (this.status === 'recording') {
      console.warn('[VideoRecorder] Already recording');
      return false;
    }

    this.stream = stream;
    this.setStatus('starting');

    try {
      // Check if the MIME type is supported
      let mimeType = this.config.mimeType;
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn(
          `[VideoRecorder] ${mimeType} not supported, trying alternatives`
        );
        // Try alternatives
        const alternatives = [
          'video/webm;codecs=vp9',
          'video/webm',
          'video/mp4',
        ];
        for (const alt of alternatives) {
          if (MediaRecorder.isTypeSupported(alt)) {
            mimeType = alt;
            break;
          }
        }
      }

      console.log(`[VideoRecorder] Using MIME type: ${mimeType}`);

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: this.config.videoBitsPerSecond,
      });

      // Handle data available (chunk ready)
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.handleChunkReady(event.data);
        }
      };

      // Handle errors
      this.mediaRecorder.onerror = (event) => {
        console.error('[VideoRecorder] MediaRecorder error:', event);
        this.setStatus('error');
      };

      // Handle stop
      this.mediaRecorder.onstop = () => {
        console.log('[VideoRecorder] MediaRecorder stopped');
        this.setStatus('stopped');
      };

      // Start recording
      this.mediaRecorder.start();
      this.setStatus('recording');

      // Set up periodic chunk creation
      this.scheduleNextChunk();

      console.log('[VideoRecorder] Recording started');
      return true;
    } catch (error) {
      console.error('[VideoRecorder] Failed to start:', error);
      this.setStatus('error');
      return false;
    }
  }

  /**
   * Stop recording
   */
  stop(): void {
    if (this.status !== 'recording') {
      console.warn('[VideoRecorder] Not recording');
      return;
    }

    this.setStatus('stopping');

    // Clear chunk timer
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }

    // Request final data and stop
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.requestData();
      this.mediaRecorder.stop();
    }

    console.log('[VideoRecorder] Recording stopped');
  }

  /**
   * Schedule the next chunk
   */
  private scheduleNextChunk(): void {
    this.chunkTimer = setTimeout(() => {
      if (
        this.mediaRecorder &&
        this.mediaRecorder.state === 'recording' &&
        this.status === 'recording'
      ) {
        // Request current data (triggers ondataavailable)
        this.mediaRecorder.requestData();
        // Schedule next chunk
        this.scheduleNextChunk();
      }
    }, this.config.chunkDurationMs);
  }

  /**
   * Handle a recorded chunk
   */
  private handleChunkReady(blob: Blob): void {
    // Don't process chunks if we're stopped or idle
    if (this.status === 'stopped' || this.status === 'idle') {
      console.log(`[VideoRecorder] Ignoring chunk - status: ${this.status}`);
      return;
    }

    const chunk: VideoChunk = {
      index: this.currentChunkIndex,
      blob,
      status: 'pending',
      retryCount: 0,
    };

    console.log(
      `[VideoRecorder] Chunk ${chunk.index} ready, size: ${blob.size} bytes`
    );

    this.chunks.set(chunk.index, chunk);
    this.pendingUploads.set(chunk.index, chunk);
    this.currentChunkIndex++;

    // Request presigned URL from server
    this.requestUploadUrl(chunk.index);
  }

  /**
   * Request a presigned URL for uploading a chunk
   */
  private requestUploadUrl(chunkIndex: number): void {
    // Don't request if we're stopping or stopped
    if (this.status === 'stopping' || this.status === 'stopped' || this.status === 'idle') {
      console.log(`[VideoRecorder] Skipping URL request for chunk ${chunkIndex} - status: ${this.status}`);
      return;
    }
    console.log(`[VideoRecorder] Requesting URL for chunk ${chunkIndex}`);
    this.callbacks?.onRequestUrl(chunkIndex);
  }

  /**
   * Handle URL response from server
   */
  handleUrlResponse(
    chunkIndex: number,
    url: string,
    s3Key: string,
    expiresIn: number
  ): void {
    console.log(`[VideoRecorder] Received URL for chunk ${chunkIndex}`);

    this.urlResponses.set(chunkIndex, { url, s3Key, expiresIn });

    // Start upload if chunk is pending
    const chunk = this.pendingUploads.get(chunkIndex);
    if (chunk && chunk.status === 'pending') {
      chunk.uploadUrl = url;
      chunk.s3Key = s3Key;
      this.uploadChunk(chunk);
    }
  }

  /**
   * Handle URL error from server
   */
  handleUrlError(chunkIndex: number, error: string): void {
    console.error(
      `[VideoRecorder] URL error for chunk ${chunkIndex}: ${error}`
    );

    const chunk = this.pendingUploads.get(chunkIndex);
    if (chunk) {
      this.scheduleRetry(chunk);
    }
  }

  /**
   * Upload a chunk to S3
   */
  private async uploadChunk(chunk: VideoChunk): Promise<void> {
    if (!chunk.uploadUrl || !chunk.s3Key) {
      console.error(
        `[VideoRecorder] Missing upload URL for chunk ${chunk.index}`
      );
      return;
    }

    chunk.status = 'uploading';
    console.log(`[VideoRecorder] Uploading chunk ${chunk.index}...`);

    try {
      const response = await fetch(chunk.uploadUrl, {
        method: 'PUT',
        body: chunk.blob,
        headers: {
          'Content-Type': 'video/webm',
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      // Upload successful
      chunk.status = 'uploaded';
      this.pendingUploads.delete(chunk.index);

      console.log(
        `[VideoRecorder] Chunk ${chunk.index} uploaded successfully`
      );

      // Notify server
      this.callbacks?.onChunkUploaded(
        chunk.index,
        chunk.s3Key,
        chunk.blob.size
      );
    } catch (error) {
      console.error(
        `[VideoRecorder] Upload failed for chunk ${chunk.index}:`,
        error
      );
      chunk.status = 'failed';
      this.scheduleRetry(chunk);
    }
  }

  /**
   * Schedule a retry for a failed chunk
   */
  private scheduleRetry(chunk: VideoChunk): void {
    if (chunk.retryCount >= this.config.maxRetries) {
      console.error(
        `[VideoRecorder] Max retries exceeded for chunk ${chunk.index}`
      );
      chunk.status = 'failed';
      this.callbacks?.onError(
        chunk.index,
        `Failed after ${this.config.maxRetries} attempts`
      );
      return;
    }

    chunk.retryCount++;
    chunk.status = 'pending';

    // Exponential backoff
    const delay = this.config.retryDelayMs * Math.pow(2, chunk.retryCount - 1);

    console.log(
      `[VideoRecorder] Scheduling retry ${chunk.retryCount} for chunk ${chunk.index} in ${delay}ms`
    );

    const timer = setTimeout(() => {
      this.retryTimers.delete(chunk.index);
      // Request new URL (old one might have expired)
      this.requestUploadUrl(chunk.index);
    }, delay);

    this.retryTimers.set(chunk.index, timer);
  }

  /**
   * Resume uploads after reconnection
   */
  resumeUploads(): void {
    console.log('[VideoRecorder] Resuming pending uploads...');

    // Retry all pending uploads
    for (const [, chunk] of this.pendingUploads) {
      if (chunk.status === 'pending' || chunk.status === 'failed') {
        chunk.retryCount = 0; // Reset retry count on reconnection
        this.requestUploadUrl(chunk.index);
      }
    }
  }

  /**
   * Get the last successfully uploaded chunk index
   */
  getLastUploadedChunkIndex(): number {
    let lastIndex = -1;
    for (const [index, chunk] of this.chunks) {
      if (chunk.status === 'uploaded' && index > lastIndex) {
        lastIndex = index;
      }
    }
    return lastIndex;
  }

  /**
   * Get current recording status
   */
  getStatus(): VideoRecorderStatus {
    return this.status;
  }

  /**
   * Get pending upload count
   */
  getPendingCount(): number {
    return this.pendingUploads.size;
  }

  /**
   * Get total chunk count
   */
  getTotalChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Set status and notify callback
   */
  private setStatus(status: VideoRecorderStatus): void {
    this.status = status;
    this.callbacks?.onStatusChange(status);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Set status immediately to prevent any further processing
    this.status = 'idle';

    // Stop recording if active
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
    }

    // Clear timers
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }

    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();

    // Reset state
    this.mediaRecorder = null;
    this.stream = null;
    this.currentChunkIndex = 0;
    this.chunks.clear();
    this.pendingUploads.clear();
    this.urlResponses.clear();
    this.callbacks = null;

    console.log('[VideoRecorder] Destroyed');
  }
}

// Export singleton instance
export const videoRecorderService = new VideoRecorderService();

