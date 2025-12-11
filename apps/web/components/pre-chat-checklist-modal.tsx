'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Monitor,
  ScreenShare,
  Camera,
  Check,
  X,
  Loader2,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePreChatChecks, CheckStatus } from '@/lib/hooks/use-pre-chat-checks';

interface PreChatChecklistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (capturedFace: string) => void;
}

const getStatusIcon = (status: CheckStatus) => {
  switch (status) {
    case 'pending':
      return <div className="h-5 w-5 rounded-full border-2 border-slate-300" />;
    case 'checking':
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case 'passed':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-3 w-3 text-white" />
        </div>
      );
    case 'failed':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
          <X className="h-3 w-3 text-white" />
        </div>
      );
    case 'awaiting-capture':
      return <Camera className="h-5 w-5 text-blue-500 animate-pulse" />;
    default:
      return null;
  }
};

const getItemIcon = (id: string) => {
  switch (id) {
    case 'single-display':
      return <Monitor className="h-5 w-5" />;
    case 'screen-share':
      return <ScreenShare className="h-5 w-5" />;
    case 'camera-access':
      return <Camera className="h-5 w-5" />;
    default:
      return null;
  }
};

export function PreChatChecklistModal({
  open,
  onOpenChange,
  onComplete,
}: PreChatChecklistModalProps) {
  const {
    items,
    allPassed,
    isChecking,
    runAllChecks,
    retryCheck,
    resetChecks,
    cameraStream,
    capturedFace,
    captureFace,
    isAwaitingCapture,
  } = usePreChatChecks();

  const videoRef = useRef<HTMLVideoElement>(null);
  const hasStartedRef = useRef(false);

  // Start checks when modal opens
  useEffect(() => {
    if (open && !hasStartedRef.current) {
      hasStartedRef.current = true;
      runAllChecks();
    }
    
    if (!open) {
      hasStartedRef.current = false;
    }
  }, [open, runAllChecks]);

  // Connect camera stream to video element
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(console.error);
    }
  }, [cameraStream]);

  // Handle modal close - reset checks
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetChecks();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetChecks]
  );

  // Handle capture button click
  const handleCapture = useCallback(() => {
    if (videoRef.current) {
      captureFace(videoRef.current);
    }
  }, [captureFace]);

  // Handle continue to chat
  const handleContinue = useCallback(() => {
    if (capturedFace) {
      onComplete(capturedFace);
    }
  }, [capturedFace, onComplete]);

  // Get the camera check item
  const cameraItem = items.find((item) => item.id === 'camera-access');
  const showCameraPreview =
    cameraItem?.status === 'awaiting-capture' || cameraItem?.status === 'passed';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            Pre-Session Checks
          </DialogTitle>
          <DialogDescription>
            Complete these requirements before starting your session
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Checklist Items */}
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 transition-colors',
                  item.status === 'passed' && 'border-emerald-200 bg-emerald-50',
                  item.status === 'failed' && 'border-red-200 bg-red-50',
                  item.status === 'checking' && 'border-blue-200 bg-blue-50',
                  item.status === 'awaiting-capture' &&
                    'border-blue-200 bg-blue-50',
                  item.status === 'pending' && 'border-slate-200 bg-slate-50'
                )}
              >
                {/* Item Icon */}
                <div
                  className={cn(
                    'mt-0.5 rounded-lg p-2',
                    item.status === 'passed' && 'bg-emerald-100 text-emerald-600',
                    item.status === 'failed' && 'bg-red-100 text-red-600',
                    item.status === 'checking' && 'bg-blue-100 text-blue-600',
                    item.status === 'awaiting-capture' &&
                      'bg-blue-100 text-blue-600',
                    item.status === 'pending' && 'bg-slate-100 text-slate-400'
                  )}
                >
                  {getItemIcon(item.id)}
                </div>

                {/* Item Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4
                      className={cn(
                        'font-medium',
                        item.status === 'passed' && 'text-emerald-800',
                        item.status === 'failed' && 'text-red-800',
                        item.status === 'checking' && 'text-blue-800',
                        item.status === 'awaiting-capture' && 'text-blue-800',
                        item.status === 'pending' && 'text-slate-500'
                      )}
                    >
                      {item.label}
                    </h4>
                    {getStatusIcon(item.status)}
                  </div>
                  <p
                    className={cn(
                      'text-sm mt-0.5',
                      item.status === 'passed' && 'text-emerald-600',
                      item.status === 'failed' && 'text-red-600',
                      item.status === 'checking' && 'text-blue-600',
                      item.status === 'awaiting-capture' && 'text-blue-600',
                      item.status === 'pending' && 'text-slate-400'
                    )}
                  >
                    {item.description}
                  </p>

                  {/* Error message and retry button */}
                  {item.status === 'failed' && item.errorMessage && (
                    <div className="mt-2 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-red-600">{item.errorMessage}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={() => retryCheck(item.id)}
                          disabled={isChecking}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Camera Preview Area */}
          {showCameraPreview && (
            <div className="space-y-3">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
                {/* Video element */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    'h-full w-full object-cover',
                    capturedFace && 'hidden'
                  )}
                />

                {/* Captured image preview */}
                {capturedFace && (
                  <img
                    src={capturedFace}
                    alt="Captured face"
                    className="h-full w-full object-cover"
                  />
                )}

                {/* Face guide overlay */}
                {isAwaitingCapture && !capturedFace && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-40 w-32 rounded-full border-2 border-dashed border-white/50" />
                  </div>
                )}

                {/* Captured checkmark overlay */}
                {capturedFace && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500">
                      <Check className="h-8 w-8 text-white" />
                    </div>
                  </div>
                )}
              </div>

              {/* Capture instructions and button */}
              {isAwaitingCapture && !capturedFace && (
                <div className="text-center">
                  <p className="text-sm text-slate-500 mb-3">
                    Position your face within the oval and click capture
                  </p>
                  <Button onClick={handleCapture}>
                    <Camera className="h-4 w-4 mr-2" />
                    Capture Photo
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isChecking && !isAwaitingCapture}
          >
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!allPassed || !capturedFace}
            className="min-w-[140px]"
          >
            {allPassed && capturedFace ? (
              <>
                Start Session
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
