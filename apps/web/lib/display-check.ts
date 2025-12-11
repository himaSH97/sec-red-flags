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
  /** Whether the API is supported in this browser */
  apiSupported: boolean;
  /** Error message if check failed */
  errorMessage?: string;
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
      apiSupported: false,
      errorMessage:
        'Window Management API is not supported in this browser. Using fallback.',
    };
  }

  try {
    // Request screen details (will prompt for permission)
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
      apiSupported: true,
      errorMessage: isPermissionError
        ? 'Screen access permission was denied'
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
