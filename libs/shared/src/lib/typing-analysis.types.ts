/**
 * Typing Analysis Types
 * Shared types for typing rhythm analysis between frontend and backend
 */

/**
 * Risk level based on analysis score
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Inter-key interval statistics
 */
export interface InterKeyIntervalStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  stdDev: number;
  variance: number;
}

/**
 * Correction metrics (backspace/delete usage)
 */
export interface CorrectionMetrics {
  backspaceCount: number;
  deleteCount: number;
  totalCorrections: number;
  correctionRatio: number;
}

/**
 * Speed metrics
 */
export interface SpeedMetrics {
  avgWPM: number;
  peakWPM: number;
  avgCPM: number;  // Characters per minute
  peakCPM: number;
}

/**
 * Burst detection results
 */
export interface BurstMetrics {
  burstCount: number;
  avgBurstSize: number;
  maxBurstSize: number;
  burstsAfterLongPause: number;
  longPauseThresholdMs: number;
}

/**
 * Typing speed over time windows
 */
export interface SpeedWindow {
  startTime: number;
  endTime: number;
  keystrokeCount: number;
  characterCount: number;
  wpm: number;
  cpm: number;
}

/**
 * Suspicious pattern detected
 */
export interface SuspiciousPattern {
  code: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  contribution: number;  // Points added to risk score
}

/**
 * Complete typing analysis result
 */
export interface TypingAnalysis {
  sessionId: string;
  analyzedAt: Date;

  // Raw metrics
  totalKeystrokes: number;
  totalCharacters: number;
  totalBatches: number;
  sessionDurationMs: number;

  // Timing metrics
  interKeyInterval: InterKeyIntervalStats;

  // Speed metrics
  speed: SpeedMetrics;

  // Correction metrics
  corrections: CorrectionMetrics;

  // Burst metrics
  bursts: BurstMetrics;

  // Speed over time (for charting)
  speedOverTime: SpeedWindow[];

  // Risk assessment
  riskScore: number;
  riskLevel: RiskLevel;
  suspiciousPatterns: SuspiciousPattern[];
}

/**
 * Risk score thresholds
 */
export const RISK_THRESHOLDS = {
  LOW_MAX: 25,
  MEDIUM_MAX: 50,
} as const;

/**
 * Suspicious pattern codes
 */
export const SUSPICIOUS_PATTERN_CODES = {
  LOW_KEYSTROKE_COUNT: 'LOW_KEYSTROKE_COUNT',
  NO_CORRECTIONS: 'NO_CORRECTIONS',
  TOO_CONSISTENT_TIMING: 'TOO_CONSISTENT_TIMING',
  BURSTS_AFTER_PAUSE: 'BURSTS_AFTER_PAUSE',
  SUPERHUMAN_SPEED: 'SUPERHUMAN_SPEED',
  VERY_LOW_SPEED: 'VERY_LOW_SPEED',
} as const;

/**
 * Get risk level from score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score <= RISK_THRESHOLDS.LOW_MAX) return 'low';
  if (score <= RISK_THRESHOLDS.MEDIUM_MAX) return 'medium';
  return 'high';
}

/**
 * Get risk level color
 */
export function getRiskLevelColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return 'green';
    case 'medium':
      return 'yellow';
    case 'high':
      return 'red';
  }
}

