/**
 * Client Events Service
 * Detects and tracks client-side events for security monitoring
 */

import {
  ClientEventType,
  ClientEvent,
  ClientEventData,
  getClientEventSeverity,
  getClientEventMessage,
} from '@sec-flags/shared';

// ============================================================================
// Types
// ============================================================================

type EventCallback = (event: ClientEvent) => void;

interface DevToolsDetectionState {
  isOpen: boolean;
  lastCheck: number;
}

// ============================================================================
// Client Events Service
// ============================================================================

class ClientEventsService {
  private listeners: EventCallback[] = [];
  private isInitialized = false;
  private eventCounter = 0;

  // Track visibility state
  private lastVisibilityState: DocumentVisibilityState = 'visible';
  private tabHiddenAt: number | null = null;

  // Track window state
  private lastWindowWidth: number = 0;
  private lastWindowHeight: number = 0;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private wasFullscreen = false;

  // Track devtools
  private devToolsState: DevToolsDetectionState = {
    isOpen: false,
    lastCheck: 0,
  };
  private devToolsCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Bound handlers for cleanup
  private boundHandlers: {
    copy: (e: ClipboardEvent) => void;
    paste: (e: ClipboardEvent) => void;
    cut: (e: ClipboardEvent) => void;
    visibilityChange: () => void;
    windowBlur: () => void;
    windowFocus: () => void;
    keydown: (e: KeyboardEvent) => void;
    contextMenu: (e: MouseEvent) => void;
    resize: () => void;
    fullscreenChange: () => void;
  } | null = null;

  /**
   * Initialize the service and start listening for events
   */
  initialize(): void {
    if (this.isInitialized || typeof window === 'undefined') {
      return;
    }

    console.log('[ClientEventsService] Initializing...');

    // Store initial window dimensions
    this.lastWindowWidth = window.innerWidth;
    this.lastWindowHeight = window.innerHeight;
    this.wasFullscreen = !!document.fullscreenElement;
    this.lastVisibilityState = document.visibilityState;

    // Create bound handlers
    this.boundHandlers = {
      copy: this.handleCopy.bind(this),
      paste: this.handlePaste.bind(this),
      cut: this.handleCut.bind(this),
      visibilityChange: this.handleVisibilityChange.bind(this),
      windowBlur: this.handleWindowBlur.bind(this),
      windowFocus: this.handleWindowFocus.bind(this),
      keydown: this.handleKeydown.bind(this),
      contextMenu: this.handleContextMenu.bind(this),
      resize: this.handleResize.bind(this),
      fullscreenChange: this.handleFullscreenChange.bind(this),
    };

    // Add event listeners
    document.addEventListener('copy', this.boundHandlers.copy);
    document.addEventListener('paste', this.boundHandlers.paste);
    document.addEventListener('cut', this.boundHandlers.cut);
    document.addEventListener('visibilitychange', this.boundHandlers.visibilityChange);
    window.addEventListener('blur', this.boundHandlers.windowBlur);
    window.addEventListener('focus', this.boundHandlers.windowFocus);
    document.addEventListener('keydown', this.boundHandlers.keydown);
    document.addEventListener('contextmenu', this.boundHandlers.contextMenu);
    window.addEventListener('resize', this.boundHandlers.resize);
    document.addEventListener('fullscreenchange', this.boundHandlers.fullscreenChange);

    // Start devtools detection
    this.startDevToolsDetection();

    this.isInitialized = true;
    console.log('[ClientEventsService] Initialized successfully');
  }

