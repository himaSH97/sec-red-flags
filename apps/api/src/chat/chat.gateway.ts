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
import { FaceTrackingEventPayload } from '@sec-flags/shared';

interface MessagePayload {
  content: string;
}

interface FaceReferencePayload {
  imageBase64: string;
}

interface FaceVerifyPayload {
  imageBase64: string;
}

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
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`=== Client connected: ${client.id} ===`);
    
    // Create a new chat session for this client
    const session = this.chatService.createSession(client.id);
    this.logger.log(`Session created: ${session.id}`);
    
    // Send session info and face verification config to client
    const sessionData = {
      sessionId: session.id,
      createdAt: session.createdAt,
      faceVerification: {
        checkIntervalMs: this.faceService.checkIntervalMs,
        confidenceThreshold: this.faceService.confidenceThreshold,
      },
    };
    this.logger.log(`Emitting session event: ${JSON.stringify(sessionData)}`);
    client.emit('session', sessionData);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Clean up sessions
    this.chatService.removeSession(client.id);
    this.faceService.removeSession(client.id);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessagePayload,
  ): Promise<void> {
    this.logger.log(`Message from ${client.id}: ${payload.content}`);

    try {
      // Process the message and get response
      const response: ChatMessage = await this.chatService.processMessage(
        client.id,
        payload.content,
      );

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
    @MessageBody() payload: FaceReferencePayload,
  ): Promise<void> {
    this.logger.log(`=== Face reference received from ${client.id} ===`);
    this.logger.log(`Payload length: ${payload?.imageBase64?.length || 0}`);

    try {
      // Store the reference face
      const session = this.faceService.storeReferenceFace(
        client.id,
        payload.imageBase64,
      );
      this.logger.log(`Face stored successfully for session: ${session.clientId}`);

      // Confirm to client
      const response = {
        success: true,
        message: 'Reference face stored successfully',
        createdAt: session.createdAt,
      };
      this.logger.log(`Emitting face:reference:stored: ${JSON.stringify(response)}`);
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
    @MessageBody() payload: FaceVerifyPayload,
  ): Promise<void> {
    this.logger.log(`Face verification request from ${client.id}`);

    try {
      const result = await this.faceService.verifyFace(
        client.id,
        payload.imageBase64,
      );

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
            message: 'Face verification failed. Session terminated for security.',
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
  handleFaceTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: FaceTrackingEventPayload,
  ): void {
    const timestamp = new Date(payload.timestamp).toISOString();
    const isWarning = ['face_away', 'looking_away', 'talking'].includes(payload.type);
    
    // Format the log message based on event type
    let logMessage = '';
    const icon = isWarning ? '⚠️' : '✓';
    
    switch (payload.type) {
      case 'face_away':
        logMessage = `${icon} FACE AWAY - ${payload.details}`;
        break;
      case 'face_returned':
        logMessage = `${icon} Face returned to screen`;
        break;
      case 'looking_away':
        logMessage = `${icon} LOOKING AWAY - Gaze: ${payload.data?.gazeDirection}`;
        break;
      case 'looking_back':
        logMessage = `${icon} Eyes returned to screen`;
        break;
      case 'talking':
        logMessage = `${icon} TALKING DETECTED - Mouth: ${payload.data?.mouthOpenness}% open`;
        break;
      case 'stopped_talking':
        logMessage = `${icon} Stopped talking`;
        break;
      default:
        logMessage = `${icon} ${payload.message}`;
    }

    // Log with full context
    if (isWarning) {
      this.logger.warn(
        `[FaceTracking] Client ${client.id} | ${timestamp} | ${logMessage}`,
      );
    } else {
      this.logger.log(
        `[FaceTracking] Client ${client.id} | ${timestamp} | ${logMessage}`,
      );
    }

    // Log additional data for debugging if present
    if (payload.data && isWarning) {
      this.logger.debug(
        `[FaceTracking] Data: ${JSON.stringify(payload.data)}`,
      );
    }
  }
}
