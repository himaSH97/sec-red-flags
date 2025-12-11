'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  checkMultipleDisplays,
  isDisplayCheckSupported,
  DisplayCheckResult,
} from '@/lib/display-check';
import { screenShareService } from '@/lib/screen-share';

export type CheckStatus =
  | 'pending'
  | 'checking'
  | 'passed'
  | 'failed'
  | 'awaiting-capture'; // For interactive steps like face capture

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  errorMessage?: string;
}

export interface PreChatChecksConfig {
  /** Whether multi-display check is enabled */
  multiDisplayCheckEnabled?: boolean;
  /** Whether screen sharing is enabled */
  screenShareEnabled?: boolean;
  /** Whether face recognition is enabled */
  faceRecognitionEnabled?: boolean;
}

export interface PreChatChecksResult {
  /** All checklist items with their current status */
  items: ChecklistItem[];
  /** Whether all checks have passed */
  allPassed: boolean;
  /** Whether any check is currently running */
  isChecking: boolean;
  /** Whether waiting for face capture */
  isAwaitingCapture: boolean;
  /** Run all checks sequentially */
  runAllChecks: () => Promise<void>;
  /** Retry a specific check by ID */
  retryCheck: (id: string) => Promise<void>;
  /** Reset all checks to pending state */
  resetChecks: () => void;
  /** Complete face capture with the captured image */
  completeFaceCapture: (imageBase64: string) => void;
  /** Display check result (for logging/audit) */
  displayCheckResult: DisplayCheckResult | null;
  /** Camera stream reference (to pass to chat page) */
  cameraStream: MediaStream | null;
  /** Captured face image (base64) */
  capturedFaceImage: string | null;
}

const ALL_ITEMS: ChecklistItem[] = [
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
    id: 'screen-share',
    label: 'Screen Share',
    description: 'Share your entire screen for session monitoring',
    status: 'pending',
  },
  {
    id: 'face-capture',
    label: 'Face Capture',
    description: 'Capture your face for identity verification',
    status: 'pending',
  },
];

/**
 * Get initial checklist items based on config
 */
function getInitialItems(config: PreChatChecksConfig): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  // Multi-display check (defaults to enabled)
  if (config.multiDisplayCheckEnabled !== false) {
    items.push(ALL_ITEMS.find((i) => i.id === 'single-display')!);
  }

  // Camera access is always needed if face recognition is enabled
  if (config.faceRecognitionEnabled !== false) {
    items.push(ALL_ITEMS.find((i) => i.id === 'camera-access')!);
  }

  // Screen share (defaults to enabled)
  if (config.screenShareEnabled !== false) {
    items.push(ALL_ITEMS.find((i) => i.id === 'screen-share')!);
  }

  // Face capture (only if face recognition is enabled)
  if (config.faceRecognitionEnabled !== false) {
    items.push(ALL_ITEMS.find((i) => i.id === 'face-capture')!);
  }

  return items;
}

/**
 * Hook to manage pre-chat requirement checks
 * Validates display, camera, and fullscreen requirements before starting a chat session
 */
