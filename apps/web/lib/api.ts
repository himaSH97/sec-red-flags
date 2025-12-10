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
  "Great point! Here are some thoughts on that topic.",
  "Thanks for sharing. Is there anything specific you'd like me to elaborate on?",
  "I'd be happy to help with that. Let me provide some information.",
  "That's a common question. Here's what you should know:",
  "Interesting perspective! Let me add to that discussion.",
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
  sendMessage: async (sessionId: string, content: string): Promise<ChatResponse> => {
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
    const response = await api.get<SessionEvent[]>(`/sessions/${sessionId}/events`);
    return response.data;
  },
};

// Export the axios instance for future real API calls
export default api;