  /**
   * Clean up event listeners
   */
  cleanup(): void {
    if (!this.isInitialized || !this.boundHandlers) {
      return;
    }

    console.log('[ClientEventsService] Cleaning up...');

    document.removeEventListener('copy', this.boundHandlers.copy);
    document.removeEventListener('paste', this.boundHandlers.paste);
    document.removeEventListener('cut', this.boundHandlers.cut);
    document.removeEventListener('visibilitychange', this.boundHandlers.visibilityChange);
    window.removeEventListener('blur', this.boundHandlers.windowBlur);
    window.removeEventListener('focus', this.boundHandlers.windowFocus);
    document.removeEventListener('keydown', this.boundHandlers.keydown);
    document.removeEventListener('contextmenu', this.boundHandlers.contextMenu);
    window.removeEventListener('resize', this.boundHandlers.resize);
    document.removeEventListener('fullscreenchange', this.boundHandlers.fullscreenChange);

    // Stop devtools detection
    if (this.devToolsCheckInterval) {
      clearInterval(this.devToolsCheckInterval);
      this.devToolsCheckInterval = null;
    }

    // Clear resize timeout
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    this.boundHandlers = null;
    this.listeners = [];
    this.isInitialized = false;
    console.log('[ClientEventsService] Cleanup complete');
  }

