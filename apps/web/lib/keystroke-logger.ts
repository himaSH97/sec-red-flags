/**
 * Keystroke Logger Service
 * Captures all keystrokes during a session for typing rhythm analysis
 */

import {
  Keystroke,
  KeystrokeBatchPayload,
  KeyModifiers,
  getTargetType,
  isPasswordField,
  MASKED_KEY,
} from '@sec-flags/shared';

// ============================================================================
// Types
// ============================================================================

type BatchCallback = (batch: KeystrokeBatchPayload) => void;

// ============================================================================
// Constants
// ============================================================================

const FLUSH_INTERVAL_MS = 5000;    // Flush every 5 seconds
const MAX_BUFFER_SIZE = 50;         // Or every 50 keystrokes
const MASKED_KEY_VALUE = MASKED_KEY;

// ============================================================================
// Keystroke Logger Service
// ============================================================================

class KeystrokeLoggerService {
  private isInitialized = false;
  private sessionId: string | null = null;
  private batchIndex = 0;
  private keystrokeBuffer: Keystroke[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private batchCallback: BatchCallback | null = null;
  private boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Initialize the keystroke logger with a session ID
   */
  initialize(sessionId: string, onBatch: BatchCallback): void {
    if (this.isInitialized) {
      console.warn('[KeystrokeLogger] Already initialized');
      return;
    }

    if (typeof window === 'undefined') {
      console.warn('[KeystrokeLogger] Cannot initialize in non-browser environment');
      return;
    }

    console.log('[KeystrokeLogger] Initializing for session:', sessionId);

    this.sessionId = sessionId;
    this.batchCallback = onBatch;
    this.batchIndex = 0;
    this.keystrokeBuffer = [];

    // Create bound handler
    this.boundKeydownHandler = this.handleKeydown.bind(this);

    // Add event listener
    document.addEventListener('keydown', this.boundKeydownHandler);

    // Start flush interval
    this.flushInterval = setInterval(() => {
      this.flushBuffer();
    }, FLUSH_INTERVAL_MS);

    this.isInitialized = true;
    console.log('[KeystrokeLogger] Initialized successfully');
  }

  /**
   * Cleanup the keystroke logger
   */
  cleanup(): void {
    if (!this.isInitialized) {
      return;
    }

    console.log('[KeystrokeLogger] Cleaning up...');

    // Flush any remaining keystrokes
    this.flushBuffer();

    // Remove event listener
    if (this.boundKeydownHandler) {
      document.removeEventListener('keydown', this.boundKeydownHandler);
      this.boundKeydownHandler = null;
    }

    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    this.sessionId = null;
    this.batchCallback = null;
    this.keystrokeBuffer = [];
    this.isInitialized = false;

    console.log('[KeystrokeLogger] Cleanup complete');
  }

  /**
   * Check if the logger is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the current buffer size
   */
  getBufferSize(): number {
    return this.keystrokeBuffer.length;
  }

  /**
   * Get the current batch index
   */
  getBatchIndex(): number {
    return this.batchIndex;
  }

  /**
   * Handle keydown event
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (!this.isInitialized || !this.sessionId) {
      return;
    }

    const modifiers: KeyModifiers = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    };

    const targetType = getTargetType(e.target);
    const isPassword = isPasswordField(e.target);

    // Create keystroke record
    const keystroke: Keystroke = {
      key: isPassword ? MASKED_KEY_VALUE : e.key,
      code: e.code,
      timestamp: Date.now(),
      modifiers,
      targetType,
      isPassword,
    };

    // Add to buffer
    this.keystrokeBuffer.push(keystroke);

    // Check if we should flush
    if (this.keystrokeBuffer.length >= MAX_BUFFER_SIZE) {
      this.flushBuffer();
    }
  }

  /**
   * Flush the keystroke buffer to backend
   */
  private flushBuffer(): void {
    if (this.keystrokeBuffer.length === 0 || !this.sessionId || !this.batchCallback) {
      return;
    }

    const keystrokes = [...this.keystrokeBuffer];
    const startTime = keystrokes[0].timestamp;
    const endTime = keystrokes[keystrokes.length - 1].timestamp;

    const batch: KeystrokeBatchPayload = {
      sessionId: this.sessionId,
      batchIndex: this.batchIndex,
      keystrokes,
      startTime,
      endTime,
    };

    console.log(
      `[KeystrokeLogger] Flushing batch #${this.batchIndex} with ${keystrokes.length} keystrokes`
    );

    // Send to callback
    this.batchCallback(batch);

    // Clear buffer and increment batch index
    this.keystrokeBuffer = [];
    this.batchIndex++;
  }

  /**
   * Force flush the buffer (useful before cleanup or on visibility change)
   */
  forceFlush(): void {
    this.flushBuffer();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const keystrokeLogger = new KeystrokeLoggerService();

