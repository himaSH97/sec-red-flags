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

  // Other useful ones
  eyeSquintLeft: 'eyeSquintLeft',
  eyeSquintRight: 'eyeSquintRight',
  cheekPuff: 'cheekPuff',
  mouthPucker: 'mouthPucker',
} as const;

// ============================================================================
// Face Tracking Service
// ============================================================================

export class FaceTrackingService {
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private lastProcessTime = 0;
  private minProcessInterval = 100; // Minimum ms between processing

  /**
   * Initialize the MediaPipe FaceLandmarker
   * Must be called before processing any frames
   */
  async initialize(): Promise<void> {
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
        numFaces: 1,
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
   * Parse MediaPipe result into structured tracking data
   */
  private parseResult(result: FaceLandmarkerResult): FaceTrackingData {
    const timestamp = Date.now();

    // No face detected
    if (
      !result.faceBlendshapes ||
      result.faceBlendshapes.length === 0 ||
      !result.faceBlendshapes[0].categories
    ) {
      return this.createEmptyResult(timestamp);
    }

    // Convert blendshapes array to map for easy lookup
    const blendshapes = this.blendshapesToMap(
      result.faceBlendshapes[0].categories
    );

    // Extract metrics
    const eyes = this.extractEyeMetrics(blendshapes);
    const expression = this.extractExpressionMetrics(blendshapes);
    const headPose = this.extractHeadPose(result);
    const attentionLevel = this.calculateAttentionLevel(eyes, headPose);

    return {
      timestamp,
      faceDetected: true,
      eyes,
      expression,
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
  private createEmptyResult(timestamp: number): FaceTrackingData {
    return {
      timestamp,
      faceDetected: false,
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
    console.log('[FaceTracking] Service destroyed');
  }
}

// Export singleton instance for convenience
export const faceTrackingService = new FaceTrackingService();
