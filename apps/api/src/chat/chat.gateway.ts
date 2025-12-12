import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService, ChatMessage } from './chat.service';
import { FaceService } from '../face/face.service';
import { SessionService } from '../session/session.service';
import { KeystrokeService } from '../keystroke/keystroke.service';
import { S3Service } from '../s3/s3.service';
import {
  FaceTrackingEventPayload,
  FaceTrackingEventType,
  ClientEventPayload,
  ClientEventType,
  KeystrokeBatchPayload,
} from '@sec-flags/shared';
import { EventType, ChatEventData } from '../session/session-event.schema';

interface MessagePayload {
  content: string;
}

interface FaceReferencePayload {
  imageBase64: string;
}

interface FaceVerifyPayload {
  imageBase64: string;
}

interface VideoUrlRequestPayload {
  chunkIndex: number;
}

interface VideoChunkUploadedPayload {
  chunkIndex: number;
  s3Key: string;
  size?: number;
}

interface VideoErrorPayload {
  chunkIndex: number;
  error: string;
}

// Warning event types that require immediate attention
const WARNING_EVENT_TYPES: FaceTrackingEventType[] = [
  'face_away',
  'face_not_detected',
  'looking_away',
  'talking',
  'eyes_closed_extended',
  'excessive_blinking',
  'squinting_detected',
  'head_movement_excessive',
  'head_tilted',
  'expression_confused',
  'lip_reading_detected',
  'tab_switched_away',
  'window_blur',
  'multiple_faces_detected',
];

