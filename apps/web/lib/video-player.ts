/**
 * Video Player Service
 *
 * Handles joining WebM video chunks using MediaSource API for seamless playback.
 * Supports seeking across chunk boundaries.
 */

import { VideoChunk } from './api';

export interface VideoPlayerConfig {
  chunkDurationMs: number; // Duration of each chunk in milliseconds
}

export type VideoPlayerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error';

export interface VideoPlayerCallbacks {
  onStatusChange?: (status: VideoPlayerStatus) => void;
  onTimeUpdate?: (currentTimeMs: number) => void;
  onDurationChange?: (durationMs: number) => void;
  onError?: (error: string) => void;
  onChunkLoaded?: (loadedCount: number, totalChunks: number) => void;
  onLoadingProgress?: (progress: number) => void;
}

const DEFAULT_CONFIG: VideoPlayerConfig = {
  chunkDurationMs: 30000, // 30 seconds per chunk
};

// Supported codecs for WebM in order of preference
// VP8 first since that's commonly used by MediaRecorder
const WEBM_CODECS = [
  'video/webm; codecs="vp8"',
  'video/webm; codecs="vp8, opus"',
  'video/webm; codecs="vp8, vorbis"',
  'video/webm; codecs="vp9"',
  'video/webm; codecs="vp9, opus"',
  'video/webm',
];

class VideoPlayerService {
  private videoElement: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private chunks: VideoChunk[] = [];
  private loadedChunks: Set<number> = new Set();
  private chunkQueue: number[] = [];
  private isAppending = false;
  private isLoading = false; // Guard against multiple load calls
  private config: VideoPlayerConfig = DEFAULT_CONFIG;
  private callbacks: VideoPlayerCallbacks = {};
  private status: VideoPlayerStatus = 'idle';
  private totalDurationMs = 0;
  private videoStartTime: Date | null = null;
  private mimeType: string = '';
  private abortController: AbortController | null = null;
  private sourceOpenHandled = false; // Guard against multiple sourceopen events

  /**
   * Initialize the video player with configuration and callbacks
   */
  initialize(
    videoElement: HTMLVideoElement,
    callbacks: VideoPlayerCallbacks = {},
    config: Partial<VideoPlayerConfig> = {}
  ): void {
    // Clean up any existing state
    this.destroy();

    this.videoElement = videoElement;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Set up video element event listeners
    this.setupVideoEventListeners();

    console.log('[VideoPlayer] Initialized');
  }

  /**
   * Set up event listeners on the video element
   */
  private setupVideoEventListeners(): void {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('timeupdate', this.handleTimeUpdate);
    this.videoElement.addEventListener('play', this.handlePlay);
    this.videoElement.addEventListener('pause', this.handlePause);
    this.videoElement.addEventListener('error', this.handleError);
    this.videoElement.addEventListener('durationchange', this.handleDurationChange);
  }

  private handleTimeUpdate = () => {
    if (this.videoElement) {
      const currentTimeMs = this.videoElement.currentTime * 1000;
      this.callbacks.onTimeUpdate?.(currentTimeMs);
    }
  };

  private handlePlay = () => {
    this.setStatus('playing');
  };

  private handlePause = () => {
    this.setStatus('paused');
  };

  private handleError = (e: Event) => {
    const errorMessage = this.videoElement?.error?.message || 'Unknown';
    console.error('[VideoPlayer] Video element error:', e, this.videoElement?.error);
    
    // If it's a codec mismatch error and we're using MediaSource, try direct playback
    if (errorMessage.includes('codec') && this.mediaSource) {
      console.log('[VideoPlayer] Codec mismatch detected, falling back to direct playback');
      this.loadDirectPlayback();
      return;
    }
    
    this.callbacks.onError?.(`Video playback error: ${errorMessage}`);
    this.setStatus('error');
  };

  private handleDurationChange = () => {
    if (this.videoElement && this.videoElement.duration && isFinite(this.videoElement.duration)) {
      const durationMs = this.videoElement.duration * 1000;
      this.callbacks.onDurationChange?.(durationMs);
    }
  };

