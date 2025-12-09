import { Injectable, Logger } from '@nestjs/common';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  createdAt: Date;
  messages: ChatMessage[];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private sessions: Map<string, ChatSession> = new Map();

  // Mock responses for development
  private readonly mockResponses = [
    "Hello! I'm here to help. What can I assist you with today?",
    "That's an interesting question. Let me think about that...",
    "I understand what you're asking. Here's what I can tell you:",
    "Great point! Here are some thoughts on that topic.",
    "Thanks for sharing. Is there anything specific you'd like me to elaborate on?",
    "I'd be happy to help with that. Let me provide some information.",
    "That's a common question. Here's what you should know:",
    "Interesting perspective! Let me add to that discussion.",
  ];

  createSession(clientId: string): ChatSession {
    const session: ChatSession = {
      id: `session-${clientId}-${Date.now()}`,
      createdAt: new Date(),
      messages: [],
    };
    this.sessions.set(clientId, session);
    this.logger.log(`Session created for client: ${clientId}`);
    return session;
  }

  getSession(clientId: string): ChatSession | undefined {
    return this.sessions.get(clientId);
  }

  removeSession(clientId: string): void {
    this.sessions.delete(clientId);
    this.logger.log(`Session removed for client: ${clientId}`);
  }

  async processMessage(clientId: string, content: string): Promise<ChatMessage> {
    const session = this.sessions.get(clientId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    // Store user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content,
      role: 'user',
      timestamp: new Date(),
    };
    session.messages.push(userMessage);

    // Simulate processing delay (800-2000ms)
    const delay = 800 + Math.random() * 1200;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Generate mock response
    const responseContent = this.generateResponse(content);
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: responseContent,
      role: 'assistant',
      timestamp: new Date(),
    };
    session.messages.push(assistantMessage);

    this.logger.log(`Processed message for client: ${clientId}`);
    return assistantMessage;
  }

  private generateResponse(userMessage: string): string {
    // Simple mock logic - in production this would call an AI service
    const randomIndex = Math.floor(Math.random() * this.mockResponses.length);
    return this.mockResponses[randomIndex];
  }
}

