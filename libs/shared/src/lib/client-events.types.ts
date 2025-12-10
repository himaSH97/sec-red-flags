/**
 * Client Events Types
 * Shared types for client-side event tracking between frontend and backend
 */

// ============================================================================
// Client Event Types
// ============================================================================

/**
 * Types of client-side events to track for security monitoring
 */
export enum ClientEventType {
  // Clipboard Events
  CLIPBOARD_COPY = 'CLIPBOARD_COPY',
  CLIPBOARD_PASTE = 'CLIPBOARD_PASTE',
  CLIPBOARD_CUT = 'CLIPBOARD_CUT',

  // Visibility Events
  TAB_HIDDEN = 'TAB_HIDDEN',
  TAB_VISIBLE = 'TAB_VISIBLE',
  WINDOW_BLUR = 'WINDOW_BLUR',
  WINDOW_FOCUS = 'WINDOW_FOCUS',

  // Keyboard Events
  DEVTOOLS_OPENED = 'DEVTOOLS_OPENED',
  PRINT_SCREEN = 'PRINT_SCREEN',

  // Context Events
  CONTEXT_MENU = 'CONTEXT_MENU',

  // Window Events
  FULLSCREEN_EXIT = 'FULLSCREEN_EXIT',
  WINDOW_RESIZE = 'WINDOW_RESIZE',
}

/**
 * Severity level for client events
 */
export type ClientEventSeverity = 'info' | 'warning' | 'critical';

/**
 * Data associated with a client event
 */
export interface ClientEventData {
  // For clipboard events
  clipboardLength?: number;
  hasText?: boolean;

  // For visibility events
  visibilityState?: DocumentVisibilityState;
  hiddenDuration?: number; // ms

  // For window events
  windowWidth?: number;
  windowHeight?: number;
  previousWidth?: number;
  previousHeight?: number;
  isFullscreen?: boolean;

  // For keyboard events
  key?: string;
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };

  // Additional context
  targetElement?: string;
  url?: string;
}

/**
 * Client event payload sent to backend
 */
export interface ClientEventPayload {
  type: ClientEventType;
  timestamp: number;
  message: string;
  severity: ClientEventSeverity;
  details?: string;
  data?: ClientEventData;
  sessionId?: string;
}

/**
 * Client event for frontend display
 */
export interface ClientEvent {
  id: string;
  type: ClientEventType;
  timestamp: number;
  message: string;
  severity: ClientEventSeverity;
  details?: string;
  data?: ClientEventData;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the severity level for a client event type
 */
export function getClientEventSeverity(type: ClientEventType): ClientEventSeverity {
  switch (type) {
    // Critical events - high security concern
    case ClientEventType.DEVTOOLS_OPENED:
    case ClientEventType.PRINT_SCREEN:
      return 'critical';

    // Warning events - moderate security concern
    case ClientEventType.CLIPBOARD_COPY:
    case ClientEventType.CLIPBOARD_PASTE:
    case ClientEventType.CLIPBOARD_CUT:
    case ClientEventType.TAB_HIDDEN:
    case ClientEventType.WINDOW_BLUR:
    case ClientEventType.FULLSCREEN_EXIT:
    case ClientEventType.WINDOW_RESIZE:
      return 'warning';

    // Info events - low security concern
    case ClientEventType.TAB_VISIBLE:
    case ClientEventType.WINDOW_FOCUS:
    case ClientEventType.CONTEXT_MENU:
    default:
      return 'info';
  }
}

/**
 * Get a human-readable message for a client event type
 */
export function getClientEventMessage(type: ClientEventType): string {
  switch (type) {
    case ClientEventType.CLIPBOARD_COPY:
      return 'Content copied';
    case ClientEventType.CLIPBOARD_PASTE:
      return 'Content pasted';
    case ClientEventType.CLIPBOARD_CUT:
      return 'Content cut';
    case ClientEventType.TAB_HIDDEN:
      return 'Tab switched away';
    case ClientEventType.TAB_VISIBLE:
      return 'Tab returned';
    case ClientEventType.WINDOW_BLUR:
      return 'Window lost focus';
    case ClientEventType.WINDOW_FOCUS:
      return 'Window regained focus';
    case ClientEventType.DEVTOOLS_OPENED:
      return 'Developer tools opened';
    case ClientEventType.PRINT_SCREEN:
      return 'Print screen pressed';
    case ClientEventType.CONTEXT_MENU:
      return 'Right-click menu opened';
    case ClientEventType.FULLSCREEN_EXIT:
      return 'Exited fullscreen';
    case ClientEventType.WINDOW_RESIZE:
      return 'Window resized';
    default:
      return 'Unknown event';
  }
}