  /**
   * Check if MediaSource API is supported
   */
  private isMediaSourceSupported(): boolean {
    return 'MediaSource' in window && typeof MediaSource.isTypeSupported === 'function';
  }

  /**
   * Find a supported codec for WebM
   */
  private findSupportedCodec(): string | null {
    for (const codec of WEBM_CODECS) {
      if (MediaSource.isTypeSupported(codec)) {
        console.log(`[VideoPlayer] Found supported codec: ${codec}`);
        return codec;
      }
    }
    return null;
  }

  /**
   * Load video chunks and prepare for playback using MediaSource API
   */
  async load(
    chunks: VideoChunk[],
    videoStartTime?: Date,
    totalDurationMs?: number
  ): Promise<boolean> {
    // Guard against multiple load calls
    if (this.isLoading) {
      console.warn('[VideoPlayer] Already loading, ignoring duplicate load call');
      return false;
    }

    if (!this.videoElement) {
      console.error('[VideoPlayer] Video element not initialized');
      return false;
    }

    if (chunks.length === 0) {
      console.warn('[VideoPlayer] No chunks to load');
      this.setStatus('error');
      this.callbacks.onError?.('No video chunks available');
      return false;
    }

    this.isLoading = true;
    console.log(`[VideoPlayer] Loading ${chunks.length} chunks`);

    this.setStatus('loading');
    this.chunks = chunks.sort((a, b) => a.index - b.index);
    this.loadedChunks.clear();
    this.chunkQueue = [];
    this.sourceOpenHandled = false;
    this.videoStartTime = videoStartTime || null;
    this.totalDurationMs = totalDurationMs || chunks.length * this.config.chunkDurationMs;
    this.abortController = new AbortController();

    // Check if chunks have valid URLs
    if (!chunks[0].downloadUrl) {
      console.error('[VideoPlayer] Chunks missing download URLs');
      this.setStatus('error');
      this.callbacks.onError?.('Video chunks missing download URLs');
      return false;
    }

    // Check MediaSource support
    if (!this.isMediaSourceSupported()) {
      console.warn('[VideoPlayer] MediaSource API not supported, falling back to direct playback');
      return this.loadDirectPlayback();
    }

    // Find supported codec
    this.mimeType = this.findSupportedCodec() || '';
    if (!this.mimeType) {
      console.warn('[VideoPlayer] No supported WebM codec found, falling back to direct playback');
      return this.loadDirectPlayback();
    }

    // Use MediaSource API for seamless playback
    console.log('[VideoPlayer] Using MediaSource API for seamless playback');
    return this.loadWithMediaSource();
  }

  /**
   * Load video using MediaSource API for seamless multi-chunk playback
   */
  private loadWithMediaSource(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.videoElement) {
        resolve(false);
        return;
      }

