/**
 * Face Tracking Types
 * Shared types for face tracking between frontend and backend
 */

// ============================================================================
// Tracking Event Types
// ============================================================================

/**
 * Types of security-relevant face tracking events
 */
export type FaceTrackingEventType =
  | 'face_away'       // Face turned away from screen
  | 'face_returned'   // Face returned to screen
  | 'looking_away'    // Eyes/gaze not on screen
  | 'looking_back'    // Eyes returned to screen
  | 'talking'         // Mouth open, possibly talking to someone
  | 'stopped_talking'; // Mouth closed

/**
 * Gaze direction categories
 */
export type GazeDirection =
  | 'CENTER'
  | 'LEFT'
  | 'RIGHT'
  | 'UP'
  | 'DOWN'
  | 'UP_LEFT'
  | 'UP_RIGHT'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT';

/**
 * Dominant facial expression
 */
export type Expression =
  | 'NEUTRAL'
  | 'HAPPY'
  | 'SAD'
  | 'SURPRISED'
  | 'ANGRY'
  | 'CONFUSED';

/**
 * User attention level
 */
export type AttentionLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'AWAY';

// ============================================================================
// Tracking Data Interfaces
// ============================================================================

/**
 * Head pose in degrees
 */
export interface HeadPose {
  pitch: number;  // Nodding up/down
  yaw: number;    // Turning left/right
  roll: number;   // Tilting head
}

/**
 * Eye metrics
 */
export interface EyeMetrics {
  leftEyeOpenness: number;   // 0-100%
  rightEyeOpenness: number;  // 0-100%
  isBlinking: boolean;
  gazeDirection: GazeDirection;
}

/**
 * Expression metrics
 */
export interface ExpressionMetrics {
  dominantExpression: Expression;
  smile: number;      // 0-100%
  frown: number;      // 0-100%
  surprise: number;   // 0-100%
  browRaise: number;  // 0-100%
  mouthOpen: number;  // 0-100%
}

/**
 * Complete face tracking data from a single frame
 */
export interface FaceTrackingData {
  timestamp: number;
  faceDetected: boolean;
  eyes: EyeMetrics;
  expression: ExpressionMetrics;
  headPose: HeadPose;
  attentionLevel: AttentionLevel;
  rawBlendshapes?: Record<string, number>;
}

// ============================================================================
// Socket Event Payloads
// ============================================================================

/**
 * Payload for face tracking events sent via WebSocket
 */
export interface FaceTrackingEventPayload {
  type: FaceTrackingEventType;
  timestamp: number;
  message: string;
  details?: string;
  data?: {
    headPose?: HeadPose;
    gazeDirection?: GazeDirection;
    mouthOpenness?: number;
    faceDetected?: boolean;
  };
}

/**
 * Severity level for tracking events
 */
export type TrackingEventSeverity = 'info' | 'warning' | 'success';

/**
 * Tracking event for UI display
 */
export interface TrackingEvent {
  id: string;
  type: FaceTrackingEventType;
  timestamp: Date;
  message: string;
  details?: string;
  severity: TrackingEventSeverity;
}

