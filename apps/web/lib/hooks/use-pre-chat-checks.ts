'use client';

import { useState, useCallback, useRef } from 'react';
import {
  checkMultipleDisplays,
  isDisplayCheckSupported,
  DisplayCheckResult,
} from '@/lib/display-check';

export type CheckStatus = 'pending' | 'checking' | 'passed' | 'failed' | 'awaiting-capture';

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
  /** Screen share stream reference */
  screenStream: MediaStream | null;
  /** Captured face image (base64) */
  capturedFace: string | null;
  /** Capture the current video frame as face image */
  captureFace: (videoElement: HTMLVideoElement) => void;
  /** Whether waiting for face capture */
  isAwaitingCapture: boolean;
  /** Start camera access check (returns stream, but doesn't mark as passed until capture) */
  startCameraCheck: () => Promise<boolean>;
}

// Order: display check → screen share → camera (with photo capture)
const INITIAL_ITEMS: ChecklistItem[] = [
  {
    id: 'single-display',
    label: 'Single Display',
    description: 'Verify only one monitor is connected',
    status: 'pending',
  },
  {
    id: 'screen-share',
    label: 'Screen Share',
    description: 'Share your entire screen for monitoring',
    status: 'pending',
  },
  {
    id: 'camera-access',
    label: 'Camera & Photo',
    description: 'Capture your face for verification',
    status: 'pending',
  },
];

/**
 * Hook to manage pre-chat requirement checks
 * Validates display, screen share, and camera requirements before starting a chat session
 * Order: Single Display → Screen Share → Camera + Photo Capture
 */
export function usePreChatChecks(): PreChatChecksResult {
  const [items, setItems] = useState<ChecklistItem[]>(INITIAL_ITEMS);
  const [isChecking, setIsChecking] = useState(false);
  const [displayCheckResult, setDisplayCheckResult] =
    useState<DisplayCheckResult | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [capturedFace, setCapturedFace] = useState<string | null>(null);
  const [isAwaitingCapture, setIsAwaitingCapture] = useState(false);

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
        errorMessage: result.errorMessage || 
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
   * Request screen share
   */
  const checkScreenShare = useCallback(async (): Promise<boolean> => {
    updateItem('screen-share', { status: 'checking', errorMessage: undefined });

    try {
      // Stop any existing screen share stream
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }

      // Request screen share - must share entire screen (monitor)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });

      // Verify they selected a monitor (full screen), not a window or tab
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      
      // Check if the shared surface is a monitor
      // displaySurface will be 'monitor' for full screen share
      const displaySurface = settings.displaySurface;
      
      if (displaySurface && displaySurface !== 'monitor') {
        // User selected a window or tab instead of full screen
        stream.getTracks().forEach((track) => track.stop());
        updateItem('screen-share', {
          status: 'failed',
          errorMessage: 'Please share your entire screen, not a window or tab.',
        });
        return false;
      }

      // Optionally verify the shared screen size matches the primary screen
      const sharedWidth = settings.width || 0;
      const sharedHeight = settings.height || 0;
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;

      // Allow some tolerance for scaling
      const widthRatio = sharedWidth / screenWidth;
      const heightRatio = sharedHeight / screenHeight;
      
      if (widthRatio < 0.9 || heightRatio < 0.9) {
        // The shared screen seems smaller than expected
        console.warn('Screen share dimensions:', sharedWidth, 'x', sharedHeight);
        console.warn('Expected screen:', screenWidth, 'x', screenHeight);
        // Don't fail, just warn - different DPI settings can cause this
      }

      // Listen for when user stops sharing
      videoTrack.onended = () => {
        console.log('Screen share stopped by user');
        setScreenStream(null);
        updateItem('screen-share', {
          status: 'failed',
          errorMessage: 'Screen sharing was stopped. Please share your screen again.',
        });
      };

      setScreenStream(stream);
      updateItem('screen-share', { status: 'passed' });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      let userMessage = 'Screen sharing was denied or cancelled.';
      if (errorMessage.includes('NotAllowedError') || errorMessage.includes('Permission denied')) {
        userMessage = 'Screen sharing permission denied. Please allow screen sharing to continue.';
      } else if (errorMessage.includes('NotFoundError')) {
        userMessage = 'No screen available for sharing.';
      } else if (errorMessage.includes('AbortError') || errorMessage.includes('cancelled')) {
        userMessage = 'Screen sharing was cancelled. Please try again and select your entire screen.';
      }

      updateItem('screen-share', {
        status: 'failed',
        errorMessage: userMessage,
      });
      return false;
    }
  }, [updateItem, screenStream]);

  /**
   * Start camera access check - gets stream and waits for capture
   */
  const startCameraCheck = useCallback(async (): Promise<boolean> => {
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
      setIsAwaitingCapture(true);
      updateItem('camera-access', { status: 'awaiting-capture' });
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
   * Capture face from video element
   */
  const captureFace = useCallback(
    (videoElement: HTMLVideoElement) => {
      if (!videoElement || videoElement.readyState < 2) {
        console.error('Video not ready for capture');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const context = canvas.getContext('2d');

      if (!context) {
        console.error('Failed to get canvas context');
        return;
      }

      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

      setCapturedFace(imageBase64);
      setIsAwaitingCapture(false);
      updateItem('camera-access', { status: 'passed' });
      setIsChecking(false);
      isRunningRef.current = false;
    },
    [updateItem]
  );

  /**
   * Run all checks sequentially
   */
  const runAllChecks = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsChecking(true);

    // Reset captured face
    setCapturedFace(null);

    // Run checks sequentially: display → screen share → camera
    const displayPassed = await checkSingleDisplay();
    await new Promise((r) => setTimeout(r, 300));

    if (displayPassed) {
      const screenSharePassed = await checkScreenShare();
      await new Promise((r) => setTimeout(r, 300));

      if (screenSharePassed) {
        // Start camera check - will wait for capture
        await startCameraCheck();
        // Note: isChecking stays true until captureFace is called
        return;
      }
    }

    setIsChecking(false);
    isRunningRef.current = false;
  }, [checkSingleDisplay, checkScreenShare, startCameraCheck]);

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
        case 'screen-share':
          await checkScreenShare();
          break;
        case 'camera-access':
          await startCameraCheck();
          // Note: stays in checking state until capture
          return;
      }

      setIsChecking(false);
      isRunningRef.current = false;
    },
    [checkSingleDisplay, checkScreenShare, startCameraCheck]
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

    // Stop screen share stream if exists
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
    }

    setCapturedFace(null);
    setIsAwaitingCapture(false);
    setItems(INITIAL_ITEMS);
    setDisplayCheckResult(null);
    isRunningRef.current = false;
    setIsChecking(false);
  }, [cameraStream, screenStream]);

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
    screenStream,
    capturedFace,
    captureFace,
    isAwaitingCapture,
    startCameraCheck,
  };
}

export default usePreChatChecks;
