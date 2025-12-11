'use client';

import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { VideoPlayerRef } from '@/components/ui/video-player';

export type SyncSource = 'video' | 'timeline' | 'event' | null;

export interface UseVideoTimelineSyncOptions {
  /** Video start time (absolute timestamp) */
  videoStartTime?: Date;
  /** Session start time (absolute timestamp) */
  sessionStartTime: Date;
  /** Total video duration in ms */
  videoDurationMs: number;
  /** Callback when time changes (for external consumers) */
  onTimeChange?: (timeMs: number, source: SyncSource) => void;
  /** Debounce interval for state updates (default: 100ms) */
  debounceMs?: number;
}

export interface UseVideoTimelineSyncReturn {
  /** Current time relative to video start (in ms) - for video player */
  videoTimeMs: number;
  /** Current time relative to session start (in ms) - for timeline */
  sessionTimeMs: number;
  /** Current absolute time as Date - for event correlation */
  currentAbsoluteTime: Date;
  /** Whether video is currently playing (tracked from video player status) */
  isVideoPlaying: boolean;
  /** Play the video */
  playVideo: () => void;
  /** Pause the video */
  pauseVideo: () => void;
  /** Handle video time update (called by video player) */
  handleVideoTimeUpdate: (timeMs: number) => void;
  /** Handle video status change (called by video player) */
  handleVideoStatusChange: (status: string) => void;
  /** Handle timeline seek (called by timeline component) */
  handleTimelineSeek: (timeMs: number) => void;
  /** Handle event click (seek to event timestamp) */
  handleEventSeek: (eventTimestamp: Date) => void;
  /** Video player ref for programmatic control */
  videoRef: React.RefObject<VideoPlayerRef>;
  /** Get the last sync source */
  lastSyncSource: SyncSource;
}

/**
 * Custom hook to manage bidirectional video-timeline synchronization.
 *
 * Prevents infinite rerenders by:
 * 1. Tracking the source of updates to prevent circular sync
 * 2. Using refs for high-frequency values
 * 3. Debouncing state updates
 * 4. Using stable callback references
 */
