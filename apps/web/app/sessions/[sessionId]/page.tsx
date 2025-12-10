'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { sessionApi, Session, SessionEvent } from '@/lib/api';
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
    
    // Speaking
    SPEAKING_DETECTED: { icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-50' },
    SPEAKING_STOPPED: { icon: MessageSquare, color: 'text-slate-600', bg: 'bg-slate-50' },
    
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!sessionId) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const [sessionData, eventsData] = await Promise.all([
          sessionApi.getSession(sessionId),
          sessionApi.getSessionEvents(sessionId),
        ]);
        
        setSession(sessionData);
        setEvents(eventsData);
      } catch (err) {
        console.error('Failed to fetch session data:', err);
        setError('Failed to load session data. Make sure the API server is running.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [sessionId]);

  // Group events by type for summary
  const eventCounts = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-zinc-100">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
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
      <main className="mx-auto max-w-5xl px-6 py-8">
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
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                        <Hash className="h-4 w-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Session ID
                        </p>
                        <p className="font-mono text-sm text-slate-700 break-all">
                          {session.sessionId}
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
                          {session.clientId}
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
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Event Summary */}
            {Object.keys(eventCounts).length > 0 && (
              <Card className="border-slate-200/80 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Event Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(eventCounts)
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
                  <span className="text-sm text-slate-500">
                    {events.length} event{events.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <div className="py-12 text-center">
                    <Activity className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-4 text-sm text-slate-500">
                      No events recorded for this session.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-3">
                      {events.map((event, index) => {
                        const style = getEventStyle(event.type);
                        const Icon = style.icon;
                        
                        return (
                          <div
                            key={event._id}
                            className={cn(
                              'relative rounded-lg border border-slate-200/80 bg-white p-4',
                              'transition-all duration-200 hover:border-slate-300 hover:shadow-sm'
                            )}
                            style={{
                              animationDelay: `${index * 30}ms`,
                            }}
                          >
                            <div className="flex items-start gap-3">
                              {/* Icon */}
                              <div
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
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
                                  <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                                    <Clock className="h-3 w-3" />
                                    {formatTime(event.timestamp)}
                                  </span>
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

