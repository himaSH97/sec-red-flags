/**
 * Screen Share Service
 * Singleton service to manage screen sharing stream across page navigation
 */

class ScreenShareService {
  private stream: MediaStream | null = null;
  private onEndCallbacks: Array<() => void> = [];

  /**
   * Start screen sharing
   * Prompts user to select a screen to share (entire screen only, not windows or tabs)
   */
  async startSharing(): Promise<MediaStream> {
    // Stop any existing stream first
    this.stopSharing();

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });

      // Validate that the user shared an entire screen, not a window or tab
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        const displaySurface = settings.displaySurface;

        console.log(
          '[ScreenShareService] Display surface type:',
          displaySurface
        );

        // Check if user shared something other than the full screen
        if (displaySurface && displaySurface !== 'monitor') {
          // Stop the invalid stream
          this.stream.getTracks().forEach((track) => track.stop());
          this.stream = null;

          const surfaceType =
            displaySurface === 'window'
              ? 'a window'
              : displaySurface === 'browser'
              ? 'a browser tab'
              : displaySurface;

          throw new Error(
            `INVALID_SURFACE:You selected ${surfaceType}. Please share your entire screen instead.`
          );
        }
      }

      // Listen for when user stops sharing via browser UI
      this.stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          console.log('[ScreenShareService] Screen share ended by user');
          this.stream = null;
          this.notifyEnd();
        };
      });

      console.log('[ScreenShareService] Screen sharing started (full screen)');
      return this.stream;
    } catch (error) {
      console.error(
        '[ScreenShareService] Failed to start screen sharing:',
        error
      );
      throw error;
    }
  }

  /**
   * Get the current screen share stream
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Stop screen sharing and release resources
   */
  stopSharing(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
      console.log('[ScreenShareService] Screen sharing stopped');
    }
  }

  /**
   * Check if screen sharing is currently active
   */
  isActive(): boolean {
    return this.stream?.active ?? false;
  }

  /**
   * Register a callback to be called when screen sharing ends
   */
  onEnd(callback: () => void): () => void {
    this.onEndCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      this.onEndCallbacks = this.onEndCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify all listeners that screen sharing has ended
   */
  private notifyEnd(): void {
    this.onEndCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[ScreenShareService] Error in onEnd callback:', error);
      }
    });
  }
}

// Export singleton instance
export const screenShareService = new ScreenShareService();

export default screenShareService;
