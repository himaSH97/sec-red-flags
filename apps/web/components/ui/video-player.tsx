'use client';

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Loader2,
  AlertCircle,
  Video,
  SkipForward,
  SkipBack,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VideoChunk } from '@/lib/api';
import { VideoPlayerService, VideoPlayerStatus } from '@/lib/video-player';

export type { VideoPlayerStatus };

export interface VideoPlayerRef {
  seekTo: (timeMs: number) => void;
  seekToTimestamp: (timestamp: Date) => void;
  play: () => void;
  pause: () => void;
  getCurrentTimeMs: () => number;
  getDurationMs: () => number;
  isReady: () => boolean;
  isPlaying: () => boolean;
}

interface VideoPlayerProps {
  chunks: VideoChunk[];
  videoStartTime?: Date;
  totalDurationMs?: number;
  chunkDurationMs?: number;
  /** Callback when video time updates - throttled internally */
  onTimeUpdate?: (currentTimeMs: number) => void;
  onStatusChange?: (status: VideoPlayerStatus) => void;
  onReady?: () => void;
  /** Callback when a seek operation completes */
  onSeekComplete?: (timeMs: number) => void;
  /** Throttle interval for onTimeUpdate in ms (default: 100ms) */
  timeUpdateThrottleMs?: number;
  /** Hide the video controls overlay (use external controls like timeline) */
  hideControls?: boolean;
  className?: string;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  (
    {
      chunks,
      videoStartTime,
      totalDurationMs,
      chunkDurationMs = 30000,
      onTimeUpdate,
      onStatusChange,
      onReady,
      onSeekComplete,
      timeUpdateThrottleMs = 100,
      hideControls = false,
      className,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const playerServiceRef = useRef<VideoPlayerService | null>(null);
    const isInitializedRef = useRef(false);

    // Throttling refs
    const lastTimeUpdateRef = useRef(0);
    const lastEmittedTimeRef = useRef(0);
    const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isSeekingRef = useRef(false);

    // Store callbacks in refs to avoid triggering effect re-runs
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const onStatusChangeRef = useRef(onStatusChange);
    const onReadyRef = useRef(onReady);
    const onSeekCompleteRef = useRef(onSeekComplete);

    // Update refs when callbacks change
    useEffect(() => {
      onTimeUpdateRef.current = onTimeUpdate;
    }, [onTimeUpdate]);

    useEffect(() => {
      onStatusChangeRef.current = onStatusChange;
    }, [onStatusChange]);

    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      onSeekCompleteRef.current = onSeekComplete;
    }, [onSeekComplete]);

    // Cleanup throttle timer on unmount
    useEffect(() => {
      return () => {
        if (throttleTimerRef.current) {
          clearTimeout(throttleTimerRef.current);
        }
      };
    }, []);

