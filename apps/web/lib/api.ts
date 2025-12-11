import axios, { AxiosInstance } from 'axios';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface ChatResponse {
  message: Message;
}

export interface ChatSession {
  id: string;
  createdAt: Date;
}

// Mock responses for development
const mockResponses = [
  "Hello! I'm here to help. What can I assist you with today?",
  "That's an interesting question. Let me think about that...",
  "I understand what you're asking. Here's what I can tell you:",
  'Great point! Here are some thoughts on that topic.',
  "Thanks for sharing. Is there anything specific you'd like me to elaborate on?",
  "I'd be happy to help with that. Let me provide some information.",
  "That's a common question. Here's what you should know:",
  'Interesting perspective! Let me add to that discussion.',
];

// Helper to generate mock response
const generateMockResponse = (userMessage: string): string => {
  // Simple mock logic - in production this would call the real API
  const randomIndex = Math.floor(Math.random() * mockResponses.length);
  return mockResponses[randomIndex];
};

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// API functions with mock implementations
export const chatApi = {
  // Create a new chat session
  createSession: async (): Promise<ChatSession> => {
    // Mock implementation
    await delay(300);
    return {
      id: `session-${Date.now()}`,
      createdAt: new Date(),
    };
  },

  // Send a message and get a response
  sendMessage: async (
    sessionId: string,
    content: string
  ): Promise<ChatResponse> => {
    // Mock implementation with simulated delay
    await delay(800 + Math.random() * 1200); // 800-2000ms delay

    const responseContent = generateMockResponse(content);

    return {
      message: {
        id: `msg-${Date.now()}`,
        content: responseContent,
        role: 'assistant',
        timestamp: new Date(),
      },
    };
  },
};

// Session types
export interface Session {
  _id: string;
  sessionId: string;
  clientId: string;
  createdAt: string;
  updatedAt: string;
  // Video recording fields
  videoStatus?: 'idle' | 'recording' | 'completed' | 'failed';
  videoStartedAt?: string;
  videoEndedAt?: string;
}

export interface SessionsResponse {
  sessions: Session[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SessionEvent {
  _id: string;
  sessionId: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  rawData?: Record<string, unknown>;
}

// Typing Analysis types
export interface InterKeyIntervalStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  stdDev: number;
  variance: number;
}

export interface CorrectionMetrics {
  backspaceCount: number;
  deleteCount: number;
  totalCorrections: number;
  correctionRatio: number;
}

export interface SpeedMetrics {
  avgWPM: number;
  peakWPM: number;
  avgCPM: number;
  peakCPM: number;
}

export interface BurstMetrics {
  burstCount: number;
  avgBurstSize: number;
  maxBurstSize: number;
  burstsAfterLongPause: number;
  longPauseThresholdMs: number;
}

export interface SpeedWindow {
  startTime: number;
  endTime: number;
  keystrokeCount: number;
  characterCount: number;
  wpm: number;
  cpm: number;
}

export interface SuspiciousPattern {
  code: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  contribution: number;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface TypingAnalysis {
  sessionId: string;
  analyzedAt: string;
  totalKeystrokes: number;
  totalCharacters: number;
  totalBatches: number;
  sessionDurationMs: number;
  interKeyInterval: InterKeyIntervalStats;
  speed: SpeedMetrics;
  corrections: CorrectionMetrics;
  bursts: BurstMetrics;
  speedOverTime: SpeedWindow[];
  riskScore: number;
  riskLevel: RiskLevel;
  suspiciousPatterns: SuspiciousPattern[];
}

// Video chunk types
export interface VideoChunk {
  index: number;
  s3Key: string;
  size?: number;
  uploadedAt: string;
  downloadUrl: string;
}

export interface VideoChunksResponse {
  sessionId: string;
  videoStatus: 'idle' | 'recording' | 'completed' | 'failed';
  videoStartedAt?: string;
  videoEndedAt?: string;
  chunks: VideoChunk[];
  totalDurationMs: number;
  chunkDurationMs: number;
}

// Session API functions
export const sessionApi = {
  // Get paginated sessions
  getSessions: async (page = 1, limit = 10): Promise<SessionsResponse> => {
    const response = await api.get<SessionsResponse>('/sessions', {
      params: { page, limit },
    });
    return response.data;
  },

  // Get a single session by ID
  getSession: async (sessionId: string): Promise<Session | null> => {
    const response = await api.get<Session>(`/sessions/${sessionId}`);
    return response.data;
  },

  // Get events for a session
  getSessionEvents: async (sessionId: string): Promise<SessionEvent[]> => {
    const response = await api.get<SessionEvent[]>(
      `/sessions/${sessionId}/events`
    );
    return response.data;
  },

  // Get typing analysis for a session
  getTypingAnalysis: async (
    sessionId: string
  ): Promise<TypingAnalysis | null> => {
    try {
      const response = await api.get<TypingAnalysis>(
        `/sessions/${sessionId}/typing-analysis`
      );
      return response.data;
    } catch (error) {
      // Return null if no keystroke data exists
      return null;
    }
  },

  // Get video chunks with download URLs
  getVideoChunks: async (
    sessionId: string
  ): Promise<VideoChunksResponse | null> => {
    try {
      const response = await api.get<VideoChunksResponse>(
        `/sessions/${sessionId}/video-chunks`
      );
      // Convert relative URLs to full URLs
      // The API returns /api/sessions/... so we need the base without /api
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api';
      const baseUrl = apiBase.replace(/\/api\/?$/, ''); // Remove trailing /api
      if (response.data?.chunks) {
        response.data.chunks = response.data.chunks.map((chunk) => ({
          ...chunk,
          // Ensure downloadUrl is a full URL
          downloadUrl: chunk.downloadUrl.startsWith('/')
            ? `${baseUrl}${chunk.downloadUrl}`
            : chunk.downloadUrl,
        }));
      }
      return response.data;
    } catch (error) {
      // Return null if no video data exists
      return null;
    }
  },
};

// System Config types
export interface SystemConfig {
  _id: string;
  key: string;
  faceRecognitionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateConfigDto {
  faceRecognitionEnabled?: boolean;
}

// Admin API functions
export const adminApi = {
  // Get current system config
  getConfig: async (): Promise<SystemConfig> => {
    const response = await api.get<SystemConfig>('/admin/config');
    return response.data;
  },

  // Update system config
  updateConfig: async (updates: UpdateConfigDto): Promise<SystemConfig> => {
    const response = await api.put<SystemConfig>('/admin/config', updates);
    return response.data;
  },
};

// Export the axios instance for future real API calls
export default api;
