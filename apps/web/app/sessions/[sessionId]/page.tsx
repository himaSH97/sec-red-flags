'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SessionTimeline } from '@/components/ui/session-timeline';
import { sessionApi, Session, SessionEvent, TypingAnalysis } from '@/lib/api';
import {
  getEventSeverity,
  getSeverityColors,
  formatRelativeTime,
} from '@/lib/timeline-utils';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  User,
  Hash,
  Activity,
  Clock,
  AlertTriangle,
  Eye,
  MessageSquare,
  Monitor,
  Users,
  ChevronDown,
  ChevronUp,
  Filter,
  Keyboard,
  Gauge,
  Timer,
  Zap,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

// Event type to icon/color mapping
const getEventStyle = (type: string) => {
  const styles: Record<string, { icon: typeof Activity; color: string; bg: string }> = {
    // Face detection
    FACE_RECOGNITION: { icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50' },
    FACE_TURNED_AWAY: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    FACE_RETURNED: { icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    FACE_NOT_DETECTED: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    FACE_DETECTED: { icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    
    // Gaze
    GAZE_AWAY: { icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50' },
    GAZE_RETURNED: { icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    
    // Eyes
    EYES_CLOSED_EXTENDED: { icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50' },
    EYES_OPENED: { icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    EXCESSIVE_BLINKING: { icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50' },
    SQUINTING_DETECTED: { icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50' },
    
    // Speaking
    SPEAKING_DETECTED: { icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-50' },
    SPEAKING_STOPPED: { icon: MessageSquare, color: 'text-slate-600', bg: 'bg-slate-50' },
    
    // Head
    HEAD_MOVEMENT_EXCESSIVE: { icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
    HEAD_TILTED: { icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
    HEAD_POSITION_NORMAL: { icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    
    // Expression
    EXPRESSION_CONFUSED: { icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
    LIP_READING_DETECTED: { icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-50' },
    
    // Browser
    TAB_SWITCHED_AWAY: { icon: Monitor, color: 'text-red-600', bg: 'bg-red-50' },
    TAB_RETURNED: { icon: Monitor, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    WINDOW_BLUR: { icon: Monitor, color: 'text-amber-600', bg: 'bg-amber-50' },
    WINDOW_FOCUS: { icon: Monitor, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    
    // Multiple faces
    MULTIPLE_FACES_DETECTED: { icon: Users, color: 'text-red-600', bg: 'bg-red-50' },
  };
  
  return styles[type] || { icon: Activity, color: 'text-slate-600', bg: 'bg-slate-50' };
};

// Format event type for display
const formatEventType = (type: string) => {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [typingAnalysis, setTypingAnalysis] = useState<TypingAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  
  const eventListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!sessionId) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const [sessionData, eventsData, analysisData] = await Promise.all([
          sessionApi.getSession(sessionId),
          sessionApi.getSessionEvents(sessionId),
          sessionApi.getTypingAnalysis(sessionId),
        ]);
        
        setSession(sessionData);
        // Sort events by timestamp ascending
        setEvents(eventsData.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        ));
        setTypingAnalysis(analysisData);
      } catch (err) {
        console.error('Failed to fetch session data:', err);
        setError('Failed to load session data. Make sure the API server is running.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [sessionId]);

  // Handle time selection from timeline
  const handleTimeSelect = useCallback((time: Date) => {
    setSelectedTime(time);
  }, []);

  // Handle event selection from timeline
  const handleEventSelect = useCallback((event: SessionEvent) => {
    setSelectedEventId(event._id);
    // Scroll to the event in the list
    setTimeout(() => {
      const element = document.getElementById(`event-${event._id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, []);

  // Filtered events based on selected time and severity
  const filteredEvents = useMemo(() => {
    let filtered = events;
    
    // Filter by severity if selected
    if (filterSeverity) {
      filtered = filtered.filter(e => getEventSeverity(e.type) === filterSeverity);
    }
    
    // If showing only events near selected time
    if (!showAllEvents && selectedTime) {
      const targetMs = selectedTime.getTime();
      filtered = filtered.filter(e => {
        const eventMs = new Date(e.timestamp).getTime();
        return Math.abs(eventMs - targetMs) <= 5000; // 5 second window
      });
    }
    
    return filtered;
  }, [events, filterSeverity, showAllEvents, selectedTime]);

  // Group events by type for summary
  const eventCounts = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, success: 0, info: 0 };
    for (const event of events) {
      const severity = getEventSeverity(event.type);
      counts[severity]++;
    }
    return counts;
  }, [events]);

  // Handle event click from event list
  const handleEventListClick = useCallback((event: SessionEvent) => {
    setSelectedEventId(event._id);
    setSelectedTime(new Date(event.timestamp));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-zinc-100">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/sessions')}
            className="shrink-0 hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-slate-800 tracking-tight truncate">
              Session Details
            </h1>
            <p className="text-sm text-slate-500 font-mono truncate">
              {sessionId}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Loading session data...</p>
          </div>
        ) : error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-8 text-center">
              <p className="text-red-600">{error}</p>
              <Button
                variant="outline"
                onClick={() => router.push('/sessions')}
                className="mt-4"
              >
                Back to Sessions
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Session Info Card */}
            {session && (
              <Card className="border-slate-200/80 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Session Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                        <Hash className="h-4 w-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Session ID
                        </p>
                        <p className="font-mono text-sm text-slate-700 break-all">
                          {session.sessionId.slice(0, 12)}...
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                        <User className="h-4 w-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Client ID
                        </p>
                        <p className="font-mono text-sm text-slate-700 break-all">
                          {session.clientId.slice(0, 12)}...
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                        <Calendar className="h-4 w-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Created At
                        </p>
                        <p className="text-sm text-slate-700">
                          {formatDate(session.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                        <Activity className="h-4 w-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Total Events
                        </p>
                        <p className="text-sm text-slate-700">
                          {events.length} events
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Typing Rhythm Analysis Card */}
            {typingAnalysis && (
              <Card className="border-slate-200/80 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                      <Keyboard className="h-5 w-5" />
                      Typing Rhythm Analysis
                    </CardTitle>
                    {/* Risk Badge */}
                    <div
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                        typingAnalysis.riskLevel === 'low' && 'bg-emerald-100 text-emerald-700',
                        typingAnalysis.riskLevel === 'medium' && 'bg-amber-100 text-amber-700',
                        typingAnalysis.riskLevel === 'high' && 'bg-red-100 text-red-700'
                      )}
                    >
                      {typingAnalysis.riskLevel === 'low' && <ShieldCheck className="h-4 w-4" />}
                      {typingAnalysis.riskLevel === 'medium' && <Shield className="h-4 w-4" />}
                      {typingAnalysis.riskLevel === 'high' && <ShieldAlert className="h-4 w-4" />}
                      <span>Risk: {typingAnalysis.riskScore}/100</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Metrics Grid */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                    {/* WPM Card */}
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                        <Gauge className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Typing Speed
                        </p>
                        <p className="text-lg font-semibold text-slate-800">
                          {typingAnalysis.speed.avgWPM} WPM
                        </p>
                        <p className="text-xs text-slate-500">
                          Peak: {typingAnalysis.speed.peakWPM} WPM
                        </p>
                      </div>
                    </div>

                    {/* Keystrokes Card */}
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100">
                        <Keyboard className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Total Keystrokes
                        </p>
                        <p className="text-lg font-semibold text-slate-800">
                          {typingAnalysis.totalKeystrokes.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500">
                          {typingAnalysis.totalCharacters.toLocaleString()} characters
                        </p>
                      </div>
                    </div>

                    {/* Corrections Card */}
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                        <Zap className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Corrections
                        </p>
                        <p className="text-lg font-semibold text-slate-800">
                          {typingAnalysis.corrections.correctionRatio}%
                        </p>
                        <p className="text-xs text-slate-500">
                          {typingAnalysis.corrections.totalCorrections} backspaces
                        </p>
                      </div>
                    </div>

                    {/* Timing Card */}
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                        <Timer className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Key Interval
                        </p>
                        <p className="text-lg font-semibold text-slate-800">
                          {typingAnalysis.interKeyInterval.avg}ms
                        </p>
                        <p className="text-xs text-slate-500">
                          σ = {typingAnalysis.interKeyInterval.stdDev}ms
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Suspicious Patterns */}
                  {typingAnalysis.suspiciousPatterns.length > 0 && (
                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Suspicious Patterns Detected
                      </h4>
                      <div className="space-y-2">
                        {typingAnalysis.suspiciousPatterns.map((pattern, index) => (
                          <div
                            key={index}
                            className={cn(
                              'flex items-center justify-between px-3 py-2 rounded-lg text-sm',
                              pattern.severity === 'low' && 'bg-blue-50 text-blue-700',
                              pattern.severity === 'medium' && 'bg-amber-50 text-amber-700',
                              pattern.severity === 'high' && 'bg-red-50 text-red-700'
                            )}
                          >
                            <span>{pattern.description}</span>
                            <span className="font-medium">+{pattern.contribution} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Burst Analysis */}
                  {typingAnalysis.bursts.burstCount > 0 && (
                    <div className="border-t border-slate-200 pt-4 mt-4">
                      <h4 className="text-sm font-medium text-slate-700 mb-3">
                        Burst Analysis
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="text-center p-2 rounded-lg bg-slate-50">
                          <p className="text-lg font-semibold text-slate-800">
                            {typingAnalysis.bursts.burstCount}
                          </p>
                          <p className="text-xs text-slate-500">Total Bursts</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-slate-50">
                          <p className="text-lg font-semibold text-slate-800">
                            {typingAnalysis.bursts.avgBurstSize}
                          </p>
                          <p className="text-xs text-slate-500">Avg Burst Size</p>
                        </div>
                        <div className={cn(
                          'text-center p-2 rounded-lg',
                          typingAnalysis.bursts.burstsAfterLongPause > 3 ? 'bg-amber-50' : 'bg-slate-50'
                        )}>
                          <p className={cn(
                            'text-lg font-semibold',
                            typingAnalysis.bursts.burstsAfterLongPause > 3 ? 'text-amber-700' : 'text-slate-800'
                          )}>
                            {typingAnalysis.bursts.burstsAfterLongPause}
                          </p>
                          <p className="text-xs text-slate-500">After Long Pause</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Interactive Timeline */}
            {session && events.length > 0 && (
              <SessionTimeline
                events={events}
                sessionStart={session.createdAt}
                onTimeSelect={handleTimeSelect}
                onEventSelect={handleEventSelect}
                selectedEventId={selectedEventId || undefined}
              />
            )}

            {/* Event Summary with Severity Filters */}
            {Object.keys(eventCounts).length > 0 && (
              <Card className="border-slate-200/80 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-slate-800">
                      Event Summary
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-slate-400" />
                      <span className="text-xs text-slate-500">Filter by severity:</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Severity quick filters */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      onClick={() => setFilterSeverity(null)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        filterSeverity === null
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      All ({events.length})
                    </button>
                    <button
                      onClick={() => setFilterSeverity('critical')}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        filterSeverity === 'critical'
                          ? 'bg-red-500 text-white'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      )}
                    >
                      Critical ({severityCounts.critical})
                    </button>
                    <button
                      onClick={() => setFilterSeverity('warning')}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        filterSeverity === 'warning'
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                      )}
                    >
                      Warning ({severityCounts.warning})
                    </button>
                    <button
                      onClick={() => setFilterSeverity('success')}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        filterSeverity === 'success'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                      )}
                    >
                      Success ({severityCounts.success})
                    </button>
                    <button
                      onClick={() => setFilterSeverity('info')}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        filterSeverity === 'info'
                          ? 'bg-blue-500 text-white'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      )}
                    >
                      Info ({severityCounts.info})
                    </button>
                  </div>
                  
                  {/* Event type badges */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(eventCounts)
                      .filter(([type]) => !filterSeverity || getEventSeverity(type) === filterSeverity)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => {
                        const style = getEventStyle(type);
                        return (
                          <span
                            key={type}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                              style.bg,
                              style.color
                            )}
                          >
                            {formatEventType(type)}
                            <span className="rounded-full bg-white/60 px-1.5 py-0.5">
                              {count}
                            </span>
                          </span>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Events List */}
            <Card className="border-slate-200/80 bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Events Timeline
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    {selectedTime && (
                      <button
                        onClick={() => setShowAllEvents(!showAllEvents)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                          showAllEvents
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            : 'bg-blue-500 text-white'
                        )}
                      >
                        {showAllEvents ? 'Show Near Time' : 'Show All'}
                      </button>
                    )}
                    <span className="text-sm text-slate-500">
                      {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                      {filteredEvents.length !== events.length && ` (filtered from ${events.length})`}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredEvents.length === 0 ? (
                  <div className="py-12 text-center">
                    <Activity className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-4 text-sm text-slate-500">
                      {events.length === 0
                        ? 'No events recorded for this session.'
                        : 'No events match the current filter.'}
                    </p>
                    {filterSeverity && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilterSeverity(null)}
                        className="mt-4"
                      >
                        Clear Filter
                      </Button>
                    )}
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4" ref={eventListRef}>
                    <div className="space-y-3">
                      {filteredEvents.map((event, index) => {
                        const style = getEventStyle(event.type);
                        const Icon = style.icon;
                        const severity = getEventSeverity(event.type);
                        const colors = getSeverityColors(severity);
                        const isSelected = event._id === selectedEventId;
                        
                        return (
                          <div
                            id={`event-${event._id}`}
                            key={event._id}
                            onClick={() => handleEventListClick(event)}
                            className={cn(
                              'relative rounded-lg border bg-white p-4 cursor-pointer',
                              'transition-all duration-200 hover:border-slate-300 hover:shadow-sm',
                              isSelected
                                ? `ring-2 ${colors.border} ring-offset-2`
                                : 'border-slate-200/80'
                            )}
                            style={{
                              animationDelay: `${index * 30}ms`,
                            }}
                          >
                            {/* Timeline connector line */}
                            {index < filteredEvents.length - 1 && (
                              <div className="absolute left-7 top-12 bottom-0 w-0.5 bg-slate-100 -mb-3 translate-y-1" />
                            )}
                            
                            <div className="flex items-start gap-3">
                              {/* Icon */}
                              <div
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg z-10',
                                  style.bg
                                )}
                              >
                                <Icon className={cn('h-4 w-4', style.color)} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span
                                    className={cn(
                                      'text-sm font-medium',
                                      style.color
                                    )}
                                  >
                                    {formatEventType(event.type)}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {session && (
                                      <span className="text-xs text-slate-400 font-mono">
                                        +{formatRelativeTime(event.timestamp, session.createdAt)}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                      <Clock className="h-3 w-3" />
                                      {formatTime(event.timestamp)}
                                    </span>
                                  </div>
                                </div>

                                {/* Event Data */}
                                {event.data && Object.keys(event.data).length > 0 && (
                                  <div className="mt-2 rounded-md bg-slate-50 p-2.5">
                                    <div className="grid gap-1.5 text-xs">
                                      {Object.entries(event.data)
                                        .filter(([, value]) => value !== undefined && value !== null)
                                        .slice(0, 5)
                                        .map(([key, value]) => (
                                          <div
                                            key={key}
                                            className="flex items-baseline gap-2"
                                          >
                                            <span className="text-slate-500 shrink-0">
                                              {key}:
                                            </span>
                                            <span className="text-slate-700 font-mono break-all">
                                              {typeof value === 'object'
                                                ? JSON.stringify(value)
                                                : String(value)}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