export function useVideoTimelineSync({
  videoStartTime,
  sessionStartTime,
  videoDurationMs,
  onTimeChange,
  debounceMs = 100,
}: UseVideoTimelineSyncOptions): UseVideoTimelineSyncReturn {
  // Refs for high-frequency updates (don't trigger re-renders)
  const videoTimeMsRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const syncSourceRef = useRef<SyncSource>(null);
  const isSeekingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Video player ref for programmatic control
  const videoRef = useRef<VideoPlayerRef>(null);

  // State for display purposes (debounced updates)
  const [displayVideoTimeMs, setDisplayVideoTimeMs] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [lastSyncSource, setLastSyncSource] = useState<SyncSource>(null);

  // Calculate time offsets
  const videoStartMs = useMemo(
    () => videoStartTime?.getTime() ?? sessionStartTime.getTime(),
    [videoStartTime, sessionStartTime]
  );

  const sessionStartMs = useMemo(
    () => sessionStartTime.getTime(),
    [sessionStartTime]
  );

  // Calculate session time from video time
  const sessionTimeMs = useMemo(() => {
    const absoluteTimeMs = videoStartMs + displayVideoTimeMs;
    return absoluteTimeMs - sessionStartMs;
  }, [videoStartMs, displayVideoTimeMs, sessionStartMs]);

  // Calculate absolute time from video time
  const currentAbsoluteTime = useMemo(() => {
    return new Date(videoStartMs + displayVideoTimeMs);
  }, [videoStartMs, displayVideoTimeMs]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Store callback ref to avoid dependency changes
  const onTimeChangeRef = useRef(onTimeChange);
  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  /**
   * Internal function to update time with debouncing
   */
  const updateTimeInternal = useCallback(
    (timeMs: number, source: SyncSource) => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateRef.current;

      // Update ref immediately (for calculations)
      videoTimeMsRef.current = timeMs;
      syncSourceRef.current = source;

      // Debounce state updates to prevent excessive re-renders
      if (timeSinceLastUpdate >= debounceMs) {
        // Enough time passed, update immediately
        lastUpdateRef.current = now;
        setDisplayVideoTimeMs(timeMs);
        setLastSyncSource(source);
        onTimeChangeRef.current?.(timeMs, source);
      } else {
        // Schedule debounced update
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          lastUpdateRef.current = Date.now();
          setDisplayVideoTimeMs(videoTimeMsRef.current);
          setLastSyncSource(syncSourceRef.current);
          onTimeChangeRef.current?.(
            videoTimeMsRef.current,
            syncSourceRef.current
          );
        }, debounceMs - timeSinceLastUpdate);
      }
    },
    [debounceMs]
  );

  /**
   * Handle video time update from the video player
   * This is called frequently during playback
   */
  const handleVideoTimeUpdate = useCallback(
    (timeMs: number) => {
      // Skip if we're in the middle of a programmatic seek
      if (isSeekingRef.current) {
        return;
      }

      // Clamp to valid range
      const clampedTime = Math.max(0, Math.min(timeMs, videoDurationMs));
      updateTimeInternal(clampedTime, 'video');
    },
    [videoDurationMs, updateTimeInternal]
  );

  /**
   * Handle timeline seek from user interaction
   * Converts session-relative time to video time and seeks video
   */
  const handleTimelineSeek = useCallback(
    (sessionRelativeTimeMs: number) => {
      // Convert session time to video time
      const absoluteTimeMs = sessionStartMs + sessionRelativeTimeMs;
      const videoTimeMs = absoluteTimeMs - videoStartMs;

      // Clamp to valid video range
      const clampedVideoTime = Math.max(
        0,
        Math.min(videoTimeMs, videoDurationMs)
      );

      // Set seeking flag to prevent feedback loop
      isSeekingRef.current = true;

      // Update internal state
      updateTimeInternal(clampedVideoTime, 'timeline');

      // Seek video player
      if (videoRef.current) {
        videoRef.current.seekTo(clampedVideoTime);
      }

      // Clear seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 100);
    },
    [sessionStartMs, videoStartMs, videoDurationMs, updateTimeInternal]
  );

  /**
   * Handle event click - seek to event timestamp
   */
  const handleEventSeek = useCallback(
    (eventTimestamp: Date) => {
      const eventMs = eventTimestamp.getTime();
      const videoTimeMs = eventMs - videoStartMs;

      // Clamp to valid video range
      const clampedVideoTime = Math.max(
        0,
        Math.min(videoTimeMs, videoDurationMs)
      );

      // Set seeking flag to prevent feedback loop
      isSeekingRef.current = true;

      // Update internal state
      updateTimeInternal(clampedVideoTime, 'event');

      // Seek video player
      if (videoRef.current) {
        videoRef.current.seekTo(clampedVideoTime);
      }

      // Clear seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 100);
    },
    [videoStartMs, videoDurationMs, updateTimeInternal]
  );

  /**
   * Handle video status change from the video player
   * Updates the isVideoPlaying state based on player status
   */
  const handleVideoStatusChange = useCallback((status: string) => {
    setIsVideoPlaying(status === 'playing');
  }, []);

  /**
   * Play the video
   */
  const playVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  }, []);

  /**
   * Pause the video
   */
  const pauseVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  return {
    videoTimeMs: displayVideoTimeMs,
    sessionTimeMs,
    currentAbsoluteTime,
    isVideoPlaying,
    playVideo,
    pauseVideo,
    handleVideoTimeUpdate,
    handleVideoStatusChange,
    handleTimelineSeek,
    handleEventSeek,
    videoRef,
    lastSyncSource,
  };
}

export default useVideoTimelineSync;