  /**
   * Subscribe to client events
   */
  subscribe(callback: EventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(type: ClientEventType, data?: ClientEventData, details?: string): void {
    const event: ClientEvent = {
      id: `client-${++this.eventCounter}-${Date.now()}`,
      type,
      timestamp: Date.now(),
      message: getClientEventMessage(type),
      severity: getClientEventSeverity(type),
      details,
      data,
    };

    console.log(`[ClientEventsService] Event: ${event.message}`, details || '');

    this.listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('[ClientEventsService] Error in event callback:', error);
      }
    });
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleCopy(e: ClipboardEvent): void {
    const selection = window.getSelection();
    const text = selection?.toString() || '';
    
    this.emit(
      ClientEventType.CLIPBOARD_COPY,
      {
        clipboardLength: text.length,
        hasText: text.length > 0,
        targetElement: (e.target as HTMLElement)?.tagName,
      },
      text.length > 0 ? `${text.length} characters copied` : undefined
    );
  }

  private handlePaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text') || '';
    
    this.emit(
      ClientEventType.CLIPBOARD_PASTE,
      {
        clipboardLength: text.length,
        hasText: text.length > 0,
        targetElement: (e.target as HTMLElement)?.tagName,
      },
      text.length > 0 ? `${text.length} characters pasted` : undefined
    );
  }

  private handleCut(e: ClipboardEvent): void {
    const selection = window.getSelection();
    const text = selection?.toString() || '';
    
    this.emit(
      ClientEventType.CLIPBOARD_CUT,
      {
        clipboardLength: text.length,
        hasText: text.length > 0,
        targetElement: (e.target as HTMLElement)?.tagName,
      },
      text.length > 0 ? `${text.length} characters cut` : undefined
    );
  }

  private handleVisibilityChange(): void {
    const currentState = document.visibilityState;

    if (currentState === 'hidden' && this.lastVisibilityState === 'visible') {
      this.tabHiddenAt = Date.now();
      this.emit(
        ClientEventType.TAB_HIDDEN,
        { visibilityState: currentState },
        'User switched to another tab'
      );
    } else if (currentState === 'visible' && this.lastVisibilityState === 'hidden') {
      const hiddenDuration = this.tabHiddenAt ? Date.now() - this.tabHiddenAt : 0;
      this.emit(
        ClientEventType.TAB_VISIBLE,
        {
          visibilityState: currentState,
          hiddenDuration,
        },
        hiddenDuration > 0 ? `Tab hidden for ${Math.round(hiddenDuration / 1000)}s` : 'Tab became visible'
      );
      this.tabHiddenAt = null;
    }

    this.lastVisibilityState = currentState;
  }

  private handleWindowBlur(): void {
    // Only emit if tab is still visible (blur without tab switch means window switch)
    if (document.visibilityState === 'visible') {
      this.emit(
        ClientEventType.WINDOW_BLUR,
        {},
        'Window lost focus (switched to another application)'
      );
    }
  }

  private handleWindowFocus(): void {
    this.emit(
      ClientEventType.WINDOW_FOCUS,
      {},
      'Window regained focus'
    );
  }

  private handleKeydown(e: KeyboardEvent): void {
    const modifiers = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    };

    // Detect F12 (DevTools)
    if (e.key === 'F12') {
      this.emit(
        ClientEventType.DEVTOOLS_OPENED,
        { key: e.key, modifiers },
        'F12 key pressed (DevTools shortcut)'
      );
    }

    // Detect Ctrl+Shift+I (DevTools)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
      this.emit(
        ClientEventType.DEVTOOLS_OPENED,
        { key: e.key, modifiers },
        'Ctrl+Shift+I pressed (DevTools shortcut)'
      );
    }

    // Detect Ctrl+Shift+J (DevTools Console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
      this.emit(
        ClientEventType.DEVTOOLS_OPENED,
        { key: e.key, modifiers },
        'Ctrl+Shift+J pressed (DevTools Console shortcut)'
      );
    }

    // Detect Print Screen
    if (e.key === 'PrintScreen') {
      this.emit(
        ClientEventType.PRINT_SCREEN,
        { key: e.key, modifiers },
        'Print Screen key pressed'
      );
    }

    // Detect Cmd+Shift+3/4 on Mac (screenshot)
    if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) {
      this.emit(
        ClientEventType.PRINT_SCREEN,
        { key: e.key, modifiers },
        `Cmd+Shift+${e.key} pressed (Mac screenshot)`
      );
    }
  }

  private handleContextMenu(e: MouseEvent): void {
    this.emit(
      ClientEventType.CONTEXT_MENU,
      {
        targetElement: (e.target as HTMLElement)?.tagName,
      },
      'Right-click context menu opened'
    );
  }

  private handleResize(): void {
    // Debounce resize events
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      // Only emit if significant change (> 100px in either dimension)
      const widthChange = Math.abs(newWidth - this.lastWindowWidth);
      const heightChange = Math.abs(newHeight - this.lastWindowHeight);

      if (widthChange > 100 || heightChange > 100) {
        this.emit(
          ClientEventType.WINDOW_RESIZE,
          {
            windowWidth: newWidth,
            windowHeight: newHeight,
            previousWidth: this.lastWindowWidth,
            previousHeight: this.lastWindowHeight,
          },
          `Window resized from ${this.lastWindowWidth}x${this.lastWindowHeight} to ${newWidth}x${newHeight}`
        );

        this.lastWindowWidth = newWidth;
        this.lastWindowHeight = newHeight;
      }
    }, 500); // 500ms debounce
  }

  private handleFullscreenChange(): void {
    const isFullscreen = !!document.fullscreenElement;

    if (this.wasFullscreen && !isFullscreen) {
      this.emit(
        ClientEventType.FULLSCREEN_EXIT,
        { isFullscreen },
        'Exited fullscreen mode'
      );
    }

    this.wasFullscreen = isFullscreen;
  }

  // ============================================================================
  // DevTools Detection
  // ============================================================================

  private startDevToolsDetection(): void {
    // Check for devtools using console timing
    // This is a heuristic method and not 100% reliable
    this.devToolsCheckInterval = setInterval(() => {
      this.checkDevTools();
    }, 1000);
  }

  private checkDevTools(): void {
    const threshold = 160; // DevTools typically causes a >160ms delay
    const start = performance.now();

    // Using debugger statement detection
    // eslint-disable-next-line no-debugger
    const imageEl = new Image();
    Object.defineProperty(imageEl, 'id', {
      get: () => {
        const elapsed = performance.now() - start;
        if (elapsed > threshold && !this.devToolsState.isOpen) {
          this.devToolsState.isOpen = true;
          this.emit(
            ClientEventType.DEVTOOLS_OPENED,
            {},
            'DevTools detected via timing analysis'
          );
        }
      },
    });

    // Force getter evaluation
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    imageEl.id;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const clientEventsService = new ClientEventsService();

