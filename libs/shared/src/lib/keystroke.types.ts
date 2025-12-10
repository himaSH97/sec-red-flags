/**
 * Keystroke Types
 * Shared types for keystroke recording between frontend and backend
 */

/**
 * Modifier keys state
 */
export interface KeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * Individual keystroke data
 */
export interface Keystroke {
  key: string;              // The key pressed (e.g., "a", "Enter", "Backspace")
  code: string;             // Physical key code (e.g., "KeyA", "Enter")
  timestamp: number;        // Unix timestamp in ms
  modifiers: KeyModifiers;
  targetType: string;       // Input type: "text", "textarea", "password", "other"
  isPassword: boolean;      // True if typed in password field (key will be masked)
}

/**
 * Payload for sending keystroke batch to backend
 */
export interface KeystrokeBatchPayload {
  sessionId: string;
  batchIndex: number;
  keystrokes: Keystroke[];
  startTime: number;        // Unix timestamp in ms
  endTime: number;          // Unix timestamp in ms
}

/**
 * Response after batch is saved
 */
export interface KeystrokeBatchResponse {
  success: boolean;
  batchIndex: number;
  keystrokeCount: number;
}

/**
 * Keystroke statistics for a session
 */
export interface KeystrokeStats {
  totalKeystrokes: number;
  totalBatches: number;
  startTime: number | null;
  endTime: number | null;
  durationMs: number;
  averageKeystrokesPerMinute: number;
}

/**
 * Keys that should be masked for privacy
 */
export const MASKED_KEY = '[key]';

/**
 * Check if a key is a printable character
 */
export function isPrintableKey(key: string): boolean {
  return key.length === 1;
}

/**
 * Get the target type from an element
 */
export function getTargetType(element: EventTarget | null): string {
  if (!element || !(element instanceof HTMLElement)) {
    return 'other';
  }

  if (element instanceof HTMLInputElement) {
    return element.type || 'text';
  }

  if (element instanceof HTMLTextAreaElement) {
    return 'textarea';
  }

  if (element.isContentEditable) {
    return 'contenteditable';
  }

  return 'other';
}

/**
 * Check if the element is a password field
 */
export function isPasswordField(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLInputElement)) {
    return false;
  }
  return element.type === 'password';
}

