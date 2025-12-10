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
  onChunkLoaded?: (chunkIndex: number, totalChunks: number) => void;
}

const DEFAULT_CONFIG: VideoPlayerConfig = {
  chunkDurationMs: 30000, // 30 seconds per chunk
};

class VideoPlayerService {
  private videoElement: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private chunks: VideoChunk[] = [];
  private loadedChunks: Set<number> = new Set();
  private pendingChunks: number[] = [];
  private isAppending = false;
  private config: VideoPlayerConfig = DEFAULT_CONFIG;
  private callbacks: VideoPlayerCallbacks = {};
  private status: VideoPlayerStatus = 'idle';
  private totalDurationMs = 0;
  private videoStartTime: Date | null = null;

  /**
   * Initialize the video player with configuration and callbacks
   */
  initialize(
    videoElement: HTMLVideoElement,
    callbacks: VideoPlayerCallbacks = {},
    config: Partial<VideoPlayerConfig> = {}
  ): void {
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

    this.videoElement.addEventListener('timeupdate', () => {
      if (this.videoElement) {
        const currentTimeMs = this.videoElement.currentTime * 1000;
        this.callbacks.onTimeUpdate?.(currentTimeMs);
      }
    });

    this.videoElement.addEventListener('play', () => {
      this.setStatus('playing');
    });

    this.videoElement.addEventListener('pause', () => {
      this.setStatus('paused');
    });

    this.videoElement.addEventListener('error', (e) => {
      console.error('[VideoPlayer] Video element error:', e);
      this.callbacks.onError?.('Video playback error');
      this.setStatus('error');
    });

    this.videoElement.addEventListener('durationchange', () => {
      if (this.videoElement && this.videoElement.duration) {
        const durationMs = this.videoElement.duration * 1000;
        this.callbacks.onDurationChange?.(durationMs);
      }
    });
  }

  /**
   * Load video chunks and prepare for playback
   */
  async load(
    chunks: VideoChunk[],
    videoStartTime?: Date,
    totalDurationMs?: number
  ): Promise<boolean> {
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

    console.log(`[VideoPlayer] Loading ${chunks.length} chunks`);
    chunks.forEach((c, i) => {
      console.log(`[VideoPlayer] Chunk ${i}: index=${c.index}, url=${c.downloadUrl?.substring(0, 80)}...`);
    });

    this.setStatus('loading');
    this.chunks = chunks.sort((a, b) => a.index - b.index);
    this.loadedChunks.clear();
    this.pendingChunks = [];
    this.videoStartTime = videoStartTime || null;
    this.totalDurationMs =
      totalDurationMs || chunks.length * this.config.chunkDurationMs;

    // Check if chunks have valid URLs
    if (!chunks[0].downloadUrl) {
      console.error('[VideoPlayer] Chunks missing download URLs');
      this.setStatus('error');
      this.callbacks.onError?.('Video chunks missing download URLs');
      return false;
    }

    // Use direct playback (simple and reliable for single video source)
    console.log('[VideoPlayer] Using direct playback mode');
    return this.loadDirectPlayback();
  }

  /**
   * Direct playback mode (plays first chunk, can seek between chunks)
   */
  private async loadDirectPlayback(): Promise<boolean> {
    if (!this.videoElement || this.chunks.length === 0) {
      console.error('[VideoPlayer] No video element or chunks for direct playback');
      this.setStatus('error');
      this.callbacks.onError?.('No video data available');
      return false;
    }

    try {
      const url = this.chunks[0].downloadUrl;
      console.log(`[VideoPlayer] Loading video from: ${url}`);
      
      // Set up event handlers before setting src
      this.videoElement.onloadeddata = () => {
        console.log('[VideoPlayer] Video loaded successfully');
        this.loadedChunks.add(0);
        this.callbacks.onChunkLoaded?.(1, this.chunks.length);
        this.setStatus('ready');
      };
      
      this.videoElement.onerror = (e) => {
        console.error('[VideoPlayer] Video load error:', e, this.videoElement?.error);
        this.setStatus('error');
        this.callbacks.onError?.(`Video load error: ${this.videoElement?.error?.message || 'Unknown error'}`);
      };
      
      this.videoElement.oncanplay = () => {
        console.log('[VideoPlayer] Video can play');
        if (this.status === 'loading') {
          this.loadedChunks.add(0);
          this.callbacks.onChunkLoaded?.(1, this.chunks.length);
          this.setStatus('ready');
        }
      };
      
      // Set the source and load
      this.videoElement.src = url;
      
      return true;
    } catch (error) {
      console.error('[VideoPlayer] Direct playback setup failed:', error);
      this.setStatus('error');
      this.callbacks.onError?.(`Direct playback failed: ${error}`);
      return false;
    }
  }