    const [status, setStatus] = useState<VideoPlayerStatus>('idle');
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [durationMs, setDurationMs] = useState(totalDurationMs || 0);
    const [isMuted, setIsMuted] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadedChunks, setLoadedChunks] = useState(0);
    const [totalChunks, setTotalChunks] = useState(0);
    const [loadingProgress, setLoadingProgress] = useState(0);

    /**
     * Throttled time update handler
     * Only emits updates at most every `timeUpdateThrottleMs` milliseconds
     */
    const handleThrottledTimeUpdate = useCallback(
      (timeMs: number) => {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastTimeUpdateRef.current;

        // Always update internal state for smooth UI
        setCurrentTimeMs(timeMs);

        // Handle seek completion
        if (isSeekingRef.current) {
          isSeekingRef.current = false;
          onSeekCompleteRef.current?.(timeMs);
        }

        // Throttle external callback
        if (timeSinceLastUpdate >= timeUpdateThrottleMs) {
          // Enough time has passed, emit immediately
          lastTimeUpdateRef.current = now;
          lastEmittedTimeRef.current = timeMs;
          onTimeUpdateRef.current?.(timeMs);
        } else {
          // Schedule a deferred update
          if (throttleTimerRef.current) {
            clearTimeout(throttleTimerRef.current);
          }
          throttleTimerRef.current = setTimeout(() => {
            lastTimeUpdateRef.current = Date.now();
            lastEmittedTimeRef.current = timeMs;
            onTimeUpdateRef.current?.(timeMs);
          }, timeUpdateThrottleMs - timeSinceLastUpdate);
        }
      },
      [timeUpdateThrottleMs]
    );

    // Create a stable key from chunks to detect when they actually change
    const chunksKey =
      chunks.length > 0 ? `${chunks[0].downloadUrl}-${chunks.length}` : '';

    // Initialize player service when video element is available
    useEffect(() => {
      if (!videoRef.current || chunks.length === 0) {
        return;
      }

      // Prevent double initialization
      if (isInitializedRef.current && playerServiceRef.current) {
        return;
      }

      isInitializedRef.current = true;

      // Create a new player service instance for this component
      const playerService = new VideoPlayerService();
      playerServiceRef.current = playerService;

      // Initialize with callbacks
      playerService.initialize(
        videoRef.current,
        {
          onStatusChange: (newStatus) => {
            setStatus(newStatus);
            onStatusChangeRef.current?.(newStatus);
            if (newStatus === 'ready') {
              onReadyRef.current?.();
            }
          },
          onTimeUpdate: handleThrottledTimeUpdate,
          onDurationChange: (duration) => {
            setDurationMs(duration);
          },
          onError: (errorMsg) => {
            setError(errorMsg);
          },
          onChunkLoaded: (loaded, total) => {
            setLoadedChunks(loaded);
            setTotalChunks(total);
          },
          onLoadingProgress: (progress) => {
            setLoadingProgress(progress);
          },
        },
        { chunkDurationMs }
      );

      // Load the chunks
      playerService.load(chunks, videoStartTime, totalDurationMs);

      // Cleanup on unmount
      return () => {
        isInitializedRef.current = false;
        playerService.destroy();
        playerServiceRef.current = null;
      };
      // Only re-run when chunks actually change (using stable key)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chunksKey]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        seekTo: (timeMs: number) => {
          isSeekingRef.current = true;
          playerServiceRef.current?.seekTo(timeMs);
        },
        seekToTimestamp: (timestamp: Date) => {
          isSeekingRef.current = true;
          playerServiceRef.current?.seekToTimestamp(timestamp);
        },
        play: () => {
          playerServiceRef.current?.play();
        },
        pause: () => {
          playerServiceRef.current?.pause();
        },
        getCurrentTimeMs: () => {
          return playerServiceRef.current?.getCurrentTimeMs() || 0;
        },
        getDurationMs: () => {
          return playerServiceRef.current?.getDurationMs() || durationMs;
        },
        isReady: () => {
          return playerServiceRef.current?.isReady() || false;
        },
        isPlaying: () => {
          return status === 'playing';
        },
      }),
      [durationMs, status]
    );

    // Format time for display
    const formatTime = useCallback((ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const pad = (n: number) => n.toString().padStart(2, '0');

      if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
      }
      return `${pad(minutes)}:${pad(seconds)}`;
    }, []);

    // Handle play/pause toggle
    const togglePlayPause = useCallback(() => {
      if (!playerServiceRef.current) return;

      if (status === 'playing') {
        playerServiceRef.current.pause();
      } else {
        playerServiceRef.current.play();
      }
    }, [status]);

    // Handle mute toggle
    const toggleMute = useCallback(() => {
      if (videoRef.current) {
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
      }
    }, []);

    // Handle fullscreen toggle
    const toggleFullscreen = useCallback(() => {
      if (!containerRef.current) return;

      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }, []);

    // Handle progress bar click
    const handleProgressClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!playerServiceRef.current || durationMs === 0) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const targetTimeMs = percent * durationMs;
        playerServiceRef.current.seekTo(targetTimeMs);
      },
      [durationMs]
    );

    // Skip forward/back
    const skipForward = useCallback(() => {
      if (playerServiceRef.current) {
        const currentTime = playerServiceRef.current.getCurrentTimeMs();
        playerServiceRef.current.seekTo(currentTime + 5000);
      }
    }, []);

    const skipBack = useCallback(() => {
      if (playerServiceRef.current) {
        const currentTime = playerServiceRef.current.getCurrentTimeMs();
        playerServiceRef.current.seekTo(Math.max(0, currentTime - 5000));
      }
    }, []);

    // Listen for fullscreen changes
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => {
        document.removeEventListener(
          'fullscreenchange',
          handleFullscreenChange
        );
      };
    }, []);

    // Progress percentage for playback
    const progressPercent =
      durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

    // Render empty state if no chunks
    if (chunks.length === 0) {
      return (
        <div
          className={cn(
            'relative aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center',
            className
          )}
        >
          <div className="text-center text-slate-400">
            <Video className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No video recording available</p>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          'relative aspect-video bg-slate-900 rounded-lg overflow-hidden group',
          className
        )}
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          muted={isMuted}
          crossOrigin="anonymous"
        />

        {/* Loading Overlay */}
        {status === 'loading' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
            <Loader2 className="h-10 w-10 text-white animate-spin mb-3" />
            <p className="text-white text-sm mb-2">Loading video...</p>
            {totalChunks > 1 && (
              <>
                <p className="text-white/70 text-xs mb-2">
                  Loading chunk {loadedChunks + 1} of {totalChunks}
                </p>
                {/* Loading progress bar */}
                <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${loadingProgress * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Error Overlay */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-white text-sm mb-1">Failed to load video</p>
            <p className="text-slate-400 text-xs text-center max-w-md">
              {error || 'Unknown error'}
            </p>
          </div>
        )}

        {/* Controls Overlay - appears on hover (hidden when hideControls is true) */}
        {!hideControls && (
          <div
            className={cn(
              'absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
              status === 'loading' && 'hidden'
            )}
          >
            {/* Center Play Button */}
            <button
              onClick={togglePlayPause}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div
                className={cn(
                  'w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm',
                  'flex items-center justify-center transition-transform hover:scale-110',
                  status !== 'ready' && status !== 'paused' && 'hidden'
                )}
              >
                <Play className="h-8 w-8 text-white ml-1" />
              </div>
            </button>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              {/* Buffer progress indicator (shows how much is loaded) */}
              {totalChunks > 1 && loadedChunks < totalChunks && (
                <div className="w-full h-0.5 bg-white/10 rounded-full mb-1">
                  <div
                    className="h-full bg-white/30 rounded-full transition-all duration-300"
                    style={{ width: `${loadingProgress * 100}%` }}
                  />
                </div>
              )}

              {/* Progress Bar */}
              <div
                className="w-full h-1.5 bg-white/30 rounded-full mb-3 cursor-pointer group/progress"
                onClick={handleProgressClick}
              >
                <div
                  className="h-full bg-blue-500 rounded-full relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  {/* Scrubber handle */}
                  <div
                    className={cn(
                      'absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full',
                      'opacity-0 group-hover/progress:opacity-100 transition-opacity',
                      'shadow-lg'
                    )}
                  />
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Skip Back */}
                  <button
                    onClick={skipBack}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    title="Skip back 5s"
                  >
                    <SkipBack className="h-4 w-4 text-white" />
                  </button>

                  {/* Play/Pause Button */}
                  <button
                    onClick={togglePlayPause}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {status === 'playing' ? (
                      <Pause className="h-5 w-5 text-white" />
                    ) : (
                      <Play className="h-5 w-5 text-white ml-0.5" />
                    )}
                  </button>

                  {/* Skip Forward */}
                  <button
                    onClick={skipForward}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    title="Skip forward 5s"
                  >
                    <SkipForward className="h-4 w-4 text-white" />
                  </button>

                  {/* Mute Button */}
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="h-5 w-5 text-white" />
                    ) : (
                      <Volume2 className="h-5 w-5 text-white" />
                    )}
                  </button>

                  {/* Time Display */}
                  <span className="text-white text-sm font-mono ml-2">
                    {formatTime(currentTimeMs)} / {formatTime(durationMs)}
                  </span>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2">
                  {/* Chunk loading indicator */}
                  {totalChunks > 1 && (
                    <span className="text-white/60 text-xs">
                      {loadedChunks < totalChunks
                        ? `Loading ${loadedChunks}/${totalChunks}`
                        : `${totalChunks} chunks`}
                    </span>
                  )}

                  {/* Fullscreen Button */}
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <Maximize className="h-5 w-5 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
