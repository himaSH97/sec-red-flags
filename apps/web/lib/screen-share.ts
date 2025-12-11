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

    let tempStream: MediaStream | null = null;

    try {
      tempStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });

      // Validate that the user shared an entire screen, not a window or tab
      const videoTrack = tempStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        const displaySurface = settings.displaySurface;

        console.log(
          '[ScreenShareService] Display surface type:',
          displaySurface
        );

        // Reject if user shared something other than the full screen
        // Also reject if displaySurface is undefined (can't verify it's a monitor)
        if (displaySurface !== 'monitor') {
          // Immediately stop the invalid stream
          tempStream.getTracks().forEach((track) => {
            track.stop();
            console.log(
              '[ScreenShareService] Stopped invalid track:',
              track.kind
            );
          });
          tempStream = null;

          let surfaceType = 'an unknown source';
          if (displaySurface === 'window') {
            surfaceType = 'a window';
          } else if (displaySurface === 'browser') {
            surfaceType = 'a browser tab';
          } else if (displaySurface) {
            surfaceType = displaySurface;
          }

          throw new Error(
            `INVALID_SURFACE:You selected ${surfaceType}. Please share your entire screen instead.`
          );
        }
      }

      // Validation passed - store the stream
      this.stream = tempStream;

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
      // Ensure stream is stopped if any error occurs
      if (tempStream) {
        tempStream.getTracks().forEach((track) => {
          track.stop();
          console.log('[ScreenShareService] Cleanup: stopped track on error');
        });
      }
      this.stream = null;

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