  /**
   * Process the next chunk in the queue
   */
  private async processNextChunk(): Promise<void> {
    if (
      this.isAppending ||
      this.pendingChunks.length === 0 ||
      !this.sourceBuffer
    ) {
      if (
        this.pendingChunks.length === 0 &&
        this.loadedChunks.size === this.chunks.length
      ) {
        // All chunks loaded
        this.finalizeLoading();
      }
      return;
    }

    const chunkIndex = this.pendingChunks.shift();
    if (chunkIndex === undefined) return;

    const chunk = this.chunks.find((c) => c.index === chunkIndex);
    if (!chunk) {
      console.error(`[VideoPlayer] Chunk ${chunkIndex} not found`);
      this.processNextChunk();
      return;
    }

    try {
      this.isAppending = true;
      console.log(`[VideoPlayer] Fetching chunk ${chunkIndex} from ${chunk.downloadUrl.substring(0, 100)}...`);

      // Fetch the chunk data
      const response = await fetch(chunk.downloadUrl, {
        mode: 'cors',
        credentials: 'omit',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch chunk ${chunkIndex}: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[VideoPlayer] Chunk ${chunkIndex} fetched, size: ${arrayBuffer.byteLength} bytes`);

      if (arrayBuffer.byteLength === 0) {
        throw new Error(`Chunk ${chunkIndex} is empty`);
      }

      // Append to SourceBuffer
      if (this.sourceBuffer && !this.sourceBuffer.updating) {
        this.sourceBuffer.appendBuffer(arrayBuffer);
        this.loadedChunks.add(chunkIndex);

        console.log(
          `[VideoPlayer] Loaded chunk ${chunkIndex + 1}/${this.chunks.length}`
        );
        this.callbacks.onChunkLoaded?.(
          this.loadedChunks.size,
          this.chunks.length
        );
      } else {
        console.warn(`[VideoPlayer] SourceBuffer not ready for chunk ${chunkIndex}, re-queuing`);
        this.pendingChunks.unshift(chunkIndex);
        this.isAppending = false;
        // Retry after a short delay
        setTimeout(() => this.processNextChunk(), 100);
      }
    } catch (error) {
      console.error(`[VideoPlayer] Error loading chunk ${chunkIndex}:`, error);
      this.isAppending = false;
      this.callbacks.onError?.(`Failed to load chunk ${chunkIndex}: ${error}`);
      
      // If first chunk fails, try direct playback instead
      if (chunkIndex === 0) {
        console.log('[VideoPlayer] First chunk failed, falling back to direct playback');
        this.loadDirectPlayback();
        return;
      }
      
      // Continue with next chunk for non-first chunks
      this.processNextChunk();
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
      } catch (e) {
        // Ignore errors when ending stream
      }
    }

    this.setStatus('ready');
    console.log('[VideoPlayer] All chunks loaded, ready for playback');
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

    const offsetMs =
      eventTimestamp.getTime() - this.videoStartTime.getTime();
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
    if (!this.videoElement || !this.videoElement.duration) {
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
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  /**
   * Get loading progress (0-1)
   */
  getLoadingProgress(): number {
    if (this.chunks.length === 0) return 0;
    return this.loadedChunks.size / this.chunks.length;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Remove video source
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement.load();
    }

    // Revoke object URL if MediaSource was used
    if (this.mediaSource) {
      try {
        if (this.mediaSource.readyState === 'open') {
          this.mediaSource.endOfStream();
        }
      } catch (e) {
        // Ignore
      }
    }

    // Reset state
    this.videoElement = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.chunks = [];
    this.loadedChunks.clear();
    this.pendingChunks = [];
    this.isAppending = false;
    this.status = 'idle';
    this.callbacks = {};

    console.log('[VideoPlayer] Destroyed');
  }
}

// Export singleton instance
export const videoPlayerService = new VideoPlayerService();

// Export class for creating multiple instances if needed
export { VideoPlayerService };

