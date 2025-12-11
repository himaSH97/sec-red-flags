/**
 * TypeScript declarations for the Window Management API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API
 */

/**
 * Extended screen information provided by the Window Management API
 */
interface ScreenDetailed extends Screen {
  /** Whether this is the primary display */
  readonly isPrimary: boolean;
  /** Whether this is an internal display (e.g., laptop screen) */
  readonly isInternal: boolean;
  /** Device pixel ratio for this screen */
  readonly devicePixelRatio: number;
  /** Human-readable label for the screen */
  readonly label: string;
  /** Left position of the screen in the virtual screen space */
  readonly left: number;
  /** Top position of the screen in the virtual screen space */
  readonly top: number;
  /** Available left position (excluding OS UI elements) */
  readonly availLeft: number;
  /** Available top position (excluding OS UI elements) */
  readonly availTop: number;
}

/**
 * Contains information about all screens available to the device
 */
interface ScreenDetails extends EventTarget {
  /** Array of all connected screens */
  readonly screens: ReadonlyArray<ScreenDetailed>;
  /** The screen where the current browser window is displayed */
  readonly currentScreen: ScreenDetailed;
  /** Event fired when screens are added, removed, or changed */
  onscreenschange: ((this: ScreenDetails, ev: Event) => void) | null;
}

/**
 * Extends the Window interface with the Window Management API
 */
interface Window {
  /**
   * Returns a Promise that resolves with a ScreenDetails object
   * containing information about all screens available to the device.
   * Requires user permission.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/getScreenDetails
   */
  getScreenDetails(): Promise<ScreenDetails>;
}
