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
  // Face Position
  | 'face_away'              // Face turned away from screen
  | 'face_returned'          // Face returned to screen
  | 'face_not_detected'      // Face not visible in frame
  | 'face_detected'          // Face became visible
  
  // Gaze/Eye Direction
  | 'looking_away'           // Eyes/gaze not on screen
  | 'looking_back'           // Eyes returned to screen
  
  // Eye State
  | 'eyes_closed_extended'   // Eyes closed for extended period
  | 'eyes_opened'            // Eyes opened after extended closure
  | 'excessive_blinking'     // High blink rate detected
  | 'squinting_detected'     // User squinting
  
  // Speaking
  | 'talking'                // Mouth open, possibly talking
  | 'stopped_talking'        // Stopped talking
  
  // Head Movement
  | 'head_movement_excessive' // Rapid/frequent head turns
  | 'head_tilted'            // Head tilted significantly
  | 'head_position_normal'   // Head returned to normal position
  
  // Expression
  | 'expression_confused'    // Confused expression detected
  | 'lip_reading_detected'   // Lip movement without jaw opening
  
  // Browser/Session
  | 'tab_switched_away'      // Browser tab changed
  | 'tab_returned'           // Returned to tab
  | 'window_blur'            // Window lost focus
  | 'window_focus'           // Window regained focus
  | 'multiple_faces_detected' // More than one face in frame
  
  // Face Verification
  | 'verification_started'   // Face verification check started
  | 'verification_success'   // Face verification passed
  | 'verification_failed'    // Face verification failed
  | 'verification_error';    // Face verification error

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
  leftSquint?: number;       // 0-100% squint level
  rightSquint?: number;      // 0-100% squint level
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
  browDown?: number;  // 0-100% - for confusion detection
  lipMovement?: number; // 0-100% - for lip reading detection
}

/**
 * Complete face tracking data from a single frame
 */
export interface FaceTrackingData {
  timestamp: number;
  faceDetected: boolean;
  faceCount?: number;        // Number of faces detected
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
 * Extended data for face tracking events
 */
export interface FaceTrackingEventData {
  headPose?: HeadPose;
  gazeDirection?: GazeDirection;
  mouthOpenness?: number;
  faceDetected?: boolean;
  faceCount?: number;
  eyeOpenness?: { left: number; right: number };
  squintLevel?: { left: number; right: number };
  blinkRate?: number;           // blinks per minute
  eyeClosureDuration?: number;  // seconds
  headMovementCount?: number;   // movements in time window
  browDown?: number;
  lipMovement?: number;
}

/**
 * Payload for face tracking events sent via WebSocket
 */
export interface FaceTrackingEventPayload {
  type: FaceTrackingEventType;
  timestamp: number;
  message: string;
  details?: string;
  data?: FaceTrackingEventData;
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

// ============================================================================
// Detection Thresholds (configurable defaults)
// ============================================================================

export interface TrackingThresholds {
  eyesClosedExtendedSeconds: number;     // default: 3
  excessiveBlinkingPerMinute: number;    // default: 20
  squintThreshold: number;               // default: 0.5 (50%)
  headTiltRollDegrees: number;           // default: 25
  headMovementCountThreshold: number;    // default: 5 movements in 10 seconds
  confusedBrowInnerUp: number;           // default: 0.4 (40%)
  confusedBrowDown: number;              // default: 0.3 (30%)
  lipReadingLipMovement: number;         // default: 0.2 (20%)
  lipReadingJawOpenMax: number;          // default: 0.15 (15%)
  headTurnAwayYawDegrees: number;        // default: 40
  headTurnAwayPitchDegrees: number;      // default: 35
  mouthOpenTalkingThreshold: number;     // default: 30%
}

export const DEFAULT_TRACKING_THRESHOLDS: TrackingThresholds = {
  eyesClosedExtendedSeconds: 3,
  excessiveBlinkingPerMinute: 20,
  squintThreshold: 50,
  headTiltRollDegrees: 25,
  headMovementCountThreshold: 5,
  confusedBrowInnerUp: 40,
  confusedBrowDown: 30,
  lipReadingLipMovement: 20,
  lipReadingJawOpenMax: 15,
  headTurnAwayYawDegrees: 40,
  headTurnAwayPitchDegrees: 35,
  mouthOpenTalkingThreshold: 30,
};