      try {
        // Create new MediaSource
        this.mediaSource = new MediaSource();

        // Create object URL and set as video source
        this.objectUrl = URL.createObjectURL(this.mediaSource);
        this.videoElement.src = this.objectUrl;

        // Handle sourceopen event - only once
        this.mediaSource.addEventListener('sourceopen', async () => {
          // Guard against multiple sourceopen events
          if (this.sourceOpenHandled) {
            console.warn('[VideoPlayer] sourceopen already handled, ignoring');
            return;
          }
          this.sourceOpenHandled = true;
          console.log('[VideoPlayer] MediaSource opened');

          try {
            // Create SourceBuffer with the detected codec
            this.sourceBuffer = this.mediaSource!.addSourceBuffer(this.mimeType);
            this.sourceBuffer.mode = 'sequence'; // Append in sequence mode for chunks

            // Set up SourceBuffer event handlers
            this.sourceBuffer.addEventListener('updateend', this.handleSourceBufferUpdateEnd);
            this.sourceBuffer.addEventListener('error', this.handleSourceBufferError);

            // Queue all chunks for loading (only if not already queued)
            if (this.chunkQueue.length === 0 && this.loadedChunks.size === 0) {
              this.chunkQueue = this.chunks.map((_, index) => index);
              console.log(`[VideoPlayer] Queued ${this.chunkQueue.length} chunks for loading`);
            }

            // Start loading chunks
            this.processChunkQueue();
            resolve(true);
          } catch (error) {
            console.error('[VideoPlayer] Failed to create SourceBuffer:', error);
            this.callbacks.onError?.(`Failed to create video buffer: ${error}`);
            // Fall back to direct playback
            resolve(await this.loadDirectPlayback());
          }
        });

        this.mediaSource.addEventListener('sourceended', () => {
          console.log('[VideoPlayer] MediaSource ended');
        });

        this.mediaSource.addEventListener('sourceclose', () => {
          console.log('[VideoPlayer] MediaSource closed');
        });

        this.mediaSource.addEventListener('error', (e) => {
          console.error('[VideoPlayer] MediaSource error:', e);
          this.callbacks.onError?.('MediaSource error');
          this.setStatus('error');
          resolve(false);
        });
      } catch (error) {
        console.error('[VideoPlayer] Failed to create MediaSource:', error);
        resolve(this.loadDirectPlayback());
      }
    });
  }

  private handleSourceBufferUpdateEnd = () => {
    this.isAppending = false;
    console.log(`[VideoPlayer] updateend: loaded=${this.loadedChunks.size}/${this.chunks.length}, queue=${this.chunkQueue.length}`);

    // Check if all chunks are loaded
    if (this.loadedChunks.size === this.chunks.length) {
      if (this.chunkQueue.length === 0) {
        this.finalizeLoading();
      }
      // Don't process queue if all chunks are loaded
      return;
    }
    
    // Process next chunk in queue
    if (this.chunkQueue.length > 0) {
      this.processChunkQueue();
    }
  };

  private handleSourceBufferError = (e: Event) => {
    console.error('[VideoPlayer] SourceBuffer error:', e);
    this.isAppending = false;
  };

  /**
   * Wait for the SourceBuffer to be ready for appending
   */
  private waitForSourceBuffer(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.sourceBuffer) {
          resolve();
          return;
        }
        
        if (!this.sourceBuffer.updating && this.mediaSource?.readyState === 'open') {
          resolve();
          return;
        }
        
        // Wait and check again
        setTimeout(check, 50);
      };
      
      check();
    });
  }

  /**
   * Process the chunk queue - fetch and append chunks sequentially
   */
  private async processChunkQueue(): Promise<void> {
    // Don't process if already appending or no chunks in queue
    if (this.isAppending || this.chunkQueue.length === 0 || !this.sourceBuffer) {
      return;
    }

    // Check if sourceBuffer is updating
    if (this.sourceBuffer.updating) {
      return;
    }

    const chunkIndex = this.chunkQueue.shift();
    if (chunkIndex === undefined) return;

    // Skip if already loaded
    if (this.loadedChunks.has(chunkIndex)) {
      console.log(`[VideoPlayer] Chunk ${chunkIndex} already loaded, skipping`);
      this.processChunkQueue();
      return;
    }

    const chunk = this.chunks[chunkIndex];
    if (!chunk) {
      console.error(`[VideoPlayer] Chunk at index ${chunkIndex} not found`);
      this.processChunkQueue();
      return;
    }

    try {
      this.isAppending = true;
      console.log(`[VideoPlayer] Fetching chunk ${chunkIndex} (${chunk.index})`);

      // Fetch the chunk data - no credentials needed for video streaming
      const response = await fetch(chunk.downloadUrl, {
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'video/webm, video/*',
        },
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[VideoPlayer] Chunk ${chunkIndex} fetched, size: ${arrayBuffer.byteLength} bytes`);

      if (arrayBuffer.byteLength === 0) {
        throw new Error('Chunk is empty');
      }

      // Append to SourceBuffer - wait for it to be ready
      await this.waitForSourceBuffer();
      
      if (this.sourceBuffer && !this.sourceBuffer.updating && this.mediaSource?.readyState === 'open') {
        // Mark as loaded and append
        this.loadedChunks.add(chunkIndex);
        this.sourceBuffer.appendBuffer(arrayBuffer);

        console.log(`[VideoPlayer] Appending chunk ${chunkIndex + 1}/${this.chunks.length}`);
        this.callbacks.onChunkLoaded?.(this.loadedChunks.size, this.chunks.length);
        this.callbacks.onLoadingProgress?.(this.loadedChunks.size / this.chunks.length);

        // If this is the first chunk, we can mark as ready for playback
        if (this.loadedChunks.size === 1 && this.status === 'loading') {
          this.setStatus('ready');
        }
        // Note: isAppending will be set to false in handleSourceBufferUpdateEnd
      } else {
        // This shouldn't happen after waiting, but handle it gracefully
        console.error(`[VideoPlayer] SourceBuffer not ready after waiting, chunk ${chunkIndex}`);
        this.isAppending = false;
        // Re-queue WITHOUT marking as loaded
        if (!this.loadedChunks.has(chunkIndex)) {
          this.chunkQueue.unshift(chunkIndex);
          setTimeout(() => this.processChunkQueue(), 200);
        }
      }
    } catch (error) {
      console.error(`[VideoPlayer] Error loading chunk ${chunkIndex}:`, error);
      this.isAppending = false;

      // If aborted, don't continue
      if ((error as Error).name === 'AbortError') {
        return;
      }

      // If first chunk fails, fall back to direct playback
      if (chunkIndex === 0) {
        console.log('[VideoPlayer] First chunk failed, falling back to direct playback');
        this.callbacks.onError?.(`Failed to load video: ${error}`);
        await this.loadDirectPlayback();
        return;
      }

      // For other chunks, log error and continue
      this.callbacks.onError?.(`Failed to load chunk ${chunkIndex}: ${error}`);
      this.processChunkQueue();
    }
  }

  /**
   * Finalize loading when all chunks are appended
   */
  private finalizeLoading(): void {
    if (
      this.mediaSource &&
      this.mediaSource.readyState === 'open' &&
      this.sourceBuffer &&
      !this.sourceBuffer.updating
    ) {
      try {
        this.mediaSource.endOfStream();
        console.log('[VideoPlayer] All chunks loaded, stream ended');
      } catch (e) {
        console.warn('[VideoPlayer] Error ending stream:', e);
      }
    }

    this.isLoading = false;
    if (this.status !== 'error') {
      this.setStatus('ready');
    }
    console.log(`[VideoPlayer] All ${this.loadedChunks.size} chunks loaded, ready for playback`);
  }

  /**
   * Direct playback mode - fallback when MediaSource is not available
   * Only plays the first chunk
   */
  private async loadDirectPlayback(): Promise<boolean> {
    if (!this.videoElement || this.chunks.length === 0) {
      console.error('[VideoPlayer] No video element or chunks for direct playback');
      this.setStatus('error');
      this.isLoading = false;
      this.callbacks.onError?.('No video data available');
      return false;
    }

    // Clean up any existing MediaSource
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;

    try {
      const url = this.chunks[0].downloadUrl;
      console.log(`[VideoPlayer] Direct playback from: ${url}`);

      return new Promise((resolve) => {
        if (!this.videoElement) {
          this.isLoading = false;
          resolve(false);
          return;
        }

        const handleLoadedData = () => {
          console.log('[VideoPlayer] Video loaded (direct playback)');
          this.loadedChunks.add(0);
          this.callbacks.onChunkLoaded?.(1, this.chunks.length);
          this.isLoading = false;
          this.setStatus('ready');
          cleanup();
          resolve(true);
        };

        const handleError = () => {
          console.error('[VideoPlayer] Direct playback error:', this.videoElement?.error);
          this.isLoading = false;
          this.setStatus('error');
          this.callbacks.onError?.(`Video load error: ${this.videoElement?.error?.message || 'Unknown'}`);
          cleanup();
          resolve(false);
        };

        const cleanup = () => {
          this.videoElement?.removeEventListener('loadeddata', handleLoadedData);
          this.videoElement?.removeEventListener('error', handleError);
        };

        this.videoElement.addEventListener('loadeddata', handleLoadedData);
        this.videoElement.addEventListener('error', handleError);
        this.videoElement.src = url;
      });
    } catch (error) {
      console.error('[VideoPlayer] Direct playback setup failed:', error);
      this.isLoading = false;
      this.setStatus('error');
      this.callbacks.onError?.(`Direct playback failed: ${error}`);
      return false;
    }
  }

  /**
   * Play the video
   */
  async play(): Promise<void> {
    if (this.videoElement) {
      try {
        await this.videoElement.play();
      } catch (error) {
        console.error('[VideoPlayer] Play failed:', error);
      }
    }
  }

  /**
   * Pause the video
   */
  pause(): void {
    if (this.videoElement) {
      this.videoElement.pause();
    }
  }

  /**
   * Seek to a specific time in milliseconds
   */
  seekTo(timeMs: number): void {
    if (!this.videoElement) return;

    const timeSeconds = timeMs / 1000;
    const duration = this.videoElement.duration || 0;

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(timeSeconds, duration));
    this.videoElement.currentTime = clampedTime;

    console.log(`[VideoPlayer] Seeking to ${clampedTime.toFixed(2)}s`);
  }

  /**
   * Seek to a time based on event timestamp
   * Calculates the offset from video start time
   */
  seekToTimestamp(eventTimestamp: Date): void {
    if (!this.videoStartTime) {
      console.warn('[VideoPlayer] Video start time not set');
      return;
    }

    const offsetMs = eventTimestamp.getTime() - this.videoStartTime.getTime();
    this.seekTo(Math.max(0, offsetMs));
  }

  /**
   * Get current playback time in milliseconds
   */
  getCurrentTimeMs(): number {
    if (!this.videoElement) return 0;
    return this.videoElement.currentTime * 1000;
  }

  /**
   * Get video duration in milliseconds
   */
  getDurationMs(): number {
    if (!this.videoElement || !this.videoElement.duration || !isFinite(this.videoElement.duration)) {
      return this.totalDurationMs;
    }
    return this.videoElement.duration * 1000;
  }

  /**
   * Get current status
   */
  getStatus(): VideoPlayerStatus {
    return this.status;
  }

  /**
   * Check if video is loaded and ready
   */
  isReady(): boolean {
    return this.status === 'ready' || this.status === 'playing' || this.status === 'paused';
  }

  /**
   * Set status and notify callback
   */
  private setStatus(status: VideoPlayerStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange?.(status);
    }
  }

  /**
   * Get loading progress (0-1)
   */
  getLoadingProgress(): number {
    if (this.chunks.length === 0) return 0;
    return this.loadedChunks.size / this.chunks.length;
  }

  /**
   * Get number of loaded chunks
   */
  getLoadedChunkCount(): number {
    return this.loadedChunks.size;
  }

  /**
   * Get total chunk count
   */
  getTotalChunkCount(): number {
    return this.chunks.length;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Abort any pending requests
    this.abortController?.abort();
    this.abortController = null;

    // Remove event listeners from video element
    if (this.videoElement) {
      this.videoElement.removeEventListener('timeupdate', this.handleTimeUpdate);
      this.videoElement.removeEventListener('play', this.handlePlay);
      this.videoElement.removeEventListener('pause', this.handlePause);
      this.videoElement.removeEventListener('error', this.handleError);
      this.videoElement.removeEventListener('durationchange', this.handleDurationChange);
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement.load();
    }

    // Remove SourceBuffer event listeners
    if (this.sourceBuffer) {
      try {
        this.sourceBuffer.removeEventListener('updateend', this.handleSourceBufferUpdateEnd);
        this.sourceBuffer.removeEventListener('error', this.handleSourceBufferError);
      } catch (e) {
        // Ignore
      }
    }

    // End MediaSource stream
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch (e) {
        // Ignore
      }
    }

    // Revoke object URL
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    // Reset state
    this.videoElement = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.chunks = [];
    this.loadedChunks.clear();
    this.chunkQueue = [];
    this.isAppending = false;
    this.isLoading = false;
    this.sourceOpenHandled = false;
    this.status = 'idle';
    this.callbacks = {};
    this.mimeType = '';

    console.log('[VideoPlayer] Destroyed');
  }
}

// Export singleton instance
export const videoPlayerService = new VideoPlayerService();

// Export class for creating multiple instances if needed
export { VideoPlayerService };
