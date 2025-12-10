import { Injectable, Logger } from '@nestjs/common';
import { KeystrokeService } from './keystroke.service';
import { Keystroke } from './keystroke.schema';
import {
  TypingAnalysis,
  InterKeyIntervalStats,
  CorrectionMetrics,
  SpeedMetrics,
  BurstMetrics,
  SpeedWindow,
  SuspiciousPattern,
  RiskLevel,
  getRiskLevel,
  SUSPICIOUS_PATTERN_CODES,
} from '@sec-flags/shared';

// Constants for analysis
const LONG_PAUSE_THRESHOLD_MS = 5000;
const SPEED_WINDOW_MS = 30000; // 30 second windows
const MIN_BURST_SIZE = 10;
const AVG_WORD_LENGTH = 5;

@Injectable()
export class KeystrokeAnalyticsService {
  private readonly logger = new Logger(KeystrokeAnalyticsService.name);

  constructor(private readonly keystrokeService: KeystrokeService) {}

  /**
   * Perform full typing analysis for a session
   */
  async analyzeSession(sessionId: string): Promise<TypingAnalysis | null> {
    this.logger.log(`Analyzing typing rhythm for session: ${sessionId}`);

    // Get all keystrokes for the session
    const keystrokes = await this.keystrokeService.getKeystrokesBySession(sessionId);
    const stats = await this.keystrokeService.getKeystrokeStats(sessionId);

    if (keystrokes.length === 0) {
      this.logger.warn(`No keystrokes found for session: ${sessionId}`);
      return null;
    }

    // Calculate all metrics
    const interKeyInterval = this.calculateInterKeyIntervals(keystrokes);
    const corrections = this.calculateCorrectionMetrics(keystrokes);
    const speed = this.calculateSpeedMetrics(keystrokes, stats.durationMs);
    const bursts = this.detectBursts(keystrokes);
    const speedOverTime = this.calculateSpeedOverTime(keystrokes);

    // Count printable characters
    const totalCharacters = keystrokes.filter(k => k.key.length === 1 && !k.isPassword).length;

    // Calculate risk score and patterns
    const { riskScore, suspiciousPatterns } = this.calculateRiskScore({
      totalKeystrokes: keystrokes.length,
      interKeyInterval,
      corrections,
      speed,
      bursts,
    });

    const analysis: TypingAnalysis = {
      sessionId,
      analyzedAt: new Date(),
      totalKeystrokes: keystrokes.length,
      totalCharacters,
      totalBatches: stats.totalBatches,
      sessionDurationMs: stats.durationMs,
      interKeyInterval,
      speed,
      corrections,
      bursts,
      speedOverTime,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      suspiciousPatterns,
    };

    this.logger.log(
      `Analysis complete for session ${sessionId}: Risk ${analysis.riskLevel} (${riskScore})`,
    );

    return analysis;
  }

