'use client';

import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  usePreChatChecks,
  CheckStatus,
  ChecklistItem,
  PreChatChecksConfig,
} from '@/lib/hooks/use-pre-chat-checks';
import {
  Check,
  X,
  Loader2,
  Monitor,
  Camera,
  RefreshCw,
  ArrowRight,
  Shield,
  ScreenShare,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PreChatChecklistProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (
    cameraStream: MediaStream | null,
    capturedFaceImage: string | null
  ) => void;
  /** Configuration for which checks are enabled */
  config?: PreChatChecksConfig;
}

/**
 * Get the icon for a checklist item
 */
function getItemIcon(id: string) {
  switch (id) {
    case 'single-display':
      return Monitor;
    case 'camera-access':
      return Camera;
    case 'screen-share':
      return ScreenShare;
    case 'face-capture':
      return User;
    default:
      return Shield;
  }
}

/**
 * Status indicator component with animations
 */
function StatusIndicator({ status }: { status: CheckStatus }) {
  return (
    <div className="relative flex h-8 w-8 items-center justify-center">
      {status === 'pending' && (
        <div className="h-6 w-6 rounded-full border-2 border-slate-200 bg-slate-50 transition-all duration-300" />
      )}
      {(status === 'checking' || status === 'awaiting-capture') && (
        <div className="animate-pulse">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      )}
      {status === 'passed' && (
        <div className="animate-scale-in flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
          <Check className="h-4 w-4 animate-check-mark" strokeWidth={3} />
        </div>
      )}
      {status === 'failed' && (
        <div className="animate-shake flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-200">
          <X className="h-4 w-4" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

/**
 * Individual checklist item component
 */
function ChecklistItemRow({
  item,
  index,
  onRetry,
  isChecking,
}: {
  item: ChecklistItem;
  index: number;
  onRetry: (id: string) => void;
  isChecking: boolean;
}) {
  const Icon = getItemIcon(item.id);
  const canRetry = item.status === 'failed' && !isChecking;

  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-xl border p-4 transition-all duration-500',
        'animate-slide-in-up',
        item.status === 'pending' && 'border-slate-200 bg-slate-50/50',
        (item.status === 'checking' || item.status === 'awaiting-capture') &&
          'border-blue-200 bg-blue-50/50',
        item.status === 'passed' &&
          'border-emerald-200 bg-emerald-50/50 shadow-sm',
        item.status === 'failed' && 'border-red-200 bg-red-50/50'
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-300',
          item.status === 'pending' && 'bg-slate-100 text-slate-400',
          (item.status === 'checking' || item.status === 'awaiting-capture') &&
            'bg-blue-100 text-blue-500',
          item.status === 'passed' && 'bg-emerald-100 text-emerald-600',
          item.status === 'failed' && 'bg-red-100 text-red-500'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4
          className={cn(
            'font-medium transition-colors duration-300',
            item.status === 'pending' && 'text-slate-600',
            (item.status === 'checking' ||
              item.status === 'awaiting-capture') &&
              'text-blue-700',
            item.status === 'passed' && 'text-emerald-700',
            item.status === 'failed' && 'text-red-700'
          )}
        >
          {item.label}
        </h4>
        <p
          className={cn(
            'text-sm transition-colors duration-300',
            item.status === 'failed' ? 'text-red-600' : 'text-slate-500'
          )}
        >
          {item.errorMessage || item.description}
        </p>
      </div>

      {/* Status / Retry button */}
      <div className="shrink-0">
        {canRetry ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRetry(item.id)}
            className="gap-1.5 text-red-600 hover:bg-red-100 hover:text-red-700"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        ) : (
          <StatusIndicator status={item.status} />
        )}
      </div>
    </div>
  );
}

/**
 * Progress indicator
 */
function ProgressIndicator({ items }: { items: ChecklistItem[] }) {
  const passed = items.filter((i) => i.status === 'passed').length;
  const total = items.length;
  const percent = (passed / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Progress</span>
        <span className="font-medium text-slate-700">
          {passed} of {total} complete
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Face capture component shown when awaiting face capture
 */
function FaceCapturePanel({
  cameraStream,
  onCapture,
}: {
  cameraStream: MediaStream | null;
  onCapture: (imageBase64: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Set up video stream
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(console.error);
    }
  }, [cameraStream]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageBase64);
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  }, [capturedImage, onCapture]);

  return (
    <div className="animate-slide-in-up rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
          <Camera className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h4 className="font-medium text-blue-700">Capture Your Face</h4>
          <p className="text-sm text-slate-500">
            Position your face in the frame and click capture
          </p>
        </div>
      </div>

      {/* Camera preview / captured image */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
        {/* Video element (hidden when captured) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'h-full w-full object-cover',
            capturedImage && 'hidden'
          )}
        />

        {/* Captured image preview */}
        {capturedImage && (
          <img
            src={capturedImage}
            alt="Captured face"
            className="h-full w-full object-cover"
          />
        )}

        {/* Canvas for capture (hidden) */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Face guide overlay */}
        {!capturedImage && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-24 rounded-full border-2 border-dashed border-white/50" />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex justify-center gap-2">
        {!capturedImage ? (
          <Button onClick={handleCapture} size="sm" className="gap-1.5">
            <Camera className="h-4 w-4" />
            Capture
          </Button>
        ) : (
          <>
            <Button
              onClick={handleRetake}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Retake
            </Button>
            <Button
              onClick={handleConfirm}
              size="sm"
              className="gap-1.5 bg-emerald-500 hover:bg-emerald-600"
            >
              <Check className="h-4 w-4" />
              Confirm
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Pre-Chat Checklist Modal
 * Shows animated checklist of requirements before starting a chat session
 */
export function PreChatChecklist({
  open,
  onOpenChange,
  onComplete,
  config = {},
}: PreChatChecklistProps) {
  const {
    items,
    allPassed,
    isChecking,
    isAwaitingCapture,
    runAllChecks,
    retryCheck,
    resetChecks,
    completeFaceCapture,
    cameraStream,
    capturedFaceImage,
  } = usePreChatChecks(config);

  // Track if we've already started checks for this modal open
  const hasStartedChecksRef = useRef(false);
  const prevOpenRef = useRef(open);

  // Check if there are no checks to run (all toggles disabled)
  const noChecksNeeded = items.length === 0;

  // Run checks when modal opens (only once per open)
  useEffect(() => {
    // Detect when modal opens (transition from closed to open)
    if (open && !prevOpenRef.current) {
      hasStartedChecksRef.current = false;
    }
    prevOpenRef.current = open;

    if (open && !hasStartedChecksRef.current) {
      hasStartedChecksRef.current = true;

      // If no checks needed, auto-complete after a brief delay
      if (noChecksNeeded) {
        const timer = setTimeout(() => {
          onComplete(null, null);
        }, 500);
        return () => clearTimeout(timer);
      }

      // Small delay for modal animation
      const timer = setTimeout(() => {
        runAllChecks();
      }, 400);
      return () => clearTimeout(timer);
    }

    if (!open) {
      // Reset when modal closes
      hasStartedChecksRef.current = false;
      resetChecks();
    }
  }, [open, noChecksNeeded, onComplete]); // Only depend on `open` - functions are stable via refs in the hook

  // Handle continue
  const handleContinue = useCallback(() => {
    if (allPassed) {
      onComplete(cameraStream, capturedFaceImage);
    }
  }, [allPassed, onComplete, cameraStream, capturedFaceImage]);

  // Handle close - cleanup camera if needed
  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, cameraStream]
  );

  // Filter out face-capture from regular items when awaiting capture
  const regularItems = isAwaitingCapture
    ? items.filter((item) => item.id !== 'face-capture')
    : items;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-slate-600" />
            Pre-Session Checklist
          </DialogTitle>
          <DialogDescription>
            {noChecksNeeded
              ? 'No pre-session checks are required. Starting your session...'
              : 'Please complete these requirements before starting your session.'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress - only show if there are checks */}
        {!noChecksNeeded && (
          <div className="py-2">
            <ProgressIndicator items={items} />
          </div>
        )}

        {/* Checklist items */}
        {!noChecksNeeded && (
          <div className="space-y-3 py-2">
            {regularItems.map((item, index) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                index={index}
                onRetry={retryCheck}
                isChecking={isChecking}
              />
            ))}

            {/* Face capture panel - shown when awaiting capture */}
            {isAwaitingCapture && (
              <FaceCapturePanel
                cameraStream={cameraStream}
                onCapture={completeFaceCapture}
              />
            )}
          </div>
        )}

        {/* No checks needed message */}
        {noChecksNeeded && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={isChecking && !isAwaitingCapture}
          >
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!allPassed || isChecking}
            className={cn(
              'gap-2 transition-all duration-300',
              allPassed &&
                'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-200'
            )}
          >
            {isChecking && !isAwaitingCapture ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : allPassed ? (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            ) : isAwaitingCapture ? (
              'Capture your face'
            ) : (
              'Complete all checks'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PreChatChecklist;
