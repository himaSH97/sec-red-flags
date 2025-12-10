import {
  FaceLandmarker,
  FilesetResolver,
  FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import {
  GazeDirection,
  Expression,
  AttentionLevel,
  EyeMetrics,
  ExpressionMetrics,
  HeadPose,
  FaceTrackingData,
  DEFAULT_TRACKING_THRESHOLDS,
  TrackingThresholds,
} from '@sec-flags/shared';

// Re-export types for convenience
export type {
  GazeDirection,
  Expression,
  AttentionLevel,
  EyeMetrics,
  ExpressionMetrics,
  FaceTrackingData,
};

// Alias HeadPose to HeadPoseMetrics for internal use (same structure)
type HeadPoseMetrics = HeadPose;

// ============================================================================
// Blendshape name constants
// ============================================================================

const BLENDSHAPES = {
  // Eye blink
  eyeBlinkLeft: 'eyeBlinkLeft',
  eyeBlinkRight: 'eyeBlinkRight',

  // Eye look direction
  eyeLookDownLeft: 'eyeLookDownLeft',
  eyeLookDownRight: 'eyeLookDownRight',
  eyeLookInLeft: 'eyeLookInLeft',
  eyeLookInRight: 'eyeLookInRight',
  eyeLookOutLeft: 'eyeLookOutLeft',
  eyeLookOutRight: 'eyeLookOutRight',
  eyeLookUpLeft: 'eyeLookUpLeft',
  eyeLookUpRight: 'eyeLookUpRight',

  // Mouth expressions
  mouthSmileLeft: 'mouthSmileLeft',
  mouthSmileRight: 'mouthSmileRight',
  mouthFrownLeft: 'mouthFrownLeft',
  mouthFrownRight: 'mouthFrownRight',
  jawOpen: 'jawOpen',

  // Brow movements
  browDownLeft: 'browDownLeft',
  browDownRight: 'browDownRight',
  browInnerUp: 'browInnerUp',
  browOuterUpLeft: 'browOuterUpLeft',
  browOuterUpRight: 'browOuterUpRight',

  // Eye squint
  eyeSquintLeft: 'eyeSquintLeft',
  eyeSquintRight: 'eyeSquintRight',

  // Lip movements (for lip reading detection)
  mouthPucker: 'mouthPucker',
  mouthLeft: 'mouthLeft',
  mouthRight: 'mouthRight',
  mouthRollLower: 'mouthRollLower',
  mouthRollUpper: 'mouthRollUpper',
  mouthShrugLower: 'mouthShrugLower',
  mouthShrugUpper: 'mouthShrugUpper',
  mouthClose: 'mouthClose',
  mouthFunnel: 'mouthFunnel',
  mouthDimpleLeft: 'mouthDimpleLeft',
  mouthDimpleRight: 'mouthDimpleRight',
  mouthStretchLeft: 'mouthStretchLeft',
  mouthStretchRight: 'mouthStretchRight',
  mouthPressLeft: 'mouthPressLeft',
  mouthPressRight: 'mouthPressRight',
  mouthLowerDownLeft: 'mouthLowerDownLeft',
  mouthLowerDownRight: 'mouthLowerDownRight',
  mouthUpperUpLeft: 'mouthUpperUpLeft',
  mouthUpperUpRight: 'mouthUpperUpRight',

  // Other useful ones
  cheekPuff: 'cheekPuff',
} as const;

// ============================================================================
// Extended Tracking Metrics Interface
// ============================================================================

export interface ExtendedTrackingMetrics {
  // Eye state
  isSquinting: boolean;
  squintLevel: { left: number; right: number };
  areEyesClosed: boolean;
  eyeClosureDuration: number; // seconds

  // Blink tracking
  blinkCount: number;
  blinkRate: number; // blinks per minute

  // Head movement
  isHeadTilted: boolean;
  headMovementCount: number; // movements in time window
  isExcessiveHeadMovement: boolean;

  // Expression
  isConfused: boolean;
  browDown: number;
  isLipReading: boolean;
  lipMovement: number;

  // Face count
  faceCount: number;
}

// ============================================================================
// Face Tracking Service
// ============================================================================

export class FaceTrackingService {
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private lastProcessTime = 0;
  private minProcessInterval = 100; // Minimum ms between processing

  // Configurable thresholds
  private thresholds: TrackingThresholds = DEFAULT_TRACKING_THRESHOLDS;

  // Blink tracking
  private blinkHistory: number[] = []; // Timestamps of blinks
  private wasBlinking = false;

  // Eye closure tracking
  private eyeClosureStartTime: number | null = null;
  private eyeClosureDuration = 0;

  // Head movement tracking
  private headPoseHistory: Array<{
    yaw: number;
    pitch: number;
    timestamp: number;
  }> = [];
  private readonly HEAD_MOVEMENT_WINDOW_MS = 10000; // 10 seconds
  private readonly HEAD_MOVEMENT_THRESHOLD_DEGREES = 15; // Degrees to count as movement

  /**
   * Initialize the MediaPipe FaceLandmarker
   * Must be called before processing any frames
   */
  async initialize(maxFaces = 2): Promise<void> {
    if (this.isInitialized || this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    try {
      console.log('[FaceTracking] Initializing MediaPipe FaceLandmarker...');

      // Load the MediaPipe vision WASM files
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      // Create the face landmarker instance
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU', // Use GPU for better performance
        },
        runningMode: 'VIDEO',
        numFaces: maxFaces, // Support multiple face detection
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });

      this.isInitialized = true;
      console.log(
        '[FaceTracking] MediaPipe FaceLandmarker initialized successfully'
      );
    } catch (error) {
      console.error('[FaceTracking] Failed to initialize:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Set custom thresholds
   */
  setThresholds(thresholds: Partial<TrackingThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): TrackingThresholds {
    return { ...this.thresholds };
  }

  /**
   * Check if the service is ready to process frames
   */
  isReady(): boolean {
    return this.isInitialized && this.faceLandmarker !== null;
  }

  /**
   * Process a video frame and extract face tracking data
   */
  processFrame(videoElement: HTMLVideoElement): FaceTrackingData | null {
    if (!this.isReady() || !this.faceLandmarker) {
      console.warn('[FaceTracking] Service not initialized');
      return null;
    }

    // Check if video is ready
    if (videoElement.readyState < 2) {
      return null;
    }

    // Throttle processing
    const now = performance.now();
    if (now - this.lastProcessTime < this.minProcessInterval) {
      return null;
    }
    this.lastProcessTime = now;

    try {
      // Process the video frame
      const result = this.faceLandmarker.detectForVideo(videoElement, now);
      return this.parseResult(result);
    } catch (error) {
      console.error('[FaceTracking] Error processing frame:', error);
      return null;
    }
  }

  /**
   * Get extended tracking metrics
   */
  getExtendedMetrics(data: FaceTrackingData): ExtendedTrackingMetrics {
    const blendshapes = data.rawBlendshapes || {};

    // Calculate squint levels
    const leftSquint = Math.round(
      (blendshapes[BLENDSHAPES.eyeSquintLeft] || 0) * 100
    );
    const rightSquint = Math.round(
      (blendshapes[BLENDSHAPES.eyeSquintRight] || 0) * 100
    );
    const isSquinting =
      leftSquint > this.thresholds.squintThreshold ||
      rightSquint > this.thresholds.squintThreshold;

    // Calculate brow down for confusion
    const browDown = Math.round(
      (((blendshapes[BLENDSHAPES.browDownLeft] || 0) +
        (blendshapes[BLENDSHAPES.browDownRight] || 0)) /
        2) *
        100
    );
    const browInnerUp = Math.round(
      (blendshapes[BLENDSHAPES.browInnerUp] || 0) * 100
    );
    const isConfused =
      browInnerUp > this.thresholds.confusedBrowInnerUp &&
      browDown > this.thresholds.confusedBrowDown;

    // Calculate lip movement for lip reading detection
    const lipMovement = this.calculateLipMovement(blendshapes);
    const jawOpen = (blendshapes[BLENDSHAPES.jawOpen] || 0) * 100;
    const isLipReading =
      lipMovement > this.thresholds.lipReadingLipMovement &&
      jawOpen < this.thresholds.lipReadingJawOpenMax;

    // Eye closure detection
    const areEyesClosed =
      data.eyes.leftEyeOpenness < 20 && data.eyes.rightEyeOpenness < 20;

    // Check if head is tilted
    const isHeadTilted =
      Math.abs(data.headPose.roll) > this.thresholds.headTiltRollDegrees;

    // Get head movement count
    const headMovementCount = this.getHeadMovementCount();
    const isExcessiveHeadMovement =
      headMovementCount > this.thresholds.headMovementCountThreshold;

    return {
      isSquinting,
      squintLevel: { left: leftSquint, right: rightSquint },
      areEyesClosed,
      eyeClosureDuration: this.eyeClosureDuration,
      blinkCount: this.blinkHistory.length,
      blinkRate: this.getBlinkRate(),
      isHeadTilted,
      headMovementCount,
      isExcessiveHeadMovement,
      isConfused,
      browDown,
      isLipReading,
      lipMovement,
      faceCount: 1, // Will be updated in parseResult if multiple faces
    };
  }

  /**
   * Calculate lip movement without jaw opening (for lip reading detection)
   */
  private calculateLipMovement(blendshapes: Record<string, number>): number {
    // Sum of various lip movements that indicate speaking without opening mouth
    const movements = [
      blendshapes[BLENDSHAPES.mouthPucker] || 0,
      blendshapes[BLENDSHAPES.mouthLeft] || 0,
      blendshapes[BLENDSHAPES.mouthRight] || 0,
      blendshapes[BLENDSHAPES.mouthRollLower] || 0,
      blendshapes[BLENDSHAPES.mouthRollUpper] || 0,
      blendshapes[BLENDSHAPES.mouthPressLeft] || 0,
      blendshapes[BLENDSHAPES.mouthPressRight] || 0,
      blendshapes[BLENDSHAPES.mouthStretchLeft] || 0,
      blendshapes[BLENDSHAPES.mouthStretchRight] || 0,
    ];

    // Average the movements and convert to percentage
    const avgMovement = movements.reduce((a, b) => a + b, 0) / movements.length;
    return Math.round(avgMovement * 100);
  }

  /**
   * Track blink and update history
   */
  trackBlink(isCurrentlyBlinking: boolean): void {
    const now = Date.now();

    // Detect blink transition (not blinking -> blinking)
    if (isCurrentlyBlinking && !this.wasBlinking) {
      this.blinkHistory.push(now);

      // Keep only blinks from the last 60 seconds
      const oneMinuteAgo = now - 60000;
      this.blinkHistory = this.blinkHistory.filter((t) => t > oneMinuteAgo);
    }

    this.wasBlinking = isCurrentlyBlinking;
  }

  /**
   * Get blink rate (blinks per minute)
   */
  getBlinkRate(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentBlinks = this.blinkHistory.filter((t) => t > oneMinuteAgo);
    return recentBlinks.length;
  }

  /**
   * Track eye closure duration
   */
  trackEyeClosure(areEyesClosed: boolean): void {
    const now = Date.now();

    if (areEyesClosed) {
      if (this.eyeClosureStartTime === null) {
        this.eyeClosureStartTime = now;
      }
      this.eyeClosureDuration = (now - this.eyeClosureStartTime) / 1000;
    } else {
      this.eyeClosureStartTime = null;
      this.eyeClosureDuration = 0;
    }
  }

  /**
   * Get current eye closure duration in seconds
   */
  getEyeClosureDuration(): number {
    return this.eyeClosureDuration;
  }

  /**
   * Check if eyes have been closed for extended period
   */
  isEyesClosedExtended(): boolean {
    return this.eyeClosureDuration > this.thresholds.eyesClosedExtendedSeconds;
  }

  /**
   * Check if blink rate is excessive
   */
  isExcessiveBlinking(): boolean {
    return this.getBlinkRate() > this.thresholds.excessiveBlinkingPerMinute;
  }

  /**
   * Track head movement
   */
  trackHeadMovement(headPose: HeadPoseMetrics): void {
    const now = Date.now();

    // Add current pose to history
    this.headPoseHistory.push({
      yaw: headPose.yaw,
      pitch: headPose.pitch,
      timestamp: now,
    });

    // Remove old entries outside the time window
    const cutoff = now - this.HEAD_MOVEMENT_WINDOW_MS;
    this.headPoseHistory = this.headPoseHistory.filter(
      (p) => p.timestamp > cutoff
    );
  }

  /**
   * Count significant head movements in the time window
   */
  getHeadMovementCount(): number {
    if (this.headPoseHistory.length < 2) return 0;

    let movementCount = 0;
    for (let i = 1; i < this.headPoseHistory.length; i++) {
      const prev = this.headPoseHistory[i - 1];
      const curr = this.headPoseHistory[i];

      const yawDiff = Math.abs(curr.yaw - prev.yaw);
      const pitchDiff = Math.abs(curr.pitch - prev.pitch);

      if (
        yawDiff > this.HEAD_MOVEMENT_THRESHOLD_DEGREES ||
        pitchDiff > this.HEAD_MOVEMENT_THRESHOLD_DEGREES
      ) {
        movementCount++;
      }
    }

    return movementCount;
  }

  /**
   * Reset all tracking state
   */
  resetTracking(): void {
    this.blinkHistory = [];
    this.wasBlinking = false;
    this.eyeClosureStartTime = null;
    this.eyeClosureDuration = 0;
    this.headPoseHistory = [];
  }

  /**
   * Parse MediaPipe result into structured tracking data
   */
  private parseResult(result: FaceLandmarkerResult): FaceTrackingData {
    const timestamp = Date.now();
    const faceCount = result.faceBlendshapes?.length || 0;

    // No face detected
    if (
      !result.faceBlendshapes ||
      result.faceBlendshapes.length === 0 ||
      !result.faceBlendshapes[0].categories
    ) {
      return this.createEmptyResult(timestamp, faceCount);
    }

    // Convert blendshapes array to map for easy lookup (first face)
    const blendshapes = this.blendshapesToMap(
      result.faceBlendshapes[0].categories
    );

    // Extract metrics
    const eyes = this.extractEyeMetrics(blendshapes);
    const expression = this.extractExpressionMetrics(blendshapes);
    const headPose = this.extractHeadPose(result);
    const attentionLevel = this.calculateAttentionLevel(eyes, headPose);

    // Track blink
    this.trackBlink(eyes.isBlinking);

    // Track eye closure
    const areEyesClosed =
      eyes.leftEyeOpenness < 20 && eyes.rightEyeOpenness < 20;
    this.trackEyeClosure(areEyesClosed && !eyes.isBlinking);

    // Track head movement
    this.trackHeadMovement(headPose);

    return {
      timestamp,
      faceDetected: true,
      faceCount,
      eyes: {
        ...eyes,
        leftSquint: Math.round(
          (blendshapes[BLENDSHAPES.eyeSquintLeft] || 0) * 100
        ),
        rightSquint: Math.round(
          (blendshapes[BLENDSHAPES.eyeSquintRight] || 0) * 100
        ),
      },
      expression: {
        ...expression,
        browDown: Math.round(
          (((blendshapes[BLENDSHAPES.browDownLeft] || 0) +
            (blendshapes[BLENDSHAPES.browDownRight] || 0)) /
            2) *
            100
        ),
        lipMovement: this.calculateLipMovement(blendshapes),
      },
      headPose,
      attentionLevel,
      rawBlendshapes: blendshapes,
    };
  }

  /**
   * Convert blendshapes array to a map
   */
  private blendshapesToMap(
    categories: Array<{ categoryName: string; score: number }>
  ): Record<string, number> {
    const map: Record<string, number> = {};
    for (const cat of categories) {
      map[cat.categoryName] = cat.score;
    }
    return map;
  }

  /**
   * Extract eye metrics from blendshapes
   */
  private extractEyeMetrics(blendshapes: Record<string, number>): EyeMetrics {
    // Eye openness (inverse of blink)
    const leftBlink = blendshapes[BLENDSHAPES.eyeBlinkLeft] || 0;
    const rightBlink = blendshapes[BLENDSHAPES.eyeBlinkRight] || 0;

    const leftEyeOpenness = Math.round((1 - leftBlink) * 100);
    const rightEyeOpenness = Math.round((1 - rightBlink) * 100);

    // Consider blinking if BOTH eyes are more than 50% closed (more accurate)
    // This avoids false positives from squinting or one eye being slightly closed
    const isBlinking = leftBlink > 0.5 && rightBlink > 0.5;

    // Calculate gaze direction
    const gazeDirection = this.calculateGazeDirection(blendshapes);

    return {
      leftEyeOpenness,
      rightEyeOpenness,
      isBlinking,
      gazeDirection,
    };
  }

  /**
   * Calculate gaze direction from eye look blendshapes
   */
  private calculateGazeDirection(
    blendshapes: Record<string, number>
  ): GazeDirection {
    // Get average of left and right eye movements
    const lookUp =
      ((blendshapes[BLENDSHAPES.eyeLookUpLeft] || 0) +
        (blendshapes[BLENDSHAPES.eyeLookUpRight] || 0)) /
      2;
    const lookDown =
      ((blendshapes[BLENDSHAPES.eyeLookDownLeft] || 0) +
        (blendshapes[BLENDSHAPES.eyeLookDownRight] || 0)) /
      2;
    const lookLeft =
      ((blendshapes[BLENDSHAPES.eyeLookOutLeft] || 0) +
        (blendshapes[BLENDSHAPES.eyeLookInRight] || 0)) /
      2;
    const lookRight =
      ((blendshapes[BLENDSHAPES.eyeLookInLeft] || 0) +
        (blendshapes[BLENDSHAPES.eyeLookOutRight] || 0)) /
      2;

    // Higher threshold to reduce false positives (was 0.15)
    const threshold = 0.3;

    const isUp = lookUp > threshold && lookUp > lookDown;
    const isDown = lookDown > threshold && lookDown > lookUp;
    const isLeft = lookLeft > threshold && lookLeft > lookRight;
    const isRight = lookRight > threshold && lookRight > lookLeft;

    // Combine directions
    if (isUp && isLeft) return 'UP_LEFT';
    if (isUp && isRight) return 'UP_RIGHT';
    if (isDown && isLeft) return 'DOWN_LEFT';
    if (isDown && isRight) return 'DOWN_RIGHT';
    if (isUp) return 'UP';
    if (isDown) return 'DOWN';
    if (isLeft) return 'LEFT';
    if (isRight) return 'RIGHT';

    return 'CENTER';
  }

  /**
   * Extract expression metrics from blendshapes
   */
  private extractExpressionMetrics(
    blendshapes: Record<string, number>
  ): ExpressionMetrics {
    // Calculate smile (average of left and right)
    const smile = Math.round(
      (((blendshapes[BLENDSHAPES.mouthSmileLeft] || 0) +
        (blendshapes[BLENDSHAPES.mouthSmileRight] || 0)) /
        2) *
        100
    );

    // Calculate frown
    const frown = Math.round(
      (((blendshapes[BLENDSHAPES.mouthFrownLeft] || 0) +
        (blendshapes[BLENDSHAPES.mouthFrownRight] || 0)) /
        2) *
        100
    );

    // Brow raise (combination of inner and outer)
    const browRaise = Math.round(
      (((blendshapes[BLENDSHAPES.browInnerUp] || 0) +
        (blendshapes[BLENDSHAPES.browOuterUpLeft] || 0) +
        (blendshapes[BLENDSHAPES.browOuterUpRight] || 0)) /
        3) *
        100
    );

    // Mouth open
    const mouthOpen = Math.round((blendshapes[BLENDSHAPES.jawOpen] || 0) * 100);

    // Surprise (combination of brow raise and mouth open)
    const surprise = Math.round((browRaise + mouthOpen) / 2);

    // Determine dominant expression
    const dominantExpression = this.determineDominantExpression({
      smile,
      frown,
      surprise,
      browRaise,
    });

    return {
      dominantExpression,
      smile,
      frown,
      surprise,
      browRaise,
      mouthOpen,
    };
  }

  /**
   * Determine the dominant facial expression
   */
  private determineDominantExpression(metrics: {
    smile: number;
    frown: number;
    surprise: number;
    browRaise: number;
  }): Expression {
    const { smile, frown, surprise, browRaise } = metrics;

    // Higher thresholds to reduce false positives and noise
    // Only detect clear, obvious expressions
    if (surprise > 60 && browRaise > 40) return 'SURPRISED';
    if (smile > 50) return 'HAPPY';
    if (frown > 40) return 'SAD';
    if (frown > 35 && browRaise < 10) return 'ANGRY';
    if (browRaise > 45 && smile < 20 && frown < 20) return 'CONFUSED';

    return 'NEUTRAL';
  }

  /**
   * Extract head pose from transformation matrix
   */
  private extractHeadPose(result: FaceLandmarkerResult): HeadPoseMetrics {
    // Default pose (facing camera)
    const defaultPose: HeadPoseMetrics = { pitch: 0, yaw: 0, roll: 0 };

    if (
      !result.facialTransformationMatrixes ||
      result.facialTransformationMatrixes.length === 0
    ) {
      return defaultPose;
    }

    const matrix = result.facialTransformationMatrixes[0];
    if (!matrix || !matrix.data || matrix.data.length < 16) {
      return defaultPose;
    }

    // Extract rotation from 4x4 transformation matrix
    // The matrix is in column-major order
    const m = matrix.data;

    // Calculate Euler angles from rotation matrix
    // Reference: https://www.geometrictools.com/Documentation/EulerAngles.pdf
    const sy = Math.sqrt(m[0] * m[0] + m[4] * m[4]);
    const singular = sy < 1e-6;

    let pitch: number, yaw: number, roll: number;

    if (!singular) {
      pitch = Math.atan2(m[9], m[10]); // Rotation around X
      yaw = Math.atan2(-m[8], sy); // Rotation around Y
      roll = Math.atan2(m[4], m[0]); // Rotation around Z
    } else {
      pitch = Math.atan2(-m[6], m[5]);
      yaw = Math.atan2(-m[8], sy);
      roll = 0;
    }

    // Convert to degrees
    const toDegrees = (rad: number) => Math.round(rad * (180 / Math.PI));

    return {
      pitch: toDegrees(pitch),
      yaw: toDegrees(yaw),
      roll: toDegrees(roll),
    };
  }

  /**
   * Calculate attention level based on eye metrics and head pose
   */
  private calculateAttentionLevel(
    eyes: EyeMetrics,
    headPose: HeadPoseMetrics
  ): AttentionLevel {
    // If eyes are closed (blinking), attention is still considered based on head pose
    const avgEyeOpenness = (eyes.leftEyeOpenness + eyes.rightEyeOpenness) / 2;

    // Eyes mostly closed (not just blinking)
    if (avgEyeOpenness < 20 && !eyes.isBlinking) {
      return 'AWAY';
    }

    // Head turned significantly away (more lenient thresholds)
    if (Math.abs(headPose.yaw) > 50 || Math.abs(headPose.pitch) > 40) {
      return 'AWAY';
    }

    // Low attention if head is moderately turned or gaze is away
    if (Math.abs(headPose.yaw) > 35 || Math.abs(headPose.pitch) > 30) {
      return 'LOW';
    }

    // Medium attention if looking slightly away
    if (eyes.gazeDirection !== 'CENTER' || avgEyeOpenness < 50) {
      return 'MEDIUM';
    }

    // High attention: facing camera with eyes open
    if (
      avgEyeOpenness > 70 &&
      Math.abs(headPose.yaw) < 15 &&
      Math.abs(headPose.pitch) < 15
    ) {
      return 'HIGH';
    }

    return 'MEDIUM';
  }

  /**
   * Create an empty result when no face is detected
   */
  private createEmptyResult(
    timestamp: number,
    faceCount = 0
  ): FaceTrackingData {
    return {
      timestamp,
      faceDetected: false,
      faceCount,
      eyes: {
        leftEyeOpenness: 0,
        rightEyeOpenness: 0,
        isBlinking: false,
        gazeDirection: 'CENTER',
      },
      expression: {
        dominantExpression: 'NEUTRAL',
        smile: 0,
        frown: 0,
        surprise: 0,
        browRaise: 0,
        mouthOpen: 0,
      },
      headPose: {
        pitch: 0,
        yaw: 0,
        roll: 0,
      },
      attentionLevel: 'AWAY',
    };
  }

  /**
   * Format tracking data for human-readable logging
   */
  formatForLogging(data: FaceTrackingData): string {
    if (!data.faceDetected) {
      return '[FaceTracking] No face detected';
    }

    const { eyes, expression, headPose, attentionLevel } = data;

    const eyesStr = `Eyes: L(${eyes.leftEyeOpenness}%) R(${
      eyes.rightEyeOpenness
    }%)${eyes.isBlinking ? ' [BLINK]' : ''}`;
    const gazeStr = `Gaze: ${eyes.gazeDirection}`;
    const exprStr = `Expr: ${expression.dominantExpression}`;
    const poseStr = `Head: p=${headPose.pitch}° y=${headPose.yaw}° r=${headPose.roll}°`;
    const attnStr = `Attention: ${attentionLevel}`;

    return `[FaceTracking] ${eyesStr} | ${gazeStr} | ${exprStr} | ${poseStr} | ${attnStr}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    this.isInitialized = false;
    this.resetTracking();
    console.log('[FaceTracking] Service destroyed');
  }
}

// Export singleton instance for convenience
export const faceTrackingService = new FaceTrackingService();
