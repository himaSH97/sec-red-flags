/**
 * Display Check Utility
 * Detects multiple displays using the Window Management API
 */

/// <reference path="./screen-details.d.ts" />

export interface ScreenInfo {
  width: number;
  height: number;
  isPrimary: boolean;
  label?: string;
}

export interface DisplayCheckResult {
  /** Whether multiple displays were detected */
  hasMultipleDisplays: boolean;
  /** Number of screens detected */
  screenCount: number;
  /** Information about each screen */
  screens: ScreenInfo[];
  /** Whether the user denied permission */
  permissionDenied: boolean;
  /** Whether permission is permanently denied (won't prompt again) */
  permissionPermanentlyDenied: boolean;
  /** Whether the API is supported in this browser */
  apiSupported: boolean;
  /** Error message if check failed */
  errorMessage?: string;
}

/**
 * Check the current window-management permission state
 */
async function checkPermissionState(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    // Try to query the permission state
    // Note: 'window-management' is the standard name, but some browsers use 'window-placement'
    const result = await navigator.permissions.query({
      name: 'window-management' as PermissionName,
    });
    return result.state;
  } catch {
    // Permission API doesn't support this permission name, try alternate
    try {
      const result = await navigator.permissions.query({
        name: 'window-placement' as PermissionName,
      });
      return result.state;
    } catch {
      // Can't check permission state, assume it will prompt
      return 'prompt';
    }
  }
}

/**
 * Check for multiple displays using the Window Management API
 *
 * @returns Promise<DisplayCheckResult> - Result of the display check
 *
 * @example
 * const result = await checkMultipleDisplays();
 * if (result.hasMultipleDisplays) {
 *   console.log(`Found ${result.screenCount} displays`);
 * }
 */
export async function checkMultipleDisplays(): Promise<DisplayCheckResult> {
  // Check if the API is supported
  if (typeof window === 'undefined' || !('getScreenDetails' in window)) {
    return {
      hasMultipleDisplays: false,
      screenCount: 1,
      screens: [
        {
          width: typeof window !== 'undefined' ? window.screen.width : 0,
          height: typeof window !== 'undefined' ? window.screen.height : 0,
          isPrimary: true,
        },
      ],
      permissionDenied: false,
      permissionPermanentlyDenied: false,
      apiSupported: false,
      errorMessage:
        'Window Management API is not supported in this browser. Using fallback.',
    };
  }

  // Check current permission state before requesting
  const permissionState = await checkPermissionState();

  // If permission was previously denied, it won't prompt again
  if (permissionState === 'denied') {
    return {
      hasMultipleDisplays: false,
      screenCount: 1,
      screens: [
        {
          width: window.screen.width,
          height: window.screen.height,
          isPrimary: true,
        },
      ],
      permissionDenied: true,
      permissionPermanentlyDenied: true,
      apiSupported: true,
      errorMessage:
        'Screen access permission was previously denied. Please click the lock icon in the address bar, find "Window management" or "Window placement", and change it to "Allow", then retry.',
    };
  }

  try {
    // Request screen details (will prompt for permission if state is 'prompt')
    const screenDetails = await window.getScreenDetails();

    const screens: ScreenInfo[] = screenDetails.screens.map((screen) => ({
      width: screen.width,
      height: screen.height,
      isPrimary: screen.isPrimary,
      label: screen.label || undefined,
    }));

    const screenCount = screens.length;

    return {
      hasMultipleDisplays: screenCount > 1,
      screenCount,
      screens,
      permissionDenied: false,
      permissionPermanentlyDenied: false,
      apiSupported: true,
    };
  } catch (error) {
    // Permission denied or other error
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a permission error
    const isPermissionError =
      errorMessage.includes('Permission') ||
      errorMessage.includes('denied') ||
      errorMessage.includes('NotAllowedError') ||
      (error instanceof DOMException && error.name === 'NotAllowedError');

    return {
      hasMultipleDisplays: false,
      screenCount: 1,
      screens: [
        {
          width: window.screen.width,
          height: window.screen.height,
          isPrimary: true,
        },
      ],
      permissionDenied: isPermissionError,
      permissionPermanentlyDenied: false,
      apiSupported: true,
      errorMessage: isPermissionError
        ? 'Screen access permission was denied. Please allow access when prompted.'
        : errorMessage,
    };
  }
}

/**
 * Check if the Window Management API is supported
 */
export function isDisplayCheckSupported(): boolean {
  return typeof window !== 'undefined' && 'getScreenDetails' in window;
}
