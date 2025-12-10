import { io, Socket } from 'socket.io-client';
import {
  FaceTrackingEventType,
  FaceTrackingEventPayload,
  ClientEventPayload,
  KeystrokeBatchPayload,
} from '@sec-flags/shared';

// Re-export for convenience
export type { FaceTrackingEventType, FaceTrackingEventPayload, ClientEventPayload, KeystrokeBatchPayload };

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface FaceVerificationConfig {
  enabled: boolean;
  checkIntervalMs: number;
  confidenceThreshold: number;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: Date;
  faceVerification?: FaceVerificationConfig;
}

export interface ChatResponse {
  message: Message;
}

export interface ChatError {
  message: string;
}

export interface FaceReferenceStored {
  success: boolean;
  message: string;
  createdAt?: Date;
}

export interface FaceVerifyResult {
  success: boolean;
  confidence: number;
  message: string;
  retriesLeft?: number;
}

export interface FaceVerifyFailed {
  success: boolean;
  confidence: number;
  message: string;
  shouldDisconnect: boolean;
}

// Video recording interfaces
export interface VideoStartedEvent {
  sessionId: string;
}

export interface VideoUrlEvent {
  chunkIndex: number;
  url: string;
  s3Key: string;
  expiresIn: number;
}

export interface VideoUrlErrorEvent {
  chunkIndex: number;
  error: string;
}

export interface VideoChunkConfirmedEvent {
  chunkIndex: number;
}

export interface VideoStoppedEvent {
  sessionId: string;
}

export interface VideoStatusEvent {
  status: 'idle' | 'recording' | 'completed' | 'failed';
  chunkCount: number;
  lastChunkIndex?: number;
}

export interface VideoErrorEvent {
  error: string;
}

class SocketService {
  private socket: Socket | null = null;
  private faceConfig: FaceVerificationConfig | null = null;

  // Create socket but don't connect yet
  private createSocket(): Socket {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
    console.log('[SocketService] Creating socket to:', apiUrl);
    
    const socket = io(apiUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: false, // Don't connect automatically
    });

    socket.on('connect', () => {
      console.log('[SocketService] Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[SocketService] Socket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[SocketService] Connection error:', error);
    });

