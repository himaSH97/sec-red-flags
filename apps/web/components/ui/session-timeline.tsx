'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { SessionEvent } from '@/lib/api';
import {
  getPositionPercent,
  getTimeFromPercent,
  getEventsAtTime,
  formatDuration,
  formatRelativeTime,
  getEventSeverity,
  getSeverityColors,
  calculateEventDensity,
  EventSeverity,
} from '@/lib/timeline-utils';
import { cn } from '@/lib/utils';
import {
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  SkipBack,
  SkipForward,
  Activity,
  Clock,
  AlertTriangle,
  Eye,
  MessageSquare,
  Monitor,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from './button';

interface SessionTimelineProps {
  events: SessionEvent[];
  sessionStart: string;
  sessionEnd?: string;
  onTimeSelect?: (time: Date) => void;
  onEventSelect?: (event: SessionEvent) => void;
  selectedEventId?: string;
  className?: string;
  /** External current time (for video sync) - if provided, timeline syncs to this time */
  externalCurrentTime?: Date;
  /** Whether to disable the timeline's internal play controls (when video controls playback) */
  disablePlayback?: boolean;
}

// Event type to icon mapping
const getEventIcon = (type: string) => {
  if (type === 'AI_RESPONDED' || type === 'USER_RESPONDED') return MessageSquare;
  if (type.includes('FACE') || type.includes('GAZE') || type.includes('EYE')) return Eye;
  if (type.includes('SPEAK') || type.includes('TALK')) return MessageSquare;
  if (type.includes('TAB') || type.includes('WINDOW') || type.includes('MONITOR')) return Monitor;
  if (type.includes('MULTIPLE')) return Users;
  if (type.includes('ALERT') || type.includes('WARNING')) return AlertTriangle;
  return Activity;
};

// Format event type for display
const formatEventType = (type: string) => {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

interface EventMarkerProps {
  event: SessionEvent;
  position: number;
  isSelected: boolean;
  onClick: () => void;
  onHover: (event: SessionEvent | null) => void;
}

const EventMarker: React.FC<EventMarkerProps> = ({
  event,
  position,
  isSelected,
  onClick,
  onHover,
}) => {
  const severity = getEventSeverity(event.type);
  const colors = getSeverityColors(severity);
  const isDiamond = event.type === 'AI_RESPONDED' || event.type === 'USER_RESPONDED';
  
  return (
    <button
      className={cn(
        'absolute top-1/2 transition-all duration-150 z-10',
        'hover:scale-150 hover:z-20 focus:outline-none focus:ring-2 focus:ring-offset-2',
        colors.bg,
        isDiamond ? 'w-2.5 h-2.5' : 'w-3 h-3 rounded-full',
        isSelected && 'scale-150 ring-2 ring-offset-2 ring-slate-400 z-30'
      )}
      style={{ 
        left: `${position}%`, 
        transform: isDiamond 
          ? `translateX(-50%) translateY(-50%) rotate(45deg)` 
          : `translateX(-50%) translateY(-50%)` 
      }}
      onClick={onClick}
      onMouseEnter={() => onHover(event)}
      onMouseLeave={() => onHover(null)}
      title={`${formatEventType(event.type)} at ${new Date(event.timestamp).toLocaleTimeString()}`}
    />
  );
};

interface EventTooltipProps {
  event: SessionEvent;
  sessionStart: string;
}

const EventTooltip: React.FC<EventTooltipProps> = ({ event, sessionStart }) => {
  const severity = getEventSeverity(event.type);
  const colors = getSeverityColors(severity);
  const Icon = getEventIcon(event.type);
  
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
      <div className={cn(
        'bg-white rounded-lg shadow-lg border px-3 py-2 min-w-[200px]',
        colors.border
      )}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('p-1 rounded', colors.bgLight)}>
            <Icon className={cn('h-3 w-3', colors.text)} />
          </div>
          <span className={cn('text-sm font-medium', colors.text)}>
            {formatEventType(event.type)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3 w-3" />
          <span>{formatRelativeTime(event.timestamp, sessionStart)}</span>
        </div>
        {event.data && Object.keys(event.data).length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-xs text-slate-600">
            {Object.entries(event.data)
              .filter(([, value]) => value !== undefined && value !== null)
              .slice(0, 2)
              .map(([key, value]) => (
                <div key={key} className="truncate">
                  <span className="text-slate-400">{key}:</span>{' '}
                  <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
      <div className={cn(
        'w-2 h-2 bg-white border-b border-r rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1',
        colors.border
      )} />
    </div>
  );
};

interface DensityTrackProps {
  events: SessionEvent[];
  startTime: string;
  endTime: string;
}

const DensityTrack: React.FC<DensityTrackProps> = ({ events, startTime, endTime }) => {
  const density = useMemo(
    () => calculateEventDensity(events, startTime, endTime, 100),
    [events, startTime, endTime]
  );
  
  return (
    <div className="h-2 flex w-full rounded-sm overflow-hidden">
      {density.map((d, i) => (
        <div
          key={i}
          className="flex-1 transition-colors"
          style={{
            backgroundColor: d > 0
              ? `rgba(59, 130, 246, ${0.1 + d * 0.5})`
              : 'transparent',
          }}
        />
      ))}
    </div>
  );
};

export const SessionTimeline: React.FC<SessionTimelineProps> = ({
  events,
  sessionStart,
  sessionEnd,
  onTimeSelect,
  onEventSelect,
  selectedEventId,
  className,
  externalCurrentTime,
  disablePlayback = false,
}) => {
  // Calculate end time if not provided
  const computedEndTime = useMemo(() => {
    if (sessionEnd) return sessionEnd;
    if (events.length === 0) {
      // Default to 1 minute after start
      return new Date(new Date(sessionStart).getTime() + 60000).toISOString();
    }
    // Use the last event time + a small buffer
    const lastEventTime = Math.max(
      ...events.map(e => new Date(e.timestamp).getTime())
    );
    return new Date(lastEventTime + 5000).toISOString();
  }, [sessionEnd, events, sessionStart]);
  
  const totalDuration = useMemo(() => {
    return new Date(computedEndTime).getTime() - new Date(sessionStart).getTime();
  }, [sessionStart, computedEndTime]);
  
  // State
  const [currentTime, setCurrentTime] = useState<Date>(new Date(sessionStart));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<SessionEvent | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showEventsPanel, setShowEventsPanel] = useState(true);
  
  const trackRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Current position as percentage
  const currentPercent = useMemo(() => {
    return getPositionPercent(currentTime, sessionStart, computedEndTime);
  }, [currentTime, sessionStart, computedEndTime]);
  
  // Events at current time
  const eventsAtCurrentTime = useMemo(() => {
    return getEventsAtTime(events, currentTime, 2000);
  }, [events, currentTime]);
  
  // Handle track click/drag
  const handleTrackInteraction = useCallback((clientX: number) => {
    if (!trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newTime = getTimeFromPercent(percent, sessionStart, computedEndTime);
    
    setCurrentTime(newTime);
    onTimeSelect?.(newTime);
  }, [sessionStart, computedEndTime, onTimeSelect]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setIsPlaying(false);
    handleTrackInteraction(e.clientX);
  }, [handleTrackInteraction]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      handleTrackInteraction(e.clientX);
    }
  }, [isDragging, handleTrackInteraction]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  // Global mouse up handler for drag
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Sync with external current time (from video player)
  useEffect(() => {
    if (externalCurrentTime && !isDragging) {
      setCurrentTime(externalCurrentTime);
    }
  }, [externalCurrentTime, isDragging]);
  
  // Play/Pause functionality
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const newTime = new Date(prev.getTime() + 100);
          if (newTime >= new Date(computedEndTime)) {
            setIsPlaying(false);
            return new Date(computedEndTime);
          }
          return newTime;
        });
      }, 100);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }
    
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, computedEndTime]);
  
  // Event click handler
  const handleEventClick = useCallback((event: SessionEvent) => {
    setCurrentTime(new Date(event.timestamp));
    onEventSelect?.(event);
    onTimeSelect?.(new Date(event.timestamp));
  }, [onEventSelect, onTimeSelect]);
  
  // Skip forward/back
  const skipForward = useCallback(() => {
    const newTime = new Date(currentTime.getTime() + 5000);
    const maxTime = new Date(computedEndTime);
    setCurrentTime(newTime > maxTime ? maxTime : newTime);
  }, [currentTime, computedEndTime]);
  
  const skipBack = useCallback(() => {
    const newTime = new Date(currentTime.getTime() - 5000);
    const minTime = new Date(sessionStart);
    setCurrentTime(newTime < minTime ? minTime : newTime);
  }, [currentTime, sessionStart]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skipForward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skipBack();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [skipForward, skipBack]);
  
  // Jump to start/end
  const jumpToStart = useCallback(() => {
    setCurrentTime(new Date(sessionStart));
    setIsPlaying(false);
  }, [sessionStart]);
  
  const jumpToEnd = useCallback(() => {
    setCurrentTime(new Date(computedEndTime));
    setIsPlaying(false);
  }, [computedEndTime]);
  
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200', className)}>
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={jumpToStart}
            className="h-8 w-8"
            title="Jump to start"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBack}
            className="h-8 w-8"
            title="Skip back 5s"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </Button>
          {!disablePlayback && (
            <Button
              variant="default"
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
              className="h-9 w-9"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            className="h-8 w-8"
            title="Skip forward 5s"
          >
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={jumpToEnd}
            className="h-8 w-8"
            title="Jump to end"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Time display */}
        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="text-slate-700 font-medium">
            {formatRelativeTime(currentTime, sessionStart)}
          </span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500">
            {formatDuration(totalDuration)}
          </span>
        </div>
        
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            className="h-8 w-8"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-slate-500 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom(z => Math.min(4, z + 0.25))}
            className="h-8 w-8"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Timeline track */}
      <div className="px-4 pt-16 pb-4 overflow-visible">
        <div
          ref={trackRef}
          className="relative h-10 cursor-pointer select-none overflow-visible"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
        >
          {/* Track background */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-100 rounded-full" />
          
          {/* Density track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden">
            <DensityTrack
              events={events}
              startTime={sessionStart}
              endTime={computedEndTime}
            />
          </div>
          
          {/* Event markers */}
          {events.map(event => (
            <EventMarker
              key={event._id}
              event={event}
              position={getPositionPercent(event.timestamp, sessionStart, computedEndTime)}
              isSelected={event._id === selectedEventId}
              onClick={() => handleEventClick(event)}
              onHover={setHoveredEvent}
            />
          ))}
          
          {/* Scrubber/Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-800 z-40 pointer-events-none"
            style={{ left: `${currentPercent}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rounded-full shadow-md" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rounded-full shadow-md" />
          </div>
          
          {/* Hover tooltip */}
          {hoveredEvent && (
            <div
              className="absolute top-1/2"
              style={{
                left: `${getPositionPercent(hoveredEvent.timestamp, sessionStart, computedEndTime)}%`,
                transform: 'translateX(-50%) translateY(-50%)',
              }}
            >
              <EventTooltip event={hoveredEvent} sessionStart={sessionStart} />
            </div>
          )}
        </div>
        
        {/* Time markers */}
        <div className="relative mt-1 text-xs text-slate-400 select-none" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
          <span className="absolute left-0">00:00</span>
          <span className="absolute left-1/4 -translate-x-1/2">
            {formatDuration(totalDuration * 0.25)}
          </span>
          <span className="absolute left-1/2 -translate-x-1/2">
            {formatDuration(totalDuration * 0.5)}
          </span>
          <span className="absolute left-3/4 -translate-x-1/2">
            {formatDuration(totalDuration * 0.75)}
          </span>
          <span className="absolute right-0">
            {formatDuration(totalDuration)}
          </span>
        </div>
      </div>
      
      {/* Events at current time panel */}
      <div className="border-t border-slate-100">
        <button
          onClick={() => setShowEventsPanel(!showEventsPanel)}
          className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Events at {formatRelativeTime(currentTime, sessionStart)}</span>
            <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
              {eventsAtCurrentTime.length}
            </span>
          </div>
          {showEventsPanel ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        
        {showEventsPanel && (
          <div className="px-4 pb-4">
            {eventsAtCurrentTime.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">
                No events at this time. Click on a marker or drag the playhead.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {eventsAtCurrentTime.map(event => {
                  const severity = getEventSeverity(event.type);
                  const colors = getSeverityColors(severity);
                  const Icon = getEventIcon(event.type);
                  
                  return (
                    <button
                      key={event._id}
                      onClick={() => handleEventClick(event)}
                      className={cn(
                        'text-left p-3 rounded-lg border transition-all',
                        'hover:shadow-sm hover:border-slate-300',
                        event._id === selectedEventId
                          ? `${colors.bgLight} ${colors.border}`
                          : 'bg-white border-slate-200'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn('p-1.5 rounded-md', colors.bgLight)}>
                          <Icon className={cn('h-3.5 w-3.5', colors.text)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-sm font-medium truncate', colors.text)}>
                            {formatEventType(event.type)}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {formatRelativeTime(event.timestamp, sessionStart)}
                          </div>
                          {event.data && Object.keys(event.data).length > 0 && (
                            <div className="mt-1.5 text-xs text-slate-500 truncate">
                              {Object.entries(event.data)
                                .filter(([, v]) => v !== undefined && v !== null)
                                .slice(0, 1)
                                .map(([k, v]) => (
                                  <span key={k}>
                                    {k}: {typeof v === 'object' ? '...' : String(v)}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4 text-xs">
        <span className="text-slate-500">Event types:</span>
        {(['critical', 'warning', 'success', 'info'] as EventSeverity[]).map(severity => {
          const colors = getSeverityColors(severity);
          return (
            <div key={severity} className="flex items-center gap-1.5">
              <div className={cn('w-2.5 h-2.5 rounded-full', colors.bg)} />
              <span className="text-slate-600 capitalize">{severity}</span>
            </div>
          );
        })}
        <span className="text-slate-400">|</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rotate-45 bg-blue-500" />
          <span className="text-slate-600">Chat</span>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeline;