@WebSocketGateway({
  cors: {
    origin: '*', // In production, specify allowed origins
    methods: ['GET', 'POST'],
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly faceService: FaceService,
    private readonly sessionService: SessionService,
    private readonly keystrokeService: KeystrokeService,
    private readonly s3Service: S3Service
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`=== Client connected: ${client.id} ===`);

    // Create a new chat session for this client
    const chatSession = this.chatService.createSession(client.id);
    this.logger.log(`Chat session created: ${chatSession.id}`);

    // Create a database session for persistence
    try {
      await this.sessionService.createSession(chatSession.id, client.id);
      this.logger.log(`DB session created: ${chatSession.id}`);
    } catch (error) {
      this.logger.error(`Failed to create DB session: ${error.message}`);
    }

    // Send session info and face verification config to client
    const sessionData = {
      sessionId: chatSession.id,
      createdAt: chatSession.createdAt,
      faceVerification: {
        enabled: true,
        checkIntervalMs: this.faceService.checkIntervalMs,
        confidenceThreshold: this.faceService.confidenceThreshold,
      },
    };
    this.logger.log(`Emitting session event: ${JSON.stringify(sessionData)}`);
    client.emit('session', sessionData);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Clean up in-memory sessions
    this.chatService.removeSession(client.id);
    this.faceService.removeSession(client.id);

    // Note: We intentionally do NOT delete the DB session on disconnect
    // to preserve the session history for auditing/analytics
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessagePayload
  ): Promise<void> {
    this.logger.log(`Message from ${client.id}: ${payload.content}`);

    const chatSession = this.chatService.getSession(client.id);
    this.logger.log(
      `[Chat] Session lookup for client ${client.id}: ${
        chatSession ? chatSession.id : 'NOT FOUND'
      }`
    );

    try {
      // Log USER_RESPONDED event
      if (chatSession) {
        const userEventData: ChatEventData = {
          message: 'User sent a message',
          role: 'user',
          contentPreview: payload.content.substring(0, 100),
          contentLength: payload.content.length,
        };
        await this.sessionService.logEvent(
          chatSession.id,
          EventType.USER_RESPONDED,
          userEventData
        );
        this.logger.log(
          `[Chat] USER_RESPONDED event logged for session ${chatSession.id}`
        );
      } else {
        this.logger.warn(
          `[Chat] Cannot log USER_RESPONDED - no session found for client ${client.id}`
        );
      }

      // Process the message and get response
      const response: ChatMessage = await this.chatService.processMessage(
        client.id,
        payload.content
      );

      // Log AI_RESPONDED event
      if (chatSession) {
        const aiEventData: ChatEventData = {
          message: 'AI generated a response',
          role: 'assistant',
          contentPreview: response.content.substring(0, 100),
          contentLength: response.content.length,
        };
        await this.sessionService.logEvent(
          chatSession.id,
          EventType.AI_RESPONDED,
          aiEventData
        );
        this.logger.log(
          `[Chat] AI_RESPONDED event logged for session ${chatSession.id}`
        );
      } else {
        this.logger.warn(
          `[Chat] Cannot log AI_RESPONDED - no session found for client ${client.id}`
        );
      }

      // Send response back to client
      client.emit('response', {
        message: response,
      });
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`);

      // Send error to client
      client.emit('error', {
        message: 'Failed to process message. Please try again.',
      });
    }
  }

  @SubscribeMessage('face:reference')
  async handleFaceReference(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: FaceReferencePayload
  ): Promise<void> {
    this.logger.log(`=== Face reference received from ${client.id} ===`);
    this.logger.log(`Payload length: ${payload?.imageBase64?.length || 0}`);

    try {
      // Store the reference face in memory
      const faceSession = this.faceService.storeReferenceFace(
        client.id,
        payload.imageBase64
      );
      this.logger.log(
        `Face stored successfully for session: ${faceSession.clientId}`
      );

      // Store the initial face image in the database
      const chatSession = this.chatService.getSession(client.id);
      if (chatSession) {
        const faceImageBuffer = Buffer.from(
          payload.imageBase64.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
        await this.sessionService.updateFaceImage(
          chatSession.id,
          faceImageBuffer
        );
        this.logger.log(
          `Face image persisted to DB for session: ${chatSession.id}`
        );
      }

      // Confirm to client
      const response = {
        success: true,
        message: 'Reference face stored successfully',
        createdAt: faceSession.createdAt,
      };
      this.logger.log(
        `Emitting face:reference:stored: ${JSON.stringify(response)}`
      );
      client.emit('face:reference:stored', response);
    } catch (error) {
      this.logger.error(`Error storing reference face: ${error.message}`);

      client.emit('face:reference:stored', {
        success: false,
        message: 'Failed to store reference face',
      });
    }
  }

  @SubscribeMessage('face:verify')
  async handleFaceVerify(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: FaceVerifyPayload
  ): Promise<void> {
    this.logger.log(`Face verification request from ${client.id}`);

    try {
      const result = await this.faceService.verifyFace(
        client.id,
        payload.imageBase64
      );

      // Log the face recognition event to the database
      const chatSession = this.chatService.getSession(client.id);
      if (chatSession && result.rawResult) {
        await this.sessionService.logFaceRecognitionEvent(
          chatSession.id,
          result.confidence,
          result.isMatch,
          result.rawResult as unknown as Record<string, unknown>,
          result.message
        );
      }

      if (result.isMatch) {
        // Face verified successfully
        client.emit('face:result', {
          success: true,
          confidence: result.confidence,
          message: result.message,
        });
      } else {
        // Face verification failed
        const session = this.faceService.getSession(client.id);
        const maxRetries = 2;

        if (session && session.failedAttempts >= maxRetries) {
          // Too many failed attempts - notify client to disconnect
          client.emit('face:failed', {
            success: false,
            confidence: result.confidence,
            message:
              'Face verification failed. Session terminated for security.',
            shouldDisconnect: true,
          });

          // Disconnect the client after a short delay
          setTimeout(() => {
            client.disconnect(true);
          }, 1000);
        } else {
          // Still have retries left
          client.emit('face:result', {
            success: false,
            confidence: result.confidence,
            message: result.message,
            retriesLeft: maxRetries - (session?.failedAttempts || 0),
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error verifying face: ${error.message}`);

      client.emit('face:result', {
        success: false,
        confidence: 0,
        message: 'Face verification error. Please try again.',
      });
    }
  }

  @SubscribeMessage('face:tracking')
  async handleFaceTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: FaceTrackingEventPayload
  ): Promise<void> {
    const timestamp = new Date(payload.timestamp).toISOString();
    const isWarning = WARNING_EVENT_TYPES.includes(payload.type);

    // Log to console
    this.logTrackingEvent(client.id, payload, isWarning, timestamp);

    // Persist to MongoDB
    try {
      const chatSession = this.chatService.getSession(client.id);
      if (chatSession) {
        await this.sessionService.logFaceTrackingEvent(chatSession.id, payload);
        this.logger.debug(
          `[FaceTracking] Event persisted to DB: ${payload.type}`
        );
      } else {
        this.logger.warn(
          `[FaceTracking] No session found for client ${client.id}, event not persisted`
        );
      }
    } catch (error) {
      this.logger.error(
        `[FaceTracking] Failed to persist event: ${error.message}`
      );
    }
  }

  /**
   * Log tracking event to console with formatted output
   */
  private logTrackingEvent(
    clientId: string,
    payload: FaceTrackingEventPayload,
    isWarning: boolean,
    timestamp: string
  ): void {
    // Format the log message based on event type
    let logMessage = '';
    const icon = isWarning ? '⚠️' : '✓';

    switch (payload.type) {
      // Face Position
      case 'face_away':
        logMessage = `${icon} FACE AWAY - ${payload.details}`;
        break;
      case 'face_returned':
        logMessage = `${icon} Face returned to screen`;
        break;
      case 'face_not_detected':
        logMessage = `${icon} FACE NOT DETECTED - No face visible`;
        break;
      case 'face_detected':
        logMessage = `${icon} Face detected`;
        break;

      // Gaze
      case 'looking_away':
        logMessage = `${icon} LOOKING AWAY - Gaze: ${payload.data?.gazeDirection}`;
        break;
      case 'looking_back':
        logMessage = `${icon} Eyes returned to screen`;
        break;

      // Eye State
      case 'eyes_closed_extended':
        logMessage = `${icon} EYES CLOSED - Duration: ${payload.data?.eyeClosureDuration?.toFixed(
          1
        )}s`;
        break;
      case 'eyes_opened':
        logMessage = `${icon} Eyes opened`;
        break;
      case 'excessive_blinking':
        logMessage = `${icon} EXCESSIVE BLINKING - Rate: ${payload.data?.blinkRate} blinks/min`;
        break;
      case 'squinting_detected':
        logMessage = `${icon} SQUINTING - L:${payload.data?.squintLevel?.left}% R:${payload.data?.squintLevel?.right}%`;
        break;

      // Speaking
      case 'talking':
        logMessage = `${icon} TALKING DETECTED - Mouth: ${payload.data?.mouthOpenness}% open`;
        break;
      case 'stopped_talking':
        logMessage = `${icon} Stopped talking`;
        break;

      // Head Movement
      case 'head_movement_excessive':
        logMessage = `${icon} EXCESSIVE HEAD MOVEMENT - ${payload.data?.headMovementCount} movements`;
        break;
      case 'head_tilted':
        logMessage = `${icon} HEAD TILTED - Roll: ${payload.data?.headPose?.roll}°`;
        break;
      case 'head_position_normal':
        logMessage = `${icon} Head position normal`;
        break;

      // Expression
      case 'expression_confused':
        logMessage = `${icon} CONFUSED EXPRESSION detected`;
        break;
      case 'lip_reading_detected':
        logMessage = `${icon} LIP READING - Movement: ${payload.data?.lipMovement}%`;
        break;

      // Browser/Session
      case 'tab_switched_away':
        logMessage = `${icon} TAB SWITCHED AWAY - User left the tab`;
        break;
      case 'tab_returned':
        logMessage = `${icon} Tab returned`;
        break;
      case 'window_blur':
        logMessage = `${icon} WINDOW BLUR - Lost focus`;
        break;
      case 'window_focus':
        logMessage = `${icon} Window focus regained`;
        break;
      case 'multiple_faces_detected':
        logMessage = `${icon} MULTIPLE FACES - ${payload.data?.faceCount} faces detected`;
        break;

      default:
        logMessage = `${icon} ${payload.message}`;
    }

    // Log based on severity
    if (isWarning) {
      this.logger.warn(
        `[FaceTracking] Client ${clientId} | ${timestamp} | ${logMessage}`
      );
    } else {
      this.logger.log(
        `[FaceTracking] Client ${clientId} | ${timestamp} | ${logMessage}`
      );
    }

    // Log detailed data for warnings
    if (isWarning && payload.data) {
      this.logger.debug(
        `[FaceTracking] Details: ${JSON.stringify(payload.data)}`
      );
    }
  }

  @SubscribeMessage('client:event')
  async handleClientEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ClientEventPayload
  ): Promise<void> {
    const timestamp = new Date(payload.timestamp).toISOString();
    const isWarning =
      payload.severity === 'warning' || payload.severity === 'critical';

    // Log to console
    this.logClientEvent(client.id, payload, isWarning, timestamp);

    // Persist to MongoDB
    try {
      const chatSession = this.chatService.getSession(client.id);
      if (chatSession) {
        await this.sessionService.logClientEvent(chatSession.id, payload);
        this.logger.debug(
          `[ClientEvent] Event persisted to DB: ${payload.type}`
        );
      } else {
        this.logger.warn(
          `[ClientEvent] No session found for client ${client.id}, event not persisted`
        );
      }
    } catch (error) {
      this.logger.error(
        `[ClientEvent] Failed to persist event: ${error.message}`
      );
    }
  }

  /**
   * Log client event to console with formatted output
   */
  private logClientEvent(
    clientId: string,
    payload: ClientEventPayload,
    isWarning: boolean,
    timestamp: string
  ): void {
    let logMessage = '';
    const icon = isWarning ? '⚠️' : 'ℹ️';

    switch (payload.type) {
      // Clipboard
      case ClientEventType.CLIPBOARD_COPY:
        logMessage = `${icon} COPY - ${
          payload.data?.clipboardLength || 0
        } chars`;
        break;
      case ClientEventType.CLIPBOARD_PASTE:
        logMessage = `${icon} PASTE - ${
          payload.data?.clipboardLength || 0
        } chars`;
        break;
      case ClientEventType.CLIPBOARD_CUT:
        logMessage = `${icon} CUT - ${
          payload.data?.clipboardLength || 0
        } chars`;
        break;

      // Visibility
      case ClientEventType.TAB_HIDDEN:
        logMessage = `${icon} TAB HIDDEN - User switched away`;
        break;
      case ClientEventType.TAB_VISIBLE:
        logMessage = `${icon} Tab visible - User returned (hidden for ${
          payload.data?.hiddenDuration || 0
        }ms)`;
        break;
      case ClientEventType.WINDOW_BLUR:
        logMessage = `${icon} WINDOW BLUR - Lost focus`;
        break;
      case ClientEventType.WINDOW_FOCUS:
        logMessage = `${icon} Window focus - Regained`;
        break;

      // Keyboard
      case ClientEventType.DEVTOOLS_OPENED:
        logMessage = `${icon} DEVTOOLS OPENED - ${payload.details}`;
        break;
      case ClientEventType.PRINT_SCREEN:
        logMessage = `${icon} PRINT SCREEN - Screenshot attempted`;
        break;

      // Context
      case ClientEventType.CONTEXT_MENU:
        logMessage = `${icon} Context menu opened`;
        break;

      // Window
      case ClientEventType.FULLSCREEN_EXIT:
        logMessage = `${icon} FULLSCREEN EXIT`;
        break;
      case ClientEventType.WINDOW_RESIZE:
        logMessage = `${icon} Window resized to ${payload.data?.windowWidth}x${payload.data?.windowHeight}`;
        break;

      default:
        logMessage = `${icon} ${payload.message}`;
    }

    // Log based on severity
    if (isWarning) {
      this.logger.warn(
        `[ClientEvent] Client ${clientId} | ${timestamp} | ${logMessage}`
      );
    } else {
      this.logger.log(
        `[ClientEvent] Client ${clientId} | ${timestamp} | ${logMessage}`
      );
    }

    // Log detailed data for warnings
    if (isWarning && payload.data) {
      this.logger.debug(
        `[ClientEvent] Details: ${JSON.stringify(payload.data)}`
      );
    }
  }

  @SubscribeMessage('keystroke:batch')
  async handleKeystrokeBatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: KeystrokeBatchPayload
  ): Promise<void> {
    const chatSession = this.chatService.getSession(client.id);

    if (!chatSession) {
      this.logger.warn(`[Keystroke] No session found for client ${client.id}`);
      return;
    }

    // Override sessionId with server-side session ID for security
    const batchPayload = {
      ...payload,
      sessionId: chatSession.id,
    };

    try {
      await this.keystrokeService.saveBatch(batchPayload);
      this.logger.log(
        `[Keystroke] Batch #${payload.batchIndex} saved for session ${chatSession.id} (${payload.keystrokes.length} keystrokes)`
      );
    } catch (error) {
      this.logger.error(`[Keystroke] Failed to save batch: ${error.message}`);
    }
  }

  // ============================================================================
  // Video Recording Handlers
  // ============================================================================

  @SubscribeMessage('video:start')
  async handleVideoStart(@ConnectedSocket() client: Socket): Promise<void> {
    const chatSession = this.chatService.getSession(client.id);

    if (!chatSession) {
      this.logger.warn(`[Video] No session found for client ${client.id}`);
      client.emit('video:error', { error: 'No session found' });
      return;
    }

    try {
      await this.sessionService.startVideoRecording(chatSession.id);
      this.logger.log(
        `[Video] Recording started for session ${chatSession.id}`
      );
      client.emit('video:started', { sessionId: chatSession.id });
    } catch (error) {
      this.logger.error(`[Video] Failed to start recording: ${error.message}`);
      client.emit('video:error', { error: 'Failed to start recording' });
    }
  }

  @SubscribeMessage('video:request-url')
  async handleVideoUrlRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VideoUrlRequestPayload
  ): Promise<void> {
    const chatSession = this.chatService.getSession(client.id);

    if (!chatSession) {
      this.logger.warn(`[Video] No session found for client ${client.id}`);
      client.emit('video:url-error', {
        chunkIndex: payload.chunkIndex,
        error: 'No session found',
      });
      return;
    }

    try {
      const { url, s3Key, expiresIn } = await this.s3Service.generateUploadUrl(
        chatSession.id,
        payload.chunkIndex
      );

      this.logger.log(
        `[Video] Generated presigned URL for session ${chatSession.id}, chunk ${payload.chunkIndex}`
      );

      client.emit('video:url', {
        chunkIndex: payload.chunkIndex,
        url,
        s3Key,
        expiresIn,
      });
    } catch (error) {
      this.logger.error(`[Video] Failed to generate URL: ${error.message}`);
      client.emit('video:url-error', {
        chunkIndex: payload.chunkIndex,
        error: 'Failed to generate upload URL',
      });
    }
  }

  @SubscribeMessage('video:chunk-uploaded')
  async handleVideoChunkUploaded(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VideoChunkUploadedPayload
  ): Promise<void> {
    const chatSession = this.chatService.getSession(client.id);

    if (!chatSession) {
      this.logger.warn(`[Video] No session found for client ${client.id}`);
      return;
    }

    try {
      await this.sessionService.addVideoChunk(chatSession.id, {
        index: payload.chunkIndex,
        s3Key: payload.s3Key,
        size: payload.size,
      });

      this.logger.log(
        `[Video] Chunk ${payload.chunkIndex} uploaded for session ${chatSession.id}`
      );

      client.emit('video:chunk-confirmed', {
        chunkIndex: payload.chunkIndex,
      });
    } catch (error) {
      this.logger.error(`[Video] Failed to record chunk: ${error.message}`);
    }
  }

  @SubscribeMessage('video:error')
  async handleVideoError(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: VideoErrorPayload
  ): Promise<void> {
    const chatSession = this.chatService.getSession(client.id);

    if (!chatSession) {
      return;
    }

    this.logger.warn(
      `[Video] Error for session ${chatSession.id}, chunk ${payload.chunkIndex}: ${payload.error}`
    );
  }

  @SubscribeMessage('video:stop')
  async handleVideoStop(@ConnectedSocket() client: Socket): Promise<void> {
    const chatSession = this.chatService.getSession(client.id);

    if (!chatSession) {
      this.logger.warn(`[Video] No session found for client ${client.id}`);
      return;
    }

    try {
      await this.sessionService.completeVideoRecording(chatSession.id);
      this.logger.log(
        `[Video] Recording stopped for session ${chatSession.id}`
      );
      client.emit('video:stopped', { sessionId: chatSession.id });
    } catch (error) {
      this.logger.error(`[Video] Failed to stop recording: ${error.message}`);
    }
  }

  @SubscribeMessage('video:get-status')
  async handleVideoGetStatus(@ConnectedSocket() client: Socket): Promise<void> {
    const chatSession = this.chatService.getSession(client.id);

    if (!chatSession) {
      this.logger.warn(`[Video] No session found for client ${client.id}`);
      client.emit('video:status', { status: 'idle', chunkCount: 0 });
      return;
    }

    try {
      const status = await this.sessionService.getVideoStatus(chatSession.id);
      const lastChunkIndex = await this.sessionService.getLastChunkIndex(
        chatSession.id
      );

      client.emit('video:status', {
        ...status,
        lastChunkIndex,
      });
    } catch (error) {
      this.logger.error(`[Video] Failed to get status: ${error.message}`);
      client.emit('video:status', { status: 'idle', chunkCount: 0 });
    }
  }
}