    return socket;
  }

  // Initialize socket (creates if needed, returns existing if available)
  connect(): Socket {
    if (this.socket?.connected) {
      console.log('[SocketService] Already connected, returning existing socket');
      return this.socket;
    }

    // If socket exists but not connected, try to reconnect
    if (this.socket) {
      console.log('[SocketService] Socket exists, reconnecting...');
      this.socket.connect();
      return this.socket;
    }

    // Create new socket
    console.log('[SocketService] Creating new socket and connecting...');
    this.socket = this.createSocket();
    this.socket.connect();
    return this.socket;
  }

  // Create socket without connecting - for setting up listeners first
  prepare(): Socket {
    if (!this.socket) {
      console.log('[SocketService] Preparing new socket...');
      this.socket = this.createSocket();
    } else {
      console.log('[SocketService] Socket already exists, reusing...');
    }
    return this.socket;
  }

  // Start connection after listeners are set up
  start(): void {
    if (this.socket && !this.socket.connected) {
      console.log('[SocketService] Starting connection...');
      this.socket.connect();
    } else {
      console.log('[SocketService] Cannot start - socket:', !!this.socket, 'connected:', this.socket?.connected);
    }
  }

  disconnect(): void {
    console.log('[SocketService] Disconnecting...');
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.faceConfig = null;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  getFaceConfig(): FaceVerificationConfig | null {
    return this.faceConfig;
  }

  setFaceConfig(config: FaceVerificationConfig): void {
    this.faceConfig = config;
  }

  // Chat Event listeners
  onSession(callback: (session: SessionInfo) => void): void {
    const socket = this.prepare();
    console.log('[SocketService] Registering session listener');
    socket.on('session', (session: SessionInfo) => {
      console.log('[SocketService] Session event received:', session);
      if (session.faceVerification) {
        this.faceConfig = session.faceVerification;
      }
      callback(session);
    });
  }

  onResponse(callback: (response: ChatResponse) => void): void {
    this.socket?.on('response', callback);
  }

  onError(callback: (error: ChatError) => void): void {
    this.socket?.on('error', callback);
  }

  // Face verification event listeners
  onFaceReferenceStored(callback: (result: FaceReferenceStored) => void): void {
    const socket = this.prepare();
    console.log('[SocketService] Registering face:reference:stored listener');
    socket.on('face:reference:stored', (result) => {
      console.log('[SocketService] face:reference:stored event received:', result);
      callback(result);
    });
  }

  onFaceResult(callback: (result: FaceVerifyResult) => void): void {
    this.socket?.on('face:result', callback);
  }

  onFaceFailed(callback: (result: FaceVerifyFailed) => void): void {
    this.socket?.on('face:failed', callback);
  }

  // Remove listeners
  offSession(callback?: (session: SessionInfo) => void): void {
    if (callback) {
      this.socket?.off('session', callback);
    } else {
      this.socket?.off('session');
    }
  }

  offResponse(callback?: (response: ChatResponse) => void): void {
    if (callback) {
      this.socket?.off('response', callback);
    } else {
      this.socket?.off('response');
    }
  }

  offError(callback?: (error: ChatError) => void): void {
    if (callback) {
      this.socket?.off('error', callback);
    } else {
      this.socket?.off('error');
    }
  }

  offFaceReferenceStored(callback?: (result: FaceReferenceStored) => void): void {
    if (callback) {
      this.socket?.off('face:reference:stored', callback);
    } else {
      this.socket?.off('face:reference:stored');
    }
  }

  offFaceResult(callback?: (result: FaceVerifyResult) => void): void {
    if (callback) {
      this.socket?.off('face:result', callback);
    } else {
      this.socket?.off('face:result');
    }
  }

  offFaceFailed(callback?: (result: FaceVerifyFailed) => void): void {
    if (callback) {
      this.socket?.off('face:failed', callback);
    } else {
      this.socket?.off('face:failed');
    }
  }

  // Send chat message
  sendMessage(content: string): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot send message - not connected');
      return;
    }
    console.log('[SocketService] Sending message:', content.substring(0, 50));
    this.socket.emit('message', { content });
  }

  // Send reference face image
  sendReferenceFace(imageBase64: string): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot send reference face - not connected');
      return;
    }
    console.log('[SocketService] Sending reference face (length:', imageBase64.length, ')');
    this.socket.emit('face:reference', { imageBase64 });
  }

  // Send face verification image
  sendFaceVerification(imageBase64: string): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot send verification - not connected');
      return;
    }
    console.log('[SocketService] Sending face verification');
    this.socket.emit('face:verify', { imageBase64 });
  }

  // Send face tracking event (security-relevant events)
  sendFaceTrackingEvent(event: FaceTrackingEventPayload): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot send tracking event - not connected');
      return;
    }
    console.log('[SocketService] 📡 Sending face tracking event:', event.type, event.message);
    this.socket.emit('face:tracking', event);
  }

  // Send client event (copy/paste, tab switch, etc.)
  sendClientEvent(event: ClientEventPayload): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot send client event - not connected');
      return;
    }
    console.log('[SocketService] 📡 Sending client event:', event.type, event.message);
    this.socket.emit('client:event', event);
  }

  // Send keystroke batch
  sendKeystrokeBatch(batch: KeystrokeBatchPayload): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot send keystroke batch - not connected');
      return;
    }
    console.log(`[SocketService] ⌨️ Sending keystroke batch #${batch.batchIndex} (${batch.keystrokes.length} keystrokes)`);
    this.socket.emit('keystroke:batch', batch);
  }

  // ============================================================================
  // Video Recording Events
  // ============================================================================

  // Start video recording
  sendVideoStart(): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot start video - not connected');
      return;
    }
    console.log('[SocketService] 🎥 Starting video recording');
    this.socket.emit('video:start');
  }

  // Request presigned URL for chunk upload
  sendVideoUrlRequest(chunkIndex: number): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot request video URL - not connected');
      return;
    }
    console.log(`[SocketService] 🎥 Requesting URL for chunk ${chunkIndex}`);
    this.socket.emit('video:request-url', { chunkIndex });
  }

  // Notify server that chunk was uploaded
  sendVideoChunkUploaded(chunkIndex: number, s3Key: string, size: number): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot confirm chunk upload - not connected');
      return;
    }
    console.log(`[SocketService] 🎥 Chunk ${chunkIndex} uploaded`);
    this.socket.emit('video:chunk-uploaded', { chunkIndex, s3Key, size });
  }

  // Report video error
  sendVideoError(chunkIndex: number, error: string): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot report video error - not connected');
      return;
    }
    console.log(`[SocketService] 🎥 Video error for chunk ${chunkIndex}: ${error}`);
    this.socket.emit('video:error', { chunkIndex, error });
  }

  // Stop video recording
  sendVideoStop(): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot stop video - not connected');
      return;
    }
    console.log('[SocketService] 🎥 Stopping video recording');
    this.socket.emit('video:stop');
  }

  // Get video recording status
  sendVideoGetStatus(): void {
    if (!this.socket?.connected) {
      console.error('[SocketService] Cannot get video status - not connected');
      return;
    }
    console.log('[SocketService] 🎥 Getting video status');
    this.socket.emit('video:get-status');
  }

  // Video event listeners
  onVideoStarted(callback: (event: VideoStartedEvent) => void): void {
    this.socket?.on('video:started', callback);
  }

  onVideoUrl(callback: (event: VideoUrlEvent) => void): void {
    this.socket?.on('video:url', callback);
  }

  onVideoUrlError(callback: (event: VideoUrlErrorEvent) => void): void {
    this.socket?.on('video:url-error', callback);
  }

  onVideoChunkConfirmed(callback: (event: VideoChunkConfirmedEvent) => void): void {
    this.socket?.on('video:chunk-confirmed', callback);
  }

  onVideoStopped(callback: (event: VideoStoppedEvent) => void): void {
    this.socket?.on('video:stopped', callback);
  }

  onVideoStatus(callback: (event: VideoStatusEvent) => void): void {
    this.socket?.on('video:status', callback);
  }

  onVideoError(callback: (event: VideoErrorEvent) => void): void {
    this.socket?.on('video:error', callback);
  }

  // Remove video event listeners
  offVideoStarted(callback?: (event: VideoStartedEvent) => void): void {
    if (callback) {
      this.socket?.off('video:started', callback);
    } else {
      this.socket?.off('video:started');
    }
  }

  offVideoUrl(callback?: (event: VideoUrlEvent) => void): void {
    if (callback) {
      this.socket?.off('video:url', callback);
    } else {
      this.socket?.off('video:url');
    }
  }

  offVideoUrlError(callback?: (event: VideoUrlErrorEvent) => void): void {
    if (callback) {
      this.socket?.off('video:url-error', callback);
    } else {
      this.socket?.off('video:url-error');
    }
  }

  offVideoChunkConfirmed(callback?: (event: VideoChunkConfirmedEvent) => void): void {
    if (callback) {
      this.socket?.off('video:chunk-confirmed', callback);
    } else {
      this.socket?.off('video:chunk-confirmed');
    }
  }

  offVideoStopped(callback?: (event: VideoStoppedEvent) => void): void {
    if (callback) {
      this.socket?.off('video:stopped', callback);
    } else {
      this.socket?.off('video:stopped');
    }
  }

  offVideoStatus(callback?: (event: VideoStatusEvent) => void): void {
    if (callback) {
      this.socket?.off('video:status', callback);
    } else {
      this.socket?.off('video:status');
    }
  }

  offVideoError(callback?: (event: VideoErrorEvent) => void): void {
    if (callback) {
      this.socket?.off('video:error', callback);
    } else {
      this.socket?.off('video:error');
    }
  }
}

// Export singleton instance
export const socketService = new SocketService();
