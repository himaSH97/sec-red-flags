/**
 * Timeline utility functions for session event visualization
 */

import { SessionEvent } from './api';

/**
 * Calculate position percentage on timeline (0-100%)
 */
export const getPositionPercent = (
  eventTime: Date | string,
  startTime: Date | string,
  endTime: Date | string
): number => {
  const eventMs = new Date(eventTime).getTime();
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  
  const total = endMs - startMs;
  if (total <= 0) return 0;
  
  const current = eventMs - startMs;
  const percent = (current / total) * 100;
  
  return Math.max(0, Math.min(100, percent));
};

/**
 * Get time from position percentage
 */
export const getTimeFromPercent = (
  percent: number,
  startTime: Date | string,
  endTime: Date | string
): Date => {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const total = endMs - startMs;
  
  const targetMs = startMs + (total * percent / 100);
  return new Date(targetMs);
};

/**
 * Get events within a time window around a target time
 */
export const getEventsAtTime = (
  events: SessionEvent[],
  targetTime: Date | string,
  windowMs = 2000
): SessionEvent[] => {
  const targetMs = new Date(targetTime).getTime();
  
  return events.filter(e => {
    const eventMs = new Date(e.timestamp).getTime();
    return Math.abs(eventMs - targetMs) <= windowMs;
  });
};

/**
 * Get the nearest event to a target time
 */
export const getNearestEvent = (
  events: SessionEvent[],
  targetTime: Date | string
): SessionEvent | null => {
  if (events.length === 0) return null;
  
  const targetMs = new Date(targetTime).getTime();
  
  let nearest = events[0];
  let minDiff = Math.abs(new Date(nearest.timestamp).getTime() - targetMs);
  
  for (const event of events) {
    const diff = Math.abs(new Date(event.timestamp).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = event;
    }
  }
  
  return nearest;
};

/**
 * Format duration in mm:ss or hh:mm:ss format
 */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

/**
 * Format time relative to session start
 */
export const formatRelativeTime = (
  time: Date | string,
  sessionStart: Date | string
): string => {
  const timeMs = new Date(time).getTime();
  const startMs = new Date(sessionStart).getTime();
  return formatDuration(timeMs - startMs);
};

/**
 * Event severity/type classification
 */
export type EventSeverity = 'critical' | 'warning' | 'info' | 'success';

/**
 * Get event severity based on type
 */
export const getEventSeverity = (eventType: string): EventSeverity => {
  const critical = [
    'FACE_NOT_DETECTED',
    'TAB_SWITCHED_AWAY',
    'MULTIPLE_FACES_DETECTED',
  ];
  
  const warning = [
    'FACE_TURNED_AWAY',
    'GAZE_AWAY',
    'SPEAKING_DETECTED',
    'WINDOW_BLUR',
    'EYES_CLOSED_EXTENDED',
    'EXCESSIVE_BLINKING',
    'SQUINTING_DETECTED',
    'HEAD_MOVEMENT_EXCESSIVE',
    'HEAD_TILTED',
    'EXPRESSION_CONFUSED',
    'LIP_READING_DETECTED',
  ];
  
  const success = [
    'FACE_RETURNED',
    'FACE_DETECTED',
    'GAZE_RETURNED',
    'TAB_RETURNED',
    'WINDOW_FOCUS',
    'EYES_OPENED',
    'HEAD_POSITION_NORMAL',
  ];

  const info = [
    'AI_RESPONDED',
    'USER_RESPONDED',
  ];
  
  if (critical.includes(eventType)) return 'critical';
  if (warning.includes(eventType)) return 'warning';
  if (success.includes(eventType)) return 'success';
  if (info.includes(eventType)) return 'info';
  return 'info';
};

/**
 * Get color classes for event severity
 */
export const getSeverityColors = (severity: EventSeverity) => {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-500',
        bgLight: 'bg-red-100',
        border: 'border-red-500',
        text: 'text-red-600',
        hover: 'hover:bg-red-600',
      };
    case 'warning':
      return {
        bg: 'bg-amber-500',
        bgLight: 'bg-amber-100',
        border: 'border-amber-500',
        text: 'text-amber-600',
        hover: 'hover:bg-amber-600',
      };
    case 'success':
      return {
        bg: 'bg-emerald-500',
        bgLight: 'bg-emerald-100',
        border: 'border-emerald-500',
        text: 'text-emerald-600',
        hover: 'hover:bg-emerald-600',
      };
    default:
      return {
        bg: 'bg-blue-500',
        bgLight: 'bg-blue-100',
        border: 'border-blue-500',
        text: 'text-blue-600',
        hover: 'hover:bg-blue-600',
      };
  }
};

/**
 * Calculate event density for a timeline segment
 * Returns an array of density values (0-1) for each segment
 */
export const calculateEventDensity = (
  events: SessionEvent[],
  startTime: Date | string,
  endTime: Date | string,
  segments = 50
): number[] => {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const segmentDuration = (endMs - startMs) / segments;
  
  const density: number[] = new Array(segments).fill(0);
  
  for (const event of events) {
    const eventMs = new Date(event.timestamp).getTime();
    const segmentIndex = Math.floor((eventMs - startMs) / segmentDuration);
    if (segmentIndex >= 0 && segmentIndex < segments) {
      density[segmentIndex]++;
    }
  }
  
  // Normalize to 0-1 range
  const maxDensity = Math.max(...density, 1);
  return density.map(d => d / maxDensity);
};

/**
 * Group consecutive events of similar types
 */
export const groupConsecutiveEvents = (
  events: SessionEvent[],
  maxGapMs = 5000
): SessionEvent[][] => {
  if (events.length === 0) return [];
  
  const groups: SessionEvent[][] = [];
  let currentGroup: SessionEvent[] = [events[0]];
  
  for (let i = 1; i < events.length; i++) {
    const prevMs = new Date(events[i - 1].timestamp).getTime();
    const currMs = new Date(events[i].timestamp).getTime();
    
    if (currMs - prevMs <= maxGapMs) {
      currentGroup.push(events[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [events[i]];
    }
  }
  
  groups.push(currentGroup);
  return groups;
};

