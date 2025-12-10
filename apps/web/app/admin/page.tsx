'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { adminApi, SystemConfig } from '@/lib/api';
import { Shield, ArrowLeft, Settings, Scan, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await adminApi.getConfig();
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFaceRecognition = async (enabled: boolean) => {
    if (!config) return;

    setUpdating(true);
    try {
      const updated = await adminApi.updateConfig({ faceRecognitionEnabled: enabled });
      setConfig(updated);
      toast.success(
        enabled ? 'Face recognition enabled' : 'Face recognition disabled',
        {
          description: enabled
            ? 'Users will need to verify their face to start a session.'
            : 'Users can start sessions without face verification.',
        }
      );
    } catch (error) {
      console.error('Failed to update config:', error);
      toast.error('Failed to update configuration');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-slate-700" />
              <span className="text-lg font-semibold text-slate-800">SecFlags</span>
              <span className="text-slate-400">/</span>
              <span className="text-slate-600">Admin</span>
            </div>
            <Button variant="ghost" onClick={() => router.push('/')} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-slate-700" />
            <h1 className="text-3xl font-bold text-slate-900">System Settings</h1>
          </div>
          <p className="text-slate-600">
            Configure system-wide settings for the SecFlags application.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Face Recognition Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-slate-100 p-2">
                    <Scan className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <CardTitle>Face Recognition</CardTitle>
                    <CardDescription>
                      Control whether face verification is required for chat sessions.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="font-medium text-slate-900">Enable Face Recognition</p>
                    <p className="text-sm text-slate-500">
                      When enabled, users must verify their face before starting a chat session.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {updating && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    <Switch
                      checked={config?.faceRecognitionEnabled ?? true}
                      onCheckedChange={handleToggleFaceRecognition}
                      disabled={updating}
                    />
                  </div>
                </div>

                {/* Status indicator */}
                <div className="mt-4 flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      config?.faceRecognitionEnabled ? 'bg-green-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className="text-sm text-slate-600">
                    Face recognition is currently{' '}
                    <span className="font-medium">
                      {config?.faceRecognitionEnabled ? 'enabled' : 'disabled'}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

