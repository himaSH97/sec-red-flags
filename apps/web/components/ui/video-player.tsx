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

export type VideoPlayerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error';

export interface VideoPlayerRef {
  seekTo: (timeMs: number) => void;
  seekToTimestamp: (timestamp: Date) => void;
  play: () => void;
  pause: () => void;
  getCurrentTimeMs: () => number;
  isReady: () => boolean;
}

interface VideoPlayerProps {
  chunks: VideoChunk[];
  videoStartTime?: Date;
  totalDurationMs?: number;
  chunkDurationMs?: number;
  onTimeUpdate?: (currentTimeMs: number) => void;
  onStatusChange?: (status: VideoPlayerStatus) => void;
  onReady?: () => void;
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
      className,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [status, setStatus] = useState<VideoPlayerStatus>('idle');
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [durationMs, setDurationMs] = useState(totalDurationMs || 0);
    const [isMuted, setIsMuted] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentChunkIndex, setCurrentChunkIndex] = useState(0);

    // Update status helper
    const updateStatus = useCallback((newStatus: VideoPlayerStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
      if (newStatus === 'ready') {
        onReady?.();
      }
    }, [onStatusChange, onReady]);

    // Load video when chunks change
    useEffect(() => {
      if (!videoRef.current || chunks.length === 0) {
        console.log('[VideoPlayer] No video ref or chunks');
        return;
      }

      const video = videoRef.current;
      const url = chunks[0].downloadUrl;
      
      console.log('[VideoPlayer] Setting video source:', url);
      updateStatus('loading');

      // Set up event handlers
      const handleLoadedData = () => {
        console.log('[VideoPlayer] Video loaded successfully');
        updateStatus('ready');
        if (video.duration) {
          setDurationMs(video.duration * 1000);
        }
      };

      const handleCanPlay = () => {
        console.log('[VideoPlayer] Video can play');
        if (status === 'loading') {
          updateStatus('ready');
        }
      };

      const handleError = () => {
        console.error('[VideoPlayer] Video error:', video.error);
        setError(video.error?.message || 'Failed to load video');
        updateStatus('error');
      };

      const handleTimeUpdate = () => {
        const timeMs = video.currentTime * 1000;
        setCurrentTimeMs(timeMs);
        onTimeUpdate?.(timeMs);
      };

      const handlePlay = () => updateStatus('playing');
      const handlePause = () => updateStatus('paused');

      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      // Set the source
      video.src = url;
      video.load();

      return () => {
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }, [chunks, updateStatus, onTimeUpdate, status]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        seekTo: (timeMs: number) => {
          if (videoRef.current) {
            // Calculate which chunk this time falls into
            const chunkIndex = Math.floor(timeMs / chunkDurationMs);
            const timeWithinChunk = timeMs % chunkDurationMs;
            
            if (chunkIndex !== currentChunkIndex && chunkIndex < chunks.length) {
              // Need to load a different chunk
              setCurrentChunkIndex(chunkIndex);
              videoRef.current.src = chunks[chunkIndex].downloadUrl;
              videoRef.current.currentTime = timeWithinChunk / 1000;
            } else {
              // Same chunk, just seek
              videoRef.current.currentTime = timeMs / 1000;
            }
          }
        },
        seekToTimestamp: (timestamp: Date) => {
          if (videoStartTime && videoRef.current) {
            const offsetMs = timestamp.getTime() - videoStartTime.getTime();
            if (offsetMs >= 0) {
              videoRef.current.currentTime = offsetMs / 1000;
            }
          }
        },
        play: () => {
          videoRef.current?.play();
        },
        pause: () => {
          videoRef.current?.pause();
        },
        getCurrentTimeMs: () => {
          return (videoRef.current?.currentTime || 0) * 1000;
        },
        isReady: () => {
          return status === 'ready' || status === 'playing' || status === 'paused';
        },
      }),
      [chunkDurationMs, chunks, currentChunkIndex, status, videoStartTime]
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
      if (!videoRef.current) return;

      if (status === 'playing') {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
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
        if (!videoRef.current || durationMs === 0) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const targetTime = percent * durationMs / 1000;
        videoRef.current.currentTime = targetTime;
      },
      [durationMs]
    );

    // Skip forward/back
    const skipForward = useCallback(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.min(
          videoRef.current.currentTime + 5,
          videoRef.current.duration || 0
        );
      }
    }, []);

    const skipBack = useCallback(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(
          videoRef.current.currentTime - 5,
          0
        );
      }
    }, []);

    // Listen for fullscreen changes
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
      };
    }, []);

    // Progress percentage
    const progressPercent = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

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
          </div>
        )}

        {/* Error Overlay */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-white text-sm mb-1">Failed to load video</p>
            <p className="text-slate-400 text-xs text-center max-w-md">{error || 'Unknown error'}</p>
          </div>
        )}

        {/* Controls Overlay - appears on hover */}
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
                {/* Chunk indicator */}
                {chunks.length > 1 && (
                  <span className="text-white/60 text-xs">
                    Chunk {currentChunkIndex + 1}/{chunks.length}
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
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
