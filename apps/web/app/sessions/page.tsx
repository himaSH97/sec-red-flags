'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sessionApi, Session, SessionsResponse } from '@/lib/api';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  User,
  Hash,
  ExternalLink,
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

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response: SessionsResponse = await sessionApi.getSessions(page, limit);
        setSessions(response.sessions);
        setTotalPages(response.totalPages);
        setTotal(response.total);
      } catch (err) {
        console.error('Failed to fetch sessions:', err);
        setError('Failed to load sessions. Make sure the API server is running.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, [page]);

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  const handleSessionClick = (sessionId: string) => {
    router.push(`/sessions/${sessionId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-zinc-100">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/')}
            className="shrink-0 hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
              Sessions
            </h1>
            <p className="text-sm text-slate-500">
              {total > 0 ? `${total} session${total !== 1 ? 's' : ''} recorded` : 'View all recorded sessions'}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            <p className="mt-4 text-sm text-slate-500">Loading sessions...</p>
          </div>
        ) : error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-8 text-center">
              <p className="text-red-600">{error}</p>
              <Button
                variant="outline"
                onClick={() => setPage(1)}
                className="mt-4"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : sessions.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Hash className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-700">No sessions yet</h3>
              <p className="mt-2 text-sm text-slate-500">
                Sessions will appear here once users start connecting.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Sessions List */}
            <div className="space-y-3">
              {sessions.map((session, index) => (
                <Card
                  key={session._id}
                  onClick={() => handleSessionClick(session.sessionId)}
                  className={cn(
                    'cursor-pointer border-slate-200/80 bg-white/80 backdrop-blur-sm',
                    'transition-all duration-200 hover:border-slate-300 hover:bg-white hover:shadow-md',
                    'group'
                  )}
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <CardContent className="flex items-center gap-4 p-5">
                    {/* Session ID */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-mono text-sm font-medium text-slate-700 truncate">
                          {session.sessionId}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          <span className="font-mono truncate max-w-[200px]">
                            {session.clientId}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(session.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-slate-600">
                  Page <span className="font-medium">{page}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={page === totalPages}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

