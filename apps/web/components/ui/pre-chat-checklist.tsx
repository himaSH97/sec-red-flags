'use client';

import React, { useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PreChatChecklistProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (cameraStream: MediaStream | null) => void;
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
      {status === 'checking' && (
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
        item.status === 'checking' && 'border-blue-200 bg-blue-50/50',
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
          item.status === 'checking' && 'bg-blue-100 text-blue-500',
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
            item.status === 'checking' && 'text-blue-700',
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
 * Pre-Chat Checklist Modal
 * Shows animated checklist of requirements before starting a chat session
 */
export function PreChatChecklist({
  open,
  onOpenChange,
  onComplete,
}: PreChatChecklistProps) {
  const {
    items,
    allPassed,
    isChecking,
    runAllChecks,
    retryCheck,
    resetChecks,
    cameraStream,
  } = usePreChatChecks();

  // Track if we've already started checks for this modal open
  const hasStartedChecksRef = useRef(false);
  const prevOpenRef = useRef(open);

  // Run checks when modal opens (only once per open)
  useEffect(() => {
    // Detect when modal opens (transition from closed to open)
    if (open && !prevOpenRef.current) {
      hasStartedChecksRef.current = false;
    }
    prevOpenRef.current = open;

    if (open && !hasStartedChecksRef.current) {
      hasStartedChecksRef.current = true;
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
  }, [open]); // Only depend on `open` - functions are stable via refs in the hook

  // Handle continue
  const handleContinue = useCallback(() => {
    if (allPassed) {
      onComplete(cameraStream);
    }
  }, [allPassed, onComplete, cameraStream]);

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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-slate-600" />
            Pre-Session Checklist
          </DialogTitle>
          <DialogDescription>
            Please complete these requirements before starting your session.
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="py-2">
          <ProgressIndicator items={items} />
        </div>

        {/* Checklist items */}
        <div className="space-y-3 py-2">
          {items.map((item, index) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              index={index}
              onRetry={retryCheck}
              isChecking={isChecking}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={isChecking}
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
            {isChecking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : allPassed ? (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
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