  /**
   * Calculate inter-key interval statistics
   */
  private calculateInterKeyIntervals(keystrokes: Keystroke[]): InterKeyIntervalStats {
    if (keystrokes.length < 2) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        stdDev: 0,
        variance: 0,
      };
    }

    const intervals: number[] = [];
    for (let i = 1; i < keystrokes.length; i++) {
      const interval = keystrokes[i].timestamp - keystrokes[i - 1].timestamp;
      // Filter out long pauses (> 5 seconds) for rhythm analysis
      if (interval < LONG_PAUSE_THRESHOLD_MS) {
        intervals.push(interval);
      }
    }

    if (intervals.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        stdDev: 0,
        variance: 0,
      };
    }

    // Sort for median
    const sorted = [...intervals].sort((a, b) => a - b);
    const count = intervals.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = intervals.reduce((a, b) => a + b, 0) / count;
    const median = count % 2 === 0
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];

    // Calculate variance and standard deviation
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
      count,
      min: Math.round(min),
      max: Math.round(max),
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median),
      stdDev: Math.round(stdDev * 100) / 100,
      variance: Math.round(variance * 100) / 100,
    };
  }

  /**
   * Calculate correction metrics (backspace/delete usage)
   */
  private calculateCorrectionMetrics(keystrokes: Keystroke[]): CorrectionMetrics {
    const backspaceCount = keystrokes.filter(k => k.key === 'Backspace').length;
    const deleteCount = keystrokes.filter(k => k.key === 'Delete').length;
    const totalCorrections = backspaceCount + deleteCount;
    const correctionRatio = keystrokes.length > 0
      ? Math.round((totalCorrections / keystrokes.length) * 10000) / 100
      : 0;

    return {
      backspaceCount,
      deleteCount,
      totalCorrections,
      correctionRatio,
    };
  }

  /**
   * Calculate typing speed metrics
   */
  private calculateSpeedMetrics(keystrokes: Keystroke[], durationMs: number): SpeedMetrics {
    if (keystrokes.length === 0 || durationMs === 0) {
      return { avgWPM: 0, peakWPM: 0, avgCPM: 0, peakCPM: 0 };
    }

    // Count printable characters (excluding password fields)
    const characters = keystrokes.filter(k => k.key.length === 1 && !k.isPassword);
    const charCount = characters.length;

    // Average speed
    const minutes = durationMs / 60000;
    const avgCPM = Math.round(charCount / minutes);
    const avgWPM = Math.round(avgCPM / AVG_WORD_LENGTH);

    // Peak speed (using sliding window)
    let peakCPM = 0;
    const windowMs = 10000; // 10 second window for peak

    for (let i = 0; i < keystrokes.length; i++) {
      const windowStart = keystrokes[i].timestamp;
      const windowEnd = windowStart + windowMs;
      const windowChars = keystrokes.filter(
        k => k.timestamp >= windowStart && 
             k.timestamp < windowEnd && 
             k.key.length === 1 && 
             !k.isPassword
      ).length;
      const windowCPM = (windowChars / windowMs) * 60000;
      if (windowCPM > peakCPM) {
        peakCPM = windowCPM;
      }
    }

    peakCPM = Math.round(peakCPM);
    const peakWPM = Math.round(peakCPM / AVG_WORD_LENGTH);

    return { avgWPM, peakWPM, avgCPM, peakCPM };
  }

  /**
   * Detect typing bursts (sudden fast typing after pauses)
   */
  private detectBursts(keystrokes: Keystroke[]): BurstMetrics {
    if (keystrokes.length < 2) {
      return {
        burstCount: 0,
        avgBurstSize: 0,
        maxBurstSize: 0,
        burstsAfterLongPause: 0,
        longPauseThresholdMs: LONG_PAUSE_THRESHOLD_MS,
      };
    }

    const bursts: { size: number; afterLongPause: boolean }[] = [];
    let currentBurstSize = 1;
    let wasLongPause = false;
    let afterLongPause = false;

    for (let i = 1; i < keystrokes.length; i++) {
      const interval = keystrokes[i].timestamp - keystrokes[i - 1].timestamp;

      if (interval >= LONG_PAUSE_THRESHOLD_MS) {
        // Long pause detected - end current burst
        if (currentBurstSize >= MIN_BURST_SIZE) {
          bursts.push({ size: currentBurstSize, afterLongPause });
        }
        currentBurstSize = 1;
        wasLongPause = true;
        afterLongPause = true;
      } else if (interval < 200) {
        // Fast typing - continue burst
        currentBurstSize++;
        if (!wasLongPause) {
          afterLongPause = false;
        }
        wasLongPause = false;
      } else {
        // Normal typing - check if burst should end
        if (currentBurstSize >= MIN_BURST_SIZE) {
          bursts.push({ size: currentBurstSize, afterLongPause });
        }
        currentBurstSize = 1;
        wasLongPause = false;
        afterLongPause = false;
      }
    }

    // Don't forget the last burst
    if (currentBurstSize >= MIN_BURST_SIZE) {
      bursts.push({ size: currentBurstSize, afterLongPause });
    }

    const burstCount = bursts.length;
    const avgBurstSize = burstCount > 0
      ? Math.round(bursts.reduce((sum, b) => sum + b.size, 0) / burstCount)
      : 0;
    const maxBurstSize = burstCount > 0
      ? Math.max(...bursts.map(b => b.size))
      : 0;
    const burstsAfterLongPause = bursts.filter(b => b.afterLongPause).length;

    return {
      burstCount,
      avgBurstSize,
      maxBurstSize,
      burstsAfterLongPause,
      longPauseThresholdMs: LONG_PAUSE_THRESHOLD_MS,
    };
  }

  /**
   * Calculate typing speed over time windows (for charting)
   */
  private calculateSpeedOverTime(keystrokes: Keystroke[]): SpeedWindow[] {
    if (keystrokes.length === 0) {
      return [];
    }

    const windows: SpeedWindow[] = [];
    const startTime = keystrokes[0].timestamp;
    const endTime = keystrokes[keystrokes.length - 1].timestamp;

    for (let windowStart = startTime; windowStart < endTime; windowStart += SPEED_WINDOW_MS) {
      const windowEnd = windowStart + SPEED_WINDOW_MS;
      const windowKeystrokes = keystrokes.filter(
        k => k.timestamp >= windowStart && k.timestamp < windowEnd,
      );

      const keystrokeCount = windowKeystrokes.length;
      const characterCount = windowKeystrokes.filter(
        k => k.key.length === 1 && !k.isPassword,
      ).length;

      const minutes = SPEED_WINDOW_MS / 60000;
      const cpm = Math.round(characterCount / minutes);
      const wpm = Math.round(cpm / AVG_WORD_LENGTH);

      windows.push({
        startTime: windowStart,
        endTime: windowEnd,
        keystrokeCount,
        characterCount,
        wpm,
        cpm,
      });
    }

    return windows;
  }

  /**
   * Calculate risk score and identify suspicious patterns
   */
  private calculateRiskScore(metrics: {
    totalKeystrokes: number;
    interKeyInterval: InterKeyIntervalStats;
    corrections: CorrectionMetrics;
    speed: SpeedMetrics;
    bursts: BurstMetrics;
  }): { riskScore: number; suspiciousPatterns: SuspiciousPattern[] } {
    let riskScore = 0;
    const suspiciousPatterns: SuspiciousPattern[] = [];

    // Check for low keystroke count (might indicate copy-paste)
    if (metrics.totalKeystrokes < 50) {
      const contribution = 25;
      riskScore += contribution;
      suspiciousPatterns.push({
        code: SUSPICIOUS_PATTERN_CODES.LOW_KEYSTROKE_COUNT,
        description: `Very low keystroke count (${metrics.totalKeystrokes})`,
        severity: 'high',
        contribution,
      });
    }

    // Check for no corrections (suspicious - everyone makes typos)
    if (metrics.corrections.correctionRatio < 2 && metrics.totalKeystrokes > 50) {
      const contribution = 20;
      riskScore += contribution;
      suspiciousPatterns.push({
        code: SUSPICIOUS_PATTERN_CODES.NO_CORRECTIONS,
        description: `Almost no corrections (${metrics.corrections.correctionRatio}%)`,
        severity: 'medium',
        contribution,
      });
    }

    // Check for too consistent timing (robotic typing)
    if (metrics.interKeyInterval.stdDev < 30 && metrics.interKeyInterval.count > 20) {
      const contribution = 15;
      riskScore += contribution;
      suspiciousPatterns.push({
        code: SUSPICIOUS_PATTERN_CODES.TOO_CONSISTENT_TIMING,
        description: `Unnaturally consistent timing (σ=${metrics.interKeyInterval.stdDev}ms)`,
        severity: 'medium',
        contribution,
      });
    }

    // Check for bursts after long pauses (copy-paste pattern)
    if (metrics.bursts.burstsAfterLongPause > 3) {
      const contribution = 25;
      riskScore += contribution;
      suspiciousPatterns.push({
        code: SUSPICIOUS_PATTERN_CODES.BURSTS_AFTER_PAUSE,
        description: `${metrics.bursts.burstsAfterLongPause} typing bursts after long pauses`,
        severity: 'high',
        contribution,
      });
    }

    // Check for superhuman typing speed
    if (metrics.speed.avgWPM > 120) {
      const contribution = 15;
      riskScore += contribution;
      suspiciousPatterns.push({
        code: SUSPICIOUS_PATTERN_CODES.SUPERHUMAN_SPEED,
        description: `Unusually fast typing (${metrics.speed.avgWPM} WPM)`,
        severity: 'medium',
        contribution,
      });
    }

    // Check for very low speed (might indicate reading/copying)
    if (metrics.speed.avgWPM < 10 && metrics.totalKeystrokes > 50) {
      const contribution = 10;
      riskScore += contribution;
      suspiciousPatterns.push({
        code: SUSPICIOUS_PATTERN_CODES.VERY_LOW_SPEED,
        description: `Very slow typing (${metrics.speed.avgWPM} WPM)`,
        severity: 'low',
        contribution,
      });
    }

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    return { riskScore, suspiciousPatterns };
  }
}

