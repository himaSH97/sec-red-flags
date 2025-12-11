'use client';

import { useState, useCallback, useRef } from 'react';
import {
  checkMultipleDisplays,
  isDisplayCheckSupported,
  DisplayCheckResult,
} from '@/lib/display-check';

export type CheckStatus = 'pending' | 'checking' | 'passed' | 'failed';

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  errorMessage?: string;
}

export interface PreChatChecksResult {
  /** All checklist items with their current status */
  items: ChecklistItem[];
  /** Whether all checks have passed */
  allPassed: boolean;
  /** Whether any check is currently running */
  isChecking: boolean;
  /** Run all checks sequentially */
  runAllChecks: () => Promise<void>;
  /** Retry a specific check by ID */
  retryCheck: (id: string) => Promise<void>;
  /** Reset all checks to pending state */
  resetChecks: () => void;
  /** Display check result (for logging/audit) */
  displayCheckResult: DisplayCheckResult | null;
  /** Camera stream reference (to pass to chat page) */
  cameraStream: MediaStream | null;
}

const INITIAL_ITEMS: ChecklistItem[] = [
  {
    id: 'single-display',
    label: 'Single Display',
    description: 'Verify only one monitor is connected',
    status: 'pending',
  },
  {
    id: 'camera-access',
    label: 'Camera Access',
    description: 'Grant permission for face tracking',
    status: 'pending',
  },
  {
    id: 'fullscreen',
    label: 'Fullscreen Mode',
    description: 'Enter fullscreen for the session',
    status: 'pending',
  },
];

/**
 * Hook to manage pre-chat requirement checks
 * Validates display, camera, and fullscreen requirements before starting a chat session
 */
export function usePreChatChecks(): PreChatChecksResult {
  const [items, setItems] = useState<ChecklistItem[]>(INITIAL_ITEMS);
  const [isChecking, setIsChecking] = useState(false);
  const [displayCheckResult, setDisplayCheckResult] =
    useState<DisplayCheckResult | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Track if checks are running to prevent concurrent runs
  const isRunningRef = useRef(false);

  /**
   * Update a specific item's status
   */
  const updateItem = useCallback(
    (id: string, updates: Partial<ChecklistItem>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
    },
    []
  );

  /**
   * Check for single display
   */
  const checkSingleDisplay = useCallback(async (): Promise<boolean> => {
    updateItem('single-display', {
      status: 'checking',
      errorMessage: undefined,
    });

    // If API not supported, pass with warning (will be logged)
    if (!isDisplayCheckSupported()) {
      setDisplayCheckResult({
        hasMultipleDisplays: false,
        screenCount: 1,
        screens: [
          {
            width: window.screen.width,
            height: window.screen.height,
            isPrimary: true,
          },
        ],
        permissionDenied: false,
        apiSupported: false,
        errorMessage: 'Display check not supported in this browser',
      });
      updateItem('single-display', {
        status: 'passed',
        errorMessage: 'Browser does not support display detection',
      });
      return true;
    }

    const result = await checkMultipleDisplays();
    setDisplayCheckResult(result);

    if (result.permissionDenied) {
      updateItem('single-display', {
        status: 'failed',
        errorMessage:
          'Screen access permission is required. Please allow access to continue.',
      });
      return false;
    }

    if (result.hasMultipleDisplays) {
      updateItem('single-display', {
        status: 'failed',
        errorMessage: `${result.screenCount} displays detected. Please disconnect extra displays.`,
      });
      return false;
    }

    updateItem('single-display', { status: 'passed' });
    return true;
  }, [updateItem]);

  /**
   * Check for camera access
   */
  const checkCameraAccess = useCallback(async (): Promise<boolean> => {
    updateItem('camera-access', {
      status: 'checking',
      errorMessage: undefined,
    });

    try {
      // Stop any existing stream first
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      setCameraStream(stream);
      updateItem('camera-access', { status: 'passed' });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      let userMessage = 'Camera access was denied';
      if (errorMessage.includes('NotFoundError')) {
        userMessage = 'No camera found. Please connect a camera.';
      } else if (errorMessage.includes('NotAllowedError')) {
        userMessage =
          'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (errorMessage.includes('NotReadableError')) {
        userMessage =
          'Camera is in use by another application. Please close other apps using the camera.';
      }

      updateItem('camera-access', {
        status: 'failed',
        errorMessage: userMessage,
      });
      return false;
    }
  }, [updateItem, cameraStream]);

  /**
   * Check and enter fullscreen mode
   */
  const checkFullscreen = useCallback(async (): Promise<boolean> => {
    updateItem('fullscreen', { status: 'checking', errorMessage: undefined });

    // Check if already in fullscreen
    if (document.fullscreenElement) {
      updateItem('fullscreen', { status: 'passed' });
      return true;
    }

    try {
      await document.documentElement.requestFullscreen();
      updateItem('fullscreen', { status: 'passed' });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      updateItem('fullscreen', {
        status: 'failed',
        errorMessage:
          errorMessage.includes('denied') ||
          errorMessage.includes('not allowed')
            ? 'Fullscreen request was denied. Please allow fullscreen mode.'
            : 'Failed to enter fullscreen mode. Please try again.',
      });
      return false;
    }
  }, [updateItem]);

  /**
   * Run all checks sequentially
   */
  const runAllChecks = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsChecking(true);

    // Run checks sequentially with small delays for visual feedback
    const displayPassed = await checkSingleDisplay();
    await new Promise((r) => setTimeout(r, 300));

    if (displayPassed) {
      const cameraPassed = await checkCameraAccess();
      await new Promise((r) => setTimeout(r, 300));

      if (cameraPassed) {
        await checkFullscreen();
      }
    }

    setIsChecking(false);
    isRunningRef.current = false;
  }, [checkSingleDisplay, checkCameraAccess, checkFullscreen]);

  /**
   * Retry a specific check
   */
  const retryCheck = useCallback(
    async (id: string) => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      setIsChecking(true);

      switch (id) {
        case 'single-display':
          await checkSingleDisplay();
          break;
        case 'camera-access':
          await checkCameraAccess();
          break;
        case 'fullscreen':
          await checkFullscreen();
          break;
      }

      setIsChecking(false);
      isRunningRef.current = false;
    },
    [checkSingleDisplay, checkCameraAccess, checkFullscreen]
  );

  /**
   * Reset all checks to pending
   */
  const resetChecks = useCallback(() => {
    // Stop camera stream if exists
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }

    setItems(INITIAL_ITEMS);
    setDisplayCheckResult(null);
  }, [cameraStream]);

  // Calculate if all checks passed
  const allPassed = items.every((item) => item.status === 'passed');

  return {
    items,
    allPassed,
    isChecking,
    runAllChecks,
    retryCheck,
    resetChecks,
    displayCheckResult,
    cameraStream,
  };
}

export default usePreChatChecks;