export function usePreChatChecks(
  config: PreChatChecksConfig = {}
): PreChatChecksResult {
  // Memoize initial items based on config
  const initialItems = useMemo(
    () => getInitialItems(config),
    [
      config.multiDisplayCheckEnabled,
      config.screenShareEnabled,
      config.faceRecognitionEnabled,
    ]
  );

  const [items, setItems] = useState<ChecklistItem[]>(initialItems);
  const [isChecking, setIsChecking] = useState(false);
  const [isAwaitingCapture, setIsAwaitingCapture] = useState(false);
  const [displayCheckResult, setDisplayCheckResult] =
    useState<DisplayCheckResult | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedFaceImage, setCapturedFaceImage] = useState<string | null>(
    null
  );

  // Store config in ref to use in callbacks
  const configRef = useRef(config);
  configRef.current = config;

  // Track if checks have started to prevent resetting completed items
  const hasStartedRef = useRef(false);

  // Update items when config changes (only before checks have started)
  useEffect(() => {
    // Only sync items if we haven't started checking yet
    if (!hasStartedRef.current) {
      setItems(initialItems);
    }
  }, [initialItems]);

  // Track if checks are running to prevent concurrent runs
  const isRunningRef = useRef(false);
  // Resolve function for face capture promise
  const faceCaptureResolveRef = useRef<((success: boolean) => void) | null>(
    null
  );

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

  // Ref to track camera stream without causing re-renders
  const cameraStreamRef = useRef<MediaStream | null>(null);

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
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
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
  }, [updateItem]);

  /**
   * Check for screen share permission
   * Requires sharing the entire screen (not a window or tab)
   */
  const checkScreenShare = useCallback(async (): Promise<boolean> => {
    updateItem('screen-share', {
      status: 'checking',
      errorMessage: undefined,
    });

    try {
      await screenShareService.startSharing();
      updateItem('screen-share', { status: 'passed' });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      let userMessage = 'Screen sharing was cancelled';

      // Check for invalid surface type (window or tab instead of full screen)
      if (errorMessage.includes('INVALID_SURFACE:')) {
        userMessage = errorMessage.replace('INVALID_SURFACE:', '');
      } else if (
        errorMessage.includes('NotAllowedError') ||
        errorMessage.includes('Permission denied')
      ) {
        userMessage =
          'Screen sharing permission denied. Please allow screen sharing to continue.';
      } else if (errorMessage.includes('AbortError')) {
        userMessage =
          'Screen sharing was cancelled. Please select your entire screen to share.';
      }

      updateItem('screen-share', {
        status: 'failed',
        errorMessage: userMessage,
      });
      return false;
    }
  }, [updateItem]);

  /**
   * Face capture check - waits for user to capture their face
   * This is an interactive step that requires user action
   */
  const checkFaceCapture = useCallback(async (): Promise<boolean> => {
    updateItem('face-capture', {
      status: 'awaiting-capture',
      errorMessage: undefined,
    });
    setIsAwaitingCapture(true);

    // Wait for face capture to complete
    return new Promise<boolean>((resolve) => {
      faceCaptureResolveRef.current = resolve;
    });
  }, [updateItem]);

  /**
   * Complete the face capture with the captured image
   */
  const completeFaceCapture = useCallback(
    (imageBase64: string) => {
      if (!imageBase64) {
        updateItem('face-capture', {
          status: 'failed',
          errorMessage: 'No face image captured. Please try again.',
        });
        setIsAwaitingCapture(false);
        faceCaptureResolveRef.current?.(false);
        faceCaptureResolveRef.current = null;
        return;
      }

      setCapturedFaceImage(imageBase64);
      updateItem('face-capture', { status: 'passed' });
      setIsAwaitingCapture(false);
      setIsChecking(false);
      isRunningRef.current = false;
      faceCaptureResolveRef.current?.(true);
      faceCaptureResolveRef.current = null;
    },
    [updateItem]
  );

  /**
   * Run all checks sequentially based on enabled config options
   */
  const runAllChecks = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    hasStartedRef.current = true;
    setIsChecking(true);

    const cfg = configRef.current;

    // Check 1: Single display (if enabled)
    if (cfg.multiDisplayCheckEnabled !== false) {
      const displayPassed = await checkSingleDisplay();
      await new Promise((r) => setTimeout(r, 300));
      if (!displayPassed) {
        setIsChecking(false);
        isRunningRef.current = false;
        return;
      }
    }

    // Check 2: Camera access (if face recognition is enabled)
    if (cfg.faceRecognitionEnabled !== false) {
      const cameraPassed = await checkCameraAccess();
      await new Promise((r) => setTimeout(r, 300));
      if (!cameraPassed) {
        setIsChecking(false);
        isRunningRef.current = false;
        return;
      }
    }

    // Check 3: Screen share (if enabled)
    if (cfg.screenShareEnabled !== false) {
      const screenSharePassed = await checkScreenShare();
      await new Promise((r) => setTimeout(r, 300));
      if (!screenSharePassed) {
        setIsChecking(false);
        isRunningRef.current = false;
        return;
      }
    }

    // Check 4: Face capture (if face recognition is enabled)
    if (cfg.faceRecognitionEnabled !== false) {
      // Face capture is interactive - it will resolve when user captures
      await checkFaceCapture();
      // Note: isChecking and isRunningRef are reset in completeFaceCapture
      return;
    }

    // If we got here, all applicable checks passed
    setIsChecking(false);
    isRunningRef.current = false;
  }, [
    checkSingleDisplay,
    checkCameraAccess,
    checkScreenShare,
    checkFaceCapture,
  ]);

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
          setIsChecking(false);
          isRunningRef.current = false;
          break;
        case 'camera-access':
          await checkCameraAccess();
          setIsChecking(false);
          isRunningRef.current = false;
          break;
        case 'screen-share':
          await checkScreenShare();
          setIsChecking(false);
          isRunningRef.current = false;
          break;
        case 'face-capture':
          // Face capture is interactive
          await checkFaceCapture();
          // Note: isChecking and isRunningRef are reset in completeFaceCapture
          break;
      }
    },
    [checkSingleDisplay, checkCameraAccess, checkScreenShare, checkFaceCapture]
  );

  /**
   * Reset all checks to pending
   */
  const resetChecks = useCallback(() => {
    // Stop camera stream if exists
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
    }

    // Stop screen sharing if active
    screenShareService.stopSharing();

    // Clear captured face
    setCapturedFaceImage(null);
    setIsAwaitingCapture(false);

    // Cancel any pending face capture
    if (faceCaptureResolveRef.current) {
      faceCaptureResolveRef.current(false);
      faceCaptureResolveRef.current = null;
    }

    // Reset the started flag so config changes can update items again
    hasStartedRef.current = false;

    setItems(getInitialItems(configRef.current));
    setDisplayCheckResult(null);
  }, []);

  // Calculate if all checks passed
  const allPassed = items.every((item) => item.status === 'passed');

  return {
    items,
    allPassed,
    isChecking,
    isAwaitingCapture,
    runAllChecks,
    retryCheck,
    resetChecks,
    completeFaceCapture,
    displayCheckResult,
    cameraStream,
    capturedFaceImage,
  };
}

export default usePreChatChecks;
