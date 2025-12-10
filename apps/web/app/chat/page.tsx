'use client';

import { useState, useRef, useEffect, FormEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  socketService,
  Message,
  ChatResponse,
  ChatError,
  FaceVerifyResult,
  FaceVerifyFailed,
  SessionInfo,
} from '@/lib/socket';
import {
  faceTrackingService,
  FaceTrackingData,
  ExtendedTrackingMetrics,
} from '@/lib/face-tracking';
import { clientEventsService } from '@/lib/client-events';
import {
  FaceTrackingEventPayload,
  FaceTrackingEventType,
  TrackingEvent,
  TrackingEventSeverity,
  ClientEvent,
  ClientEventType,
} from '@sec-flags/shared';
import {
  ArrowLeft,
  Send,
  Loader2,
  User,
  Bot,
  Wifi,
  WifiOff,
  ShieldCheck,
  ShieldAlert,
  Camera,
  Eye,
  EyeOff,
  Activity,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type VerificationStatus = 'pending' | 'verified' | 'failed' | 'checking';

// Helper to format time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>('pending');
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [isInitializing, setIsInitializing] = useState(true);
  const [trackingData, setTrackingData] = useState<FaceTrackingData | null>(null);
  const [extendedMetrics, setExtendedMetrics] = useState<ExtendedTrackingMetrics | null>(null);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(true);
  const [isTrackingReady, setIsTrackingReady] = useState(false);
  const [showTrackingDebug, setShowTrackingDebug] = useState(true);
  const [showEventLog, setShowEventLog] = useState(true);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const verificationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false); // Track if we've already initialized
  const isCleaningUpRef = useRef(false); // Track if cleanup is intentional
  
  // Refs for tracking significant state changes
  const prevTrackingDataRef = useRef<FaceTrackingData | null>(null);
  const wasFaceAwayRef = useRef(false);
  const wasFaceNotDetectedRef = useRef(false);
  const wasLookingAwayRef = useRef(false);
  const wasTalkingRef = useRef(false);
  const wasEyesClosedExtendedRef = useRef(false);
  const wasSquintingRef = useRef(false);
  const wasExcessiveBlinkingRef = useRef(false);
  const wasHeadTiltedRef = useRef(false);
  const wasExcessiveHeadMovementRef = useRef(false);
  const wasConfusedRef = useRef(false);
  const wasLipReadingRef = useRef(false);
  const wasMultipleFacesRef = useRef(false);
  const wasTabHiddenRef = useRef(false);
  const wasWindowBlurredRef = useRef(false);
  
  // Ref to hold addTrackingEvent for use in useEffect callbacks
  const addTrackingEventRef = useRef<(
    type: FaceTrackingEventType,
    message: string,
    severity?: TrackingEventSeverity,
    details?: string
  ) => void>(() => {});

  // Capture face from video stream
  const captureFace = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.readyState < 2) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  // Perform periodic face verification
  const performVerification = useCallback(() => {
    const imageBase64 = captureFace();

    if (imageBase64 && socketService.isConnected()) {
      setVerificationStatus('checking');

      // Log verification started to event log
      addTrackingEventRef.current(
        'verification_started',
        'Face Verification Started',
        'info',
        'Periodic security check in progress'
      );

      socketService.sendFaceVerification(imageBase64);

      // Log current tracking status during verification
      if (videoRef.current && faceTrackingService.isReady()) {
        const currentTrackingData = faceTrackingService.processFrame(videoRef.current);
        if (currentTrackingData) {
          const isFaceAway = !currentTrackingData.faceDetected || Math.abs(currentTrackingData.headPose.yaw) > 40;
          const isLookingAway = currentTrackingData.eyes.gazeDirection !== 'CENTER';
          const isTalking = currentTrackingData.expression.mouthOpen > 30;
          
          console.log('=== PERIODIC CHECK ===');
          console.log(`Face: ${isFaceAway ? '⚠️ AWAY' : '✓ Facing screen'}`);
          console.log(`Gaze: ${isLookingAway ? `⚠️ Looking ${currentTrackingData.eyes.gazeDirection}` : '✓ Looking at screen'}`);
          console.log(`Talking: ${isTalking ? `⚠️ Mouth open (${currentTrackingData.expression.mouthOpen}%)` : '✓ Silent'}`);
          console.log('======================');
        }
      }
    }
  }, [captureFace]);

  // Start camera for periodic verification
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Failed to start camera for verification:', error);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // End session - cleanup and redirect to session page
  const endSession = useCallback(() => {
    console.log('[ChatPage] Ending session...');
    
    // Mark as intentional cleanup
    isCleaningUpRef.current = true;
    
    // Clear verification interval
    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
      verificationIntervalRef.current = null;
    }
    
    // Clear face tracking interval
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    
    // Destroy face tracking service
    faceTrackingService.destroy();
    
    // Cleanup client events service
    clientEventsService.cleanup();
    
    // Disconnect socket
    socketService.disconnect();
    
    // Clear session storage
    sessionStorage.removeItem('referenceFace');
    
    // Redirect to session page
    if (sessionId) {
      router.push(`/sessions/${sessionId}`);
    } else {
      router.push('/sessions');
    }
  }, [sessionId, router]);

  // Add a tracking event to the log
  const addTrackingEvent = useCallback(
    (
      type: FaceTrackingEventType,
      message: string,
      severity: TrackingEventSeverity = 'info',
      details?: string
    ) => {
      const event: TrackingEvent = {
        id: `${type}-${Date.now()}`,
        type,
        timestamp: new Date(),
        message,
        details,
        severity,
      };

      setTrackingEvents((prev) => {
        // Keep only last 100 events
        const newEvents = [event, ...prev].slice(0, 100);
        return newEvents;
      });
    },
    []
  );
  
  // Update ref whenever addTrackingEvent changes
  useEffect(() => {
    addTrackingEventRef.current = addTrackingEvent;
  }, [addTrackingEvent]);

  // Send tracking event to backend
  const sendTrackingEventToBackend = useCallback(
    (
      type: FaceTrackingEventType,
      message: string,
      details: string,
      data: FaceTrackingData,
      extendedData?: ExtendedTrackingMetrics
    ) => {
      console.log('[ChatPage] Attempting to send tracking event:', type);
      
      if (!socketService.isConnected()) {
        console.warn('[ChatPage] Socket not connected, cannot send tracking event');
        return;
      }

      const payload: FaceTrackingEventPayload = {
        type,
        timestamp: Date.now(),
        message,
        details,
        data: {
          headPose: data.headPose,
          gazeDirection: data.eyes.gazeDirection,
          mouthOpenness: data.expression.mouthOpen,
          faceDetected: data.faceDetected,
          faceCount: data.faceCount,
          eyeOpenness: {
            left: data.eyes.leftEyeOpenness,
            right: data.eyes.rightEyeOpenness,
          },
          squintLevel: data.eyes.leftSquint !== undefined ? {
            left: data.eyes.leftSquint,
            right: data.eyes.rightSquint || 0,
          } : undefined,
          blinkRate: extendedData?.blinkRate,
          eyeClosureDuration: extendedData?.eyeClosureDuration,
          headMovementCount: extendedData?.headMovementCount,
          browDown: data.expression.browDown,
          lipMovement: data.expression.lipMovement,
        },
      };

      console.log('[ChatPage] Sending tracking event to backend:', payload);
      socketService.sendFaceTrackingEvent(payload);
    },
    []
  );

  // Process face tracking frame - detect security-relevant events
  const processFaceTracking = useCallback(() => {
    if (!videoRef.current || !isTrackingEnabled) {
      return;
    }

    const data = faceTrackingService.processFrame(videoRef.current);
    if (!data) {
      return;
    }

    // Get extended metrics
    const metrics = faceTrackingService.getExtendedMetrics(data);

    // === FACE DETECTION ===
    const isFaceNotDetected = !data.faceDetected;
    if (isFaceNotDetected && !wasFaceNotDetectedRef.current) {
      addTrackingEvent('face_not_detected', 'Face Not Detected', 'warning', 'No face visible in frame');
      sendTrackingEventToBackend('face_not_detected', 'Face Not Detected', 'No face visible in frame', data, metrics);
      console.log('[ALERT] Face not detected');
    } else if (!isFaceNotDetected && wasFaceNotDetectedRef.current) {
      addTrackingEvent('face_detected', 'Face Detected', 'success', 'Face is now visible');
      sendTrackingEventToBackend('face_detected', 'Face Detected', 'Face is now visible', data, metrics);
      console.log('[OK] Face detected');
    }
    wasFaceNotDetectedRef.current = isFaceNotDetected;

    // === FACE TURNED AWAY (head pose) ===
    if (data.faceDetected) {
      const isFaceAway = Math.abs(data.headPose.yaw) > 40 || Math.abs(data.headPose.pitch) > 35;
      
      if (isFaceAway && !wasFaceAwayRef.current) {
        const details = `Head angle: yaw=${data.headPose.yaw}° pitch=${data.headPose.pitch}°`;
        addTrackingEvent('face_away', 'Face Turned Away', 'warning', details);
        sendTrackingEventToBackend('face_away', 'Face Turned Away', details, data, metrics);
        console.log('[ALERT] Face turned away from screen');
      } else if (!isFaceAway && wasFaceAwayRef.current) {
        addTrackingEvent('face_returned', 'Face Returned to Screen', 'success', 'User is facing the screen again');
        sendTrackingEventToBackend('face_returned', 'Face Returned to Screen', 'User is facing the screen again', data, metrics);
        console.log('[OK] Face returned to screen');
      }
      wasFaceAwayRef.current = isFaceAway;

      // === GAZE DIRECTION ===
      const isLookingAway = data.eyes.gazeDirection !== 'CENTER';
      
      if (isLookingAway && !wasLookingAwayRef.current) {
        const details = `User's gaze direction: ${data.eyes.gazeDirection}`;
        addTrackingEvent('looking_away', `Eyes Looking ${data.eyes.gazeDirection}`, 'warning', details);
        sendTrackingEventToBackend('looking_away', `Eyes Looking ${data.eyes.gazeDirection}`, details, data, metrics);
        console.log(`[ALERT] User looking ${data.eyes.gazeDirection}`);
      } else if (!isLookingAway && wasLookingAwayRef.current) {
        addTrackingEvent('looking_back', 'Eyes Returned to Screen', 'success', 'User is looking at the screen');
        sendTrackingEventToBackend('looking_back', 'Eyes Returned to Screen', 'User is looking at the screen', data, metrics);
        console.log('[OK] User looking at screen');
      }
      wasLookingAwayRef.current = isLookingAway;

      // === TALKING DETECTION ===
      const isTalking = data.expression.mouthOpen > 30;
      
      if (isTalking && !wasTalkingRef.current) {
        const details = `Mouth openness: ${data.expression.mouthOpen}%`;
        addTrackingEvent('talking', 'Speaking Detected', 'warning', details);
        sendTrackingEventToBackend('talking', 'Speaking Detected', details, data, metrics);
        console.log(`[ALERT] User may be talking (mouth ${data.expression.mouthOpen}% open)`);
      } else if (!isTalking && wasTalkingRef.current) {
        addTrackingEvent('stopped_talking', 'Speaking Stopped', 'info', 'Mouth closed');
        sendTrackingEventToBackend('stopped_talking', 'Speaking Stopped', 'Mouth closed', data, metrics);
        console.log('[OK] User stopped talking');
      }
      wasTalkingRef.current = isTalking;

      // === EYES CLOSED EXTENDED ===
      const isEyesClosedExtended = faceTrackingService.isEyesClosedExtended();
      
      if (isEyesClosedExtended && !wasEyesClosedExtendedRef.current) {
        const details = `Eyes closed for ${metrics.eyeClosureDuration.toFixed(1)} seconds`;
        addTrackingEvent('eyes_closed_extended', 'Eyes Closed Extended', 'warning', details);
        sendTrackingEventToBackend('eyes_closed_extended', 'Eyes Closed Extended', details, data, metrics);
        console.log(`[ALERT] Eyes closed for extended period (${metrics.eyeClosureDuration.toFixed(1)}s)`);
      } else if (!isEyesClosedExtended && wasEyesClosedExtendedRef.current) {
        addTrackingEvent('eyes_opened', 'Eyes Opened', 'success', 'User opened their eyes');
        sendTrackingEventToBackend('eyes_opened', 'Eyes Opened', 'User opened their eyes', data, metrics);
        console.log('[OK] Eyes opened');
      }
      wasEyesClosedExtendedRef.current = isEyesClosedExtended;

      // === EXCESSIVE BLINKING ===
      const isExcessiveBlinking = faceTrackingService.isExcessiveBlinking();
      
      if (isExcessiveBlinking && !wasExcessiveBlinkingRef.current) {
        const details = `Blink rate: ${metrics.blinkRate} blinks/minute`;
        addTrackingEvent('excessive_blinking', 'Excessive Blinking Detected', 'warning', details);
        sendTrackingEventToBackend('excessive_blinking', 'Excessive Blinking Detected', details, data, metrics);
        console.log(`[ALERT] Excessive blinking (${metrics.blinkRate} blinks/min)`);
      } else if (!isExcessiveBlinking && wasExcessiveBlinkingRef.current) {
        // Blinking returned to normal - don't need to log recovery
        console.log('[OK] Blink rate returned to normal');
      }
      wasExcessiveBlinkingRef.current = isExcessiveBlinking;

      // === SQUINTING ===
      const isSquinting = metrics.isSquinting;
      
      if (isSquinting && !wasSquintingRef.current) {
        const details = `Squint level: L=${metrics.squintLevel.left}% R=${metrics.squintLevel.right}%`;
        addTrackingEvent('squinting_detected', 'Squinting Detected', 'warning', details);
        sendTrackingEventToBackend('squinting_detected', 'Squinting Detected', details, data, metrics);
        console.log(`[ALERT] User squinting (L=${metrics.squintLevel.left}% R=${metrics.squintLevel.right}%)`);
      } else if (!isSquinting && wasSquintingRef.current) {
        // Squinting stopped - don't need to log recovery
        console.log('[OK] User stopped squinting');
      }
      wasSquintingRef.current = isSquinting;

      // === HEAD TILTED ===
      const isHeadTilted = metrics.isHeadTilted;
      
      if (isHeadTilted && !wasHeadTiltedRef.current) {
        const details = `Head roll: ${data.headPose.roll}°`;
        addTrackingEvent('head_tilted', 'Head Tilted', 'warning', details);
        sendTrackingEventToBackend('head_tilted', 'Head Tilted', details, data, metrics);
        console.log(`[ALERT] Head tilted (roll=${data.headPose.roll}°)`);
      } else if (!isHeadTilted && wasHeadTiltedRef.current) {
        addTrackingEvent('head_position_normal', 'Head Position Normal', 'success', 'Head returned to normal position');
        sendTrackingEventToBackend('head_position_normal', 'Head Position Normal', 'Head returned to normal position', data, metrics);
        console.log('[OK] Head position normal');
      }
      wasHeadTiltedRef.current = isHeadTilted;

      // === EXCESSIVE HEAD MOVEMENT ===
      const isExcessiveHeadMovement = metrics.isExcessiveHeadMovement;
      
      if (isExcessiveHeadMovement && !wasExcessiveHeadMovementRef.current) {
        const details = `${metrics.headMovementCount} head movements in 10 seconds`;
        addTrackingEvent('head_movement_excessive', 'Excessive Head Movement', 'warning', details);
        sendTrackingEventToBackend('head_movement_excessive', 'Excessive Head Movement', details, data, metrics);
        console.log(`[ALERT] Excessive head movement (${metrics.headMovementCount} movements)`);
      } else if (!isExcessiveHeadMovement && wasExcessiveHeadMovementRef.current) {
        // Head movement calmed down - don't need to log
        console.log('[OK] Head movement calmed down');
      }
      wasExcessiveHeadMovementRef.current = isExcessiveHeadMovement;

      // === CONFUSED EXPRESSION ===
      const isConfused = metrics.isConfused;
      
      if (isConfused && !wasConfusedRef.current) {
        const details = `Confused expression detected (browInnerUp + browDown)`;
        addTrackingEvent('expression_confused', 'Confused Expression', 'warning', details);
        sendTrackingEventToBackend('expression_confused', 'Confused Expression', details, data, metrics);
        console.log('[ALERT] User appears confused');
      } else if (!isConfused && wasConfusedRef.current) {
        // Confusion cleared - don't need to log
        console.log('[OK] Confused expression cleared');
      }
      wasConfusedRef.current = isConfused;

      // === LIP READING DETECTION ===
      const isLipReading = metrics.isLipReading;
      
      if (isLipReading && !wasLipReadingRef.current) {
        const details = `Lip movement: ${metrics.lipMovement}% (jaw open: ${data.expression.mouthOpen}%)`;
        addTrackingEvent('lip_reading_detected', 'Lip Reading Detected', 'warning', details);
        sendTrackingEventToBackend('lip_reading_detected', 'Lip Reading Detected', details, data, metrics);
        console.log(`[ALERT] Possible lip reading (lip movement without jaw opening)`);
      } else if (!isLipReading && wasLipReadingRef.current) {
        // Lip reading stopped - don't need to log
        console.log('[OK] Lip reading stopped');
      }
      wasLipReadingRef.current = isLipReading;

      // === MULTIPLE FACES ===
      const hasMultipleFaces = (data.faceCount || 1) > 1;
      
      if (hasMultipleFaces && !wasMultipleFacesRef.current) {
        const details = `${data.faceCount} faces detected in frame`;
        addTrackingEvent('multiple_faces_detected', 'Multiple Faces Detected', 'warning', details);
        sendTrackingEventToBackend('multiple_faces_detected', 'Multiple Faces Detected', details, data, metrics);
        console.log(`[ALERT] Multiple faces detected (${data.faceCount})`);
      } else if (!hasMultipleFaces && wasMultipleFacesRef.current) {
        // Back to single face - don't need to log
        console.log('[OK] Single face detected');
      }
      wasMultipleFacesRef.current = hasMultipleFaces;
    }

    // Update state for UI display
    setTrackingData(data);
    setExtendedMetrics(metrics);
    prevTrackingDataRef.current = data;
  }, [isTrackingEnabled, addTrackingEvent, sendTrackingEventToBackend]);

  // Browser visibility tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.visibilityState === 'hidden';
      
      if (isHidden && !wasTabHiddenRef.current) {
        // Tab switched away
        const timestamp = new Date().toISOString();
        addTrackingEvent('tab_switched_away', 'Tab Switched Away', 'warning', `User switched to another tab at ${timestamp}`);
        
        if (socketService.isConnected()) {
          const payload: FaceTrackingEventPayload = {
            type: 'tab_switched_away',
            timestamp: Date.now(),
            message: 'Tab Switched Away',
            details: 'User switched to another browser tab',
            data: { faceDetected: false },
          };
          socketService.sendFaceTrackingEvent(payload);
        }
        console.log('[ALERT] User switched to another tab');
      } else if (!isHidden && wasTabHiddenRef.current) {
        // Tab returned
        addTrackingEvent('tab_returned', 'Tab Returned', 'success', 'User returned to this tab');
        
        if (socketService.isConnected()) {
          const payload: FaceTrackingEventPayload = {
            type: 'tab_returned',
            timestamp: Date.now(),
            message: 'Tab Returned',
            details: 'User returned to this browser tab',
            data: { faceDetected: trackingData?.faceDetected ?? false },
          };
          socketService.sendFaceTrackingEvent(payload);
        }
        console.log('[OK] User returned to tab');
      }
      wasTabHiddenRef.current = isHidden;
    };

    const handleWindowBlur = () => {
      if (!wasWindowBlurredRef.current) {
        wasWindowBlurredRef.current = true;
        addTrackingEvent('window_blur', 'Window Lost Focus', 'warning', 'Browser window lost focus');
        
        if (socketService.isConnected()) {
          const payload: FaceTrackingEventPayload = {
            type: 'window_blur',
            timestamp: Date.now(),
            message: 'Window Lost Focus',
            details: 'Browser window lost focus',
            data: { faceDetected: trackingData?.faceDetected ?? false },
          };
          socketService.sendFaceTrackingEvent(payload);
        }
        console.log('[ALERT] Window lost focus');
      }
    };

    const handleWindowFocus = () => {
      if (wasWindowBlurredRef.current) {
        wasWindowBlurredRef.current = false;
        addTrackingEvent('window_focus', 'Window Regained Focus', 'success', 'Browser window regained focus');
        
        if (socketService.isConnected()) {
          const payload: FaceTrackingEventPayload = {
            type: 'window_focus',
            timestamp: Date.now(),
            message: 'Window Regained Focus',
            details: 'Browser window regained focus',
            data: { faceDetected: trackingData?.faceDetected ?? false },
          };
          socketService.sendFaceTrackingEvent(payload);
        }
        console.log('[OK] Window regained focus');
      }
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    // Initialize refs based on current state
    wasTabHiddenRef.current = document.visibilityState === 'hidden';
    wasWindowBlurredRef.current = !document.hasFocus();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [addTrackingEvent, trackingData]);

  // Initialize on mount - runs only once
  useEffect(() => {
    // Check if we have a reference face
    const referenceFace = sessionStorage.getItem('referenceFace');
    if (!referenceFace) {
      console.log('No reference face found, redirecting to home');
      router.push('/');
      return;
    }

    // Check if socket already exists (Strict Mode remount)
    const existingSocket = socketService.getSocket();
    if (existingSocket) {
      console.log('Socket already exists, reusing connection...');
      if (existingSocket.connected) {
        setIsConnected(true);
        setSessionId(existingSocket.id || 'connected');
        setIsInitializing(false);
      }
      // Don't reinitialize, just return
      hasInitializedRef.current = true;
      return;
    }

    // Prevent double initialization
    if (hasInitializedRef.current) {
      return;
    }

    console.log('Reference face found, setting up socket...');
    hasInitializedRef.current = true;

    // Track if we got connected
    let gotConnected = false;

    // Handle session established
    const handleSession = (session: SessionInfo) => {
      console.log('Session established in chat:', session);
      gotConnected = true;
      setSessionId(session.sessionId);
      setIsConnected(true);
      setIsInitializing(false);

      // Send reference face
      const storedFace = sessionStorage.getItem('referenceFace');
      if (storedFace) {
        console.log('Sending stored reference face...');
        socketService.sendReferenceFace(storedFace);
      }
    };

    // Handle face reference stored
    const handleFaceStored = (result: {
      success: boolean;
      message: string;
    }) => {
      console.log('Face reference stored:', result);
      if (result.success) {
        // Log to event tracking instead of toast
        addTrackingEventRef.current(
          'verification_success',
          'Face Registered',
          'success',
          'Your face has been registered for verification'
        );
      }
    };

    // Handle response from server
    const handleResponse = (response: ChatResponse) => {
      console.log('Response received:', response);
      setMessages((prev) => [...prev, response.message]);
      setIsLoading(false);
      inputRef.current?.focus();
    };

    // Handle chat errors
    const handleError = (error: ChatError) => {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          content:
            error.message || 'Sorry, something went wrong. Please try again.',
          role: 'assistant',
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
      inputRef.current?.focus();
    };

    // Handle face verification result
    const handleFaceResult = (result: FaceVerifyResult) => {
      console.log('Face verification result:', result);

      const faceConfig = socketService.getFaceConfig();
      const threshold = faceConfig?.confidenceThreshold || 80;

      if (result.success && result.confidence > 0) {
        setVerificationStatus('verified');
        setVerificationError(null);

        // Log success to event log
        addTrackingEventRef.current(
          'verification_success',
          'Face Verified',
          'success',
          `Confidence: ${result.confidence.toFixed(1)}% (Threshold: ${threshold}%)`
        );
      } else {
        setVerificationStatus('failed');
        setVerificationError(result.message);

        // Log failure to event log
        addTrackingEventRef.current(
          'verification_failed',
          'Face Verification Failed',
          'warning',
          `Confidence: ${result.confidence.toFixed(1)}% (Required: ${threshold}%)${
            result.retriesLeft !== undefined
              ? ` - ${result.retriesLeft} retries left`
              : ''
          }`
        );
      }
    };

    // Handle face verification failure (should disconnect)
    const handleFaceFailed = (result: FaceVerifyFailed) => {
      console.error('Face verification failed:', result);
      setVerificationStatus('failed');
      setVerificationError(result.message);

      // Log critical failure to event log
      addTrackingEventRef.current(
        'verification_error',
        'Session Terminated',
        'warning',
        result.message
      );

      if (result.shouldDisconnect) {
        setTimeout(() => {
          router.push('/');
        }, 3000);
      }
    };

    // Check if socket exists and is connected
    let socket = socketService.getSocket();

    if (socket?.connected) {
      // Already connected, just set up listeners
      console.log('Socket already connected');
      gotConnected = true;
      setIsConnected(true);
      setSessionId(socket.id || 'connected');
      setIsInitializing(false);
    } else {
      // Need to connect - prepare and start
      console.log('Socket not connected, connecting...');
      socket = socketService.prepare();

      // Handle connection errors
      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });

      socketService.onSession(handleSession);
      socketService.onFaceReferenceStored(handleFaceStored);
      socketService.start();
    }

    // Set up chat event listeners
    socketService.onResponse(handleResponse);
    socketService.onError(handleError);
    socketService.onFaceResult(handleFaceResult);
    socketService.onFaceFailed(handleFaceFailed);

    // Handle disconnect/connect events on socket
    const onDisconnect = () => {
      console.log('Socket disconnected');
      setIsConnected(false);
      setSessionId(null);
    };

    const onConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
      setSessionId(socketService.getSocket()?.id || 'connected');
    };

    socket?.on('disconnect', onDisconnect);
    socket?.on('connect', onConnect);

    // Start camera for periodic verification
    startCamera();

    // Set timeout for initialization - if not connected after 5s, show error
    const initTimeout = setTimeout(() => {
      if (!gotConnected) {
        console.log('Connection timeout - not connected after 5 seconds');
      }
      setIsInitializing(false);
    }, 5000);

    // Cleanup on unmount
    return () => {
      console.log('Chat page cleanup running...');
      clearTimeout(initTimeout);

      // Only do full cleanup if we're intentionally leaving (not Strict Mode remount)
      // In Strict Mode, the component unmounts and remounts quickly
      // We use a small delay to detect this
      const cleanupTimeout = setTimeout(() => {
        console.log('Performing full cleanup...');
        socketService.offResponse(handleResponse);
        socketService.offError(handleError);
        socketService.offFaceResult(handleFaceResult);
        socketService.offFaceFailed(handleFaceFailed);
        socket?.off('disconnect', onDisconnect);
        socket?.off('connect', onConnect);

        if (verificationIntervalRef.current) {
          clearInterval(verificationIntervalRef.current);
        }

        if (trackingIntervalRef.current) {
          clearInterval(trackingIntervalRef.current);
        }

        // Cleanup face tracking service
        faceTrackingService.destroy();

        stopCamera();
        socketService.disconnect();
        sessionStorage.removeItem('referenceFace');
      }, 100); // Small delay to allow Strict Mode remount

      // Store timeout so next mount can cancel it
      (
        window as unknown as { __chatCleanupTimeout?: NodeJS.Timeout }
      ).__chatCleanupTimeout = cleanupTimeout;
    };
  }, [router, startCamera, stopCamera]); // Minimal dependencies - no state that changes

  // Cancel pending cleanup on mount (for Strict Mode)
  useEffect(() => {
    const pendingCleanup = (
      window as unknown as { __chatCleanupTimeout?: NodeJS.Timeout }
    ).__chatCleanupTimeout;
    if (pendingCleanup) {
      console.log('Cancelling pending cleanup (Strict Mode remount)');
      clearTimeout(pendingCleanup);
      delete (window as unknown as { __chatCleanupTimeout?: NodeJS.Timeout })
        .__chatCleanupTimeout;
    }
  }, []);

  // Set up periodic verification interval
  useEffect(() => {
    if (!isConnected) return;

    const faceConfig = socketService.getFaceConfig();
    const intervalMs = faceConfig?.checkIntervalMs || 60000;

    console.log(`Setting up periodic verification every ${intervalMs}ms`);

    // Perform initial verification after 5 seconds
    const initialTimeout = setTimeout(() => {
      performVerification();
    }, 5000);

    // Set up periodic verification
    verificationIntervalRef.current = setInterval(() => {
      performVerification();
    }, intervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
      }
    };
  }, [isConnected, performVerification]);

  // Initialize face tracking service and start tracking
  useEffect(() => {
    let isMounted = true;

    const initTracking = async () => {
      try {
        console.log('[ChatPage] Initializing face tracking service...');
        await faceTrackingService.initialize(2); // Support up to 2 faces for multiple face detection
        
        if (isMounted) {
          console.log('[ChatPage] Face tracking service ready');
          setIsTrackingReady(true);
        }
      } catch (error) {
        console.error('[ChatPage] Failed to initialize face tracking:', error);
      }
    };

    initTracking();

    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize client events service for tracking copy/paste, tab switching, etc.
  useEffect(() => {
    console.log('[ChatPage] Initializing client events service...');
    clientEventsService.initialize();

    // Subscribe to client events and add them to the tracking log
    const unsubscribe = clientEventsService.subscribe((event: ClientEvent) => {
      // Map client event severity to tracking event severity
      const severity: TrackingEventSeverity = 
        event.severity === 'critical' ? 'warning' : event.severity;

      // Add to the tracking events log
      const trackingEvent: TrackingEvent = {
        id: event.id,
        type: event.type as unknown as FaceTrackingEventType, // Client events have their own type
        timestamp: new Date(event.timestamp),
        message: event.message,
        details: event.details,
        severity,
      };

      setTrackingEvents((prev) => {
        const newEvents = [trackingEvent, ...prev].slice(0, 100);
        return newEvents;
      });

      // Send to backend
      if (socketService.isConnected()) {
        socketService.sendClientEvent({
          type: event.type as ClientEventType,
          timestamp: event.timestamp,
          message: event.message,
          severity: event.severity,
          details: event.details,
          data: event.data,
        });
      }
    });

    return () => {
      console.log('[ChatPage] Cleaning up client events service...');
      unsubscribe();
      clientEventsService.cleanup();
    };
  }, []);

  // Set up face tracking interval (separate from verification)
  useEffect(() => {
    if (!isTrackingEnabled || !isTrackingReady) {
      console.log('[ChatPage] Face tracking not starting - enabled:', isTrackingEnabled, 'ready:', isTrackingReady);
      return;
    }

    const trackingIntervalMs = 500; // Process every 500ms
    console.log(`[ChatPage] Starting face tracking every ${trackingIntervalMs}ms`);

    // Run immediately once
    processFaceTracking();

    // Start tracking interval
    trackingIntervalRef.current = setInterval(() => {
      processFaceTracking();
    }, trackingIntervalMs);

    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
    };
  }, [isTrackingEnabled, isTrackingReady, processFaceTracking]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when connected
  useEffect(() => {
    if (isConnected && !isInitializing) {
      inputRef.current?.focus();
    }
  }, [isConnected, isInitializing]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isLoading || !isConnected) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputValue.trim(),
      role: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    socketService.sendMessage(userMessage.content);
  };

  const getVerificationIcon = () => {
    switch (verificationStatus) {
      case 'verified':
        return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
      case 'failed':
        return <ShieldAlert className="h-4 w-4 text-red-500" />;
      case 'checking':
        return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
      default:
        return <Camera className="h-4 w-4 text-slate-400" />;
    }
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
          <p className="mt-4 text-sm text-slate-500">Connecting to chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Hidden video for face capture */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold text-slate-800">Chat</h1>
            <p className="text-xs text-slate-500">
              {sessionId ? `Connected` : 'Connecting...'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Face tracking toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTrackingDebug(!showTrackingDebug)}
              className="h-8 px-2"
              title={showTrackingDebug ? 'Hide tracking debug' : 'Show tracking debug'}
            >
              {showTrackingDebug ? (
                <Eye className="h-4 w-4 text-blue-500" />
              ) : (
                <EyeOff className="h-4 w-4 text-slate-400" />
              )}
            </Button>

            {/* Verification status */}
            <div
              className="flex items-center gap-1.5"
              title={verificationError || 'Face verification status'}
            >
              {getVerificationIcon()}
              <span className="text-xs font-medium text-slate-500">
                {verificationStatus === 'verified' && 'Verified'}
                {verificationStatus === 'checking' && 'Checking...'}
                {verificationStatus === 'failed' && 'Failed'}
                {verificationStatus === 'pending' && 'Pending'}
              </span>
            </div>

            {/* Connection status */}
            {isConnected ? (
              <div className="flex items-center gap-1.5 text-emerald-600">
                <Wifi className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-400">
                <WifiOff className="h-4 w-4" />
              </div>
            )}

            {/* End Session button */}
            <Button
              variant="destructive"
              size="sm"
              onClick={endSession}
              disabled={!sessionId}
              className="ml-2"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              End Session
            </Button>
          </div>
        </div>
      </header>

      {/* Verification error banner */}
      {verificationStatus === 'failed' && verificationError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-600">
          {verificationError}
        </div>
      )}

      {/* Main Content - Chat and Event Log Side by Side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Messages Area */}
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.length === 0 ? (
                <div className="flex h-[calc(100vh-280px)] flex-col items-center justify-center text-center">
                  <div className="mb-4 rounded-full bg-slate-100 p-4">
                    <Bot className="h-8 w-8 text-slate-400" />
                  </div>
                  <h2 className="mb-2 text-lg font-medium text-slate-700">
                    Start a conversation
                  </h2>
                  <p className="max-w-sm text-sm text-slate-500">
                    {isConnected
                      ? 'Type your message below to begin chatting with the assistant.'
                      : 'Waiting for connection...'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex gap-3',
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200">
                          <Bot className="h-4 w-4 text-slate-600" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-4 py-2.5',
                          message.role === 'user'
                            ? 'bg-slate-800 text-white'
                            : 'bg-white text-slate-800 shadow-sm border border-slate-200'
                        )}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                      {message.role === 'user' && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800">
                          <User className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200">
                        <Bot className="h-4 w-4 text-slate-600" />
                      </div>
                      <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 shadow-sm border border-slate-200">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        <span className="text-sm text-slate-500">Thinking...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t border-slate-200 bg-white">
            <form
              onSubmit={handleSubmit}
              className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4"
            >
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isConnected ? 'Type your message...' : 'Connecting...'}
                disabled={isLoading || !isConnected}
                className="flex-1 border-slate-300 bg-slate-50 focus-visible:ring-slate-400"
              />
              <Button
                type="submit"
                disabled={!inputValue.trim() || isLoading || !isConnected}
                className="shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Event Log Sidebar - Right Side */}
        {showTrackingDebug && (
          <div className={cn(
            'flex flex-col border-l border-slate-200 bg-white transition-all duration-300',
            showEventLog ? 'w-80' : 'w-12'
          )}>
            {/* Sidebar Header */}
            <button
              onClick={() => setShowEventLog(!showEventLog)}
              className="flex items-center gap-2 px-3 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
              title={showEventLog ? 'Collapse event log' : 'Expand event log'}
            >
              {showEventLog ? (
                <>
                  <Activity className="h-4 w-4 text-slate-600" />
                  <span className="flex-1 text-sm font-medium text-slate-700 text-left">Tracking</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {trackingEvents.length}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Activity className="h-4 w-4 text-slate-600" />
                  <span className="text-[10px] text-slate-500">{trackingEvents.length}</span>
                </div>
              )}
            </button>

            {/* Status Badges - Live Tracking Status */}
            {showEventLog && trackingData && (
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {/* Face Position */}
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                      !trackingData.faceDetected || Math.abs(trackingData.headPose.yaw) > 40
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-1.5 w-1.5 rounded-full',
                        !trackingData.faceDetected || Math.abs(trackingData.headPose.yaw) > 40
                          ? 'bg-red-500'
                          : 'bg-emerald-500'
                      )}
                    />
                    <span className="font-medium">
                      {!trackingData.faceDetected
                        ? 'No Face'
                        : Math.abs(trackingData.headPose.yaw) > 40
                          ? 'Away'
                          : 'Facing'}
                    </span>
                  </div>

                  {/* Gaze Direction */}
                  {trackingData.faceDetected && (
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                        trackingData.eyes.gazeDirection !== 'CENTER'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      )}
                    >
                      <Eye className="h-2.5 w-2.5" />
                      <span className="font-medium">
                        {trackingData.eyes.gazeDirection === 'CENTER'
                          ? 'Screen'
                          : trackingData.eyes.gazeDirection}
                      </span>
                    </div>
                  )}

                  {/* Talking Detection */}
                  {trackingData.faceDetected && (
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                        trackingData.expression.mouthOpen > 30
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      <span className="font-medium">
                        {trackingData.expression.mouthOpen > 30 ? 'Talking' : 'Silent'}
                      </span>
                    </div>
                  )}

                  {/* Multiple Faces Warning */}
                  {trackingData.faceCount && trackingData.faceCount > 1 && (
                    <div className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">
                      <span className="font-medium">{trackingData.faceCount} Faces</span>
                    </div>
                  )}

                  {/* Extended Metrics */}
                  {extendedMetrics && trackingData.faceDetected && (
                    <>
                      {extendedMetrics.blinkRate > 15 && (
                        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                          <span className="font-medium">{extendedMetrics.blinkRate}/min</span>
                        </div>
                      )}
                      {extendedMetrics.isHeadTilted && (
                        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                          <span className="font-medium">Tilted</span>
                        </div>
                      )}
                      {extendedMetrics.isSquinting && (
                        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                          <span className="font-medium">Squint</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Event Log Content */}
            {showEventLog && (
              <ScrollArea className="flex-1">
                <div ref={eventLogRef}>
                  {trackingEvents.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-400">
                      No events yet.
                      <br />
                      Events will appear here.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {trackingEvents.map((event) => (
                        <div
                          key={event.id}
                          className={cn(
                            'px-3 py-2.5 text-xs',
                            event.severity === 'warning' && 'bg-amber-50',
                            event.severity === 'success' && 'bg-emerald-50'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {/* Event Icon */}
                            <div
                              className={cn(
                                'mt-1 h-2 w-2 shrink-0 rounded-full',
                                event.severity === 'info' && 'bg-blue-400',
                                event.severity === 'warning' && 'bg-amber-400',
                                event.severity === 'success' && 'bg-emerald-400'
                              )}
                            />

                            {/* Event Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={cn(
                                    'font-medium truncate',
                                    event.severity === 'info' && 'text-slate-700',
                                    event.severity === 'warning' && 'text-amber-700',
                                    event.severity === 'success' && 'text-emerald-700'
                                  )}
                                >
                                  {event.message}
                                </span>
                                <span className="shrink-0 text-slate-400 text-[10px]">
                                  {formatTime(event.timestamp)}
                                </span>
                              </div>
                              {event.details && (
                                <p className="mt-0.5 text-slate-500 text-[11px] line-clamp-2">
                                  {event.details}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
