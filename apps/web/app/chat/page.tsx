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
  FaceTrackingEventPayload,
} from '@/lib/socket';
import {
  faceTrackingService,
  FaceTrackingData,
} from '@/lib/face-tracking';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type VerificationStatus = 'pending' | 'verified' | 'failed' | 'checking';

// Tracking event types - focused on significant security-relevant events only
type TrackingEventType =
  | 'face_away'      // Face turned away from screen
  | 'face_returned'  // Face returned to screen
  | 'looking_away'   // Eyes/gaze not on screen
  | 'looking_back'   // Eyes returned to screen
  | 'talking'        // Mouth open, possibly talking to someone
  | 'stopped_talking'; // Mouth closed

interface TrackingEvent {
  id: string;
  type: TrackingEventType;
  timestamp: Date;
  message: string;
  details?: string;
  severity: 'info' | 'warning' | 'success';
}

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
  const wasLookingAwayRef = useRef(false);
  const wasTalkingRef = useRef(false);
  const lastToastTimeRef = useRef<Record<string, number>>({});

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

      toast.info('Verifying Face...', {
        description: 'Periodic security check in progress',
        duration: 2000,
      });

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

  // Add a tracking event to the log
  const addTrackingEvent = useCallback(
    (
      type: TrackingEventType,
      message: string,
      severity: 'info' | 'warning' | 'success' = 'info',
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
        // Keep only last 50 events
        const newEvents = [event, ...prev].slice(0, 50);
        return newEvents;
      });

      // Show toast for important events (with rate limiting)
      const now = Date.now();
      const lastToastTime = lastToastTimeRef.current[type] || 0;
      const minInterval = type === 'blink' ? 2000 : 1000; // Rate limit toasts

      if (now - lastToastTime > minInterval) {
        lastToastTimeRef.current[type] = now;

        if (severity === 'warning') {
          toast.warning(message, { description: details, duration: 2000 });
        } else if (severity === 'success' && type !== 'blink') {
          toast.success(message, { description: details, duration: 2000 });
        }
        // Don't show info toasts to avoid spam
      }
    },
    []
  );

  // Send tracking event to backend
  const sendTrackingEventToBackend = useCallback(
    (
      type: FaceTrackingEventPayload['type'],
      message: string,
      details: string,
      trackingData: FaceTrackingData
    ) => {
      if (!socketService.isConnected()) return;

      const payload: FaceTrackingEventPayload = {
        type,
        timestamp: Date.now(),
        message,
        details,
        data: {
          headPose: trackingData.headPose,
          gazeDirection: trackingData.eyes.gazeDirection,
          mouthOpenness: trackingData.expression.mouthOpen,
          faceDetected: trackingData.faceDetected,
        },
      };

      socketService.sendFaceTrackingEvent(payload);
    },
    []
  );

  // Process face tracking frame - detect only significant security-relevant events
  const processFaceTracking = useCallback(() => {
    if (!videoRef.current || !isTrackingEnabled) return;

    const data = faceTrackingService.processFrame(videoRef.current);
    if (!data) return;

    // === SIGNIFICANT EVENT DETECTION ===
    
    // 1. Face turned away (head yaw > 40° or face not detected)
    const isFaceAway = !data.faceDetected || Math.abs(data.headPose.yaw) > 40 || Math.abs(data.headPose.pitch) > 35;
    
    if (isFaceAway && !wasFaceAwayRef.current) {
      // Face just turned away
      const details = data.faceDetected 
        ? `Head angle: yaw=${data.headPose.yaw}° pitch=${data.headPose.pitch}°`
        : 'Face not detected in frame';
      addTrackingEvent('face_away', 'Face Turned Away', 'warning', details);
      sendTrackingEventToBackend('face_away', 'Face Turned Away', details, data);
      console.log('[ALERT] Face turned away from screen');
    } else if (!isFaceAway && wasFaceAwayRef.current) {
      // Face returned
      addTrackingEvent('face_returned', 'Face Returned to Screen', 'success', 'User is facing the screen again');
      sendTrackingEventToBackend('face_returned', 'Face Returned to Screen', 'User is facing the screen again', data);
      console.log('[OK] Face returned to screen');
    }
    wasFaceAwayRef.current = isFaceAway;

    // 2. Eyes/gaze looking away (only when face is detected and facing screen)
    if (data.faceDetected && !isFaceAway) {
      const isLookingAway = data.eyes.gazeDirection !== 'CENTER';
      
      if (isLookingAway && !wasLookingAwayRef.current) {
        // Started looking away
        const details = `User's gaze direction: ${data.eyes.gazeDirection}`;
        addTrackingEvent('looking_away', `Eyes Looking ${data.eyes.gazeDirection}`, 'warning', details);
        sendTrackingEventToBackend('looking_away', `Eyes Looking ${data.eyes.gazeDirection}`, details, data);
        console.log(`[ALERT] User looking ${data.eyes.gazeDirection}`);
      } else if (!isLookingAway && wasLookingAwayRef.current) {
        // Eyes returned to screen
        addTrackingEvent('looking_back', 'Eyes Returned to Screen', 'success', 'User is looking at the screen');
        sendTrackingEventToBackend('looking_back', 'Eyes Returned to Screen', 'User is looking at the screen', data);
        console.log('[OK] User looking at screen');
      }
      wasLookingAwayRef.current = isLookingAway;

      // 3. Mouth open (possibly talking) - use jawOpen > 30%
      const isTalking = data.expression.mouthOpen > 30;
      
      if (isTalking && !wasTalkingRef.current) {
        // Started talking
        const details = `Mouth openness: ${data.expression.mouthOpen}%`;
        addTrackingEvent('talking', 'Possible Talking Detected', 'warning', details);
        sendTrackingEventToBackend('talking', 'Possible Talking Detected', details, data);
        console.log(`[ALERT] User may be talking (mouth ${data.expression.mouthOpen}% open)`);
      } else if (!isTalking && wasTalkingRef.current) {
        // Stopped talking
        addTrackingEvent('stopped_talking', 'Talking Stopped', 'info', 'Mouth closed');
        sendTrackingEventToBackend('stopped_talking', 'Talking Stopped', 'Mouth closed', data);
        console.log('[OK] User stopped talking');
      }
      wasTalkingRef.current = isTalking;
    }

    // Update state for UI display
    setTrackingData(data);
    prevTrackingDataRef.current = data;
  }, [isTrackingEnabled, addTrackingEvent, sendTrackingEventToBackend]);

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
        toast.success('Face registered!', {
          description: 'Your face has been registered for verification',
          duration: 3000,
        });
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

        toast.success('Face Verified', {
          description: `Confidence: ${result.confidence.toFixed(
            1
          )}% (Threshold: ${threshold}%)`,
          duration: 4000,
        });
      } else {
        setVerificationStatus('failed');
        setVerificationError(result.message);

        toast.error('Face Verification Failed', {
          description: `Confidence: ${result.confidence.toFixed(
            1
          )}% (Required: ${threshold}%)${
            result.retriesLeft !== undefined
              ? ` - ${result.retriesLeft} retries left`
              : ''
          }`,
          duration: 5000,
        });
      }
    };

    // Handle face verification failure (should disconnect)
    const handleFaceFailed = (result: FaceVerifyFailed) => {
      console.error('Face verification failed:', result);
      setVerificationStatus('failed');
      setVerificationError(result.message);

      toast.error('Session Terminated', {
        description: result.message,
        duration: 5000,
      });

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
        toast.error('Connection failed', {
          description: 'Could not connect to server. Is the API running?',
        });
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
        toast.error('Connection timeout', {
          description: 'Could not connect to chat server. Please try again.',
        });
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
        await faceTrackingService.initialize();
        
        if (isMounted) {
          console.log('[ChatPage] Face tracking service ready');
          setIsTrackingReady(true);
          toast.success('Face Tracking Active', {
            description: 'Monitoring facial expressions and eye movements',
            duration: 3000,
          });
        }
      } catch (error) {
        console.error('[ChatPage] Failed to initialize face tracking:', error);
        toast.error('Face Tracking Unavailable', {
          description: 'Could not initialize face tracking. Some features may be limited.',
          duration: 5000,
        });
      }
    };

    initTracking();

    return () => {
      isMounted = false;
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
          </div>
        </div>
      </header>

      {/* Verification error banner */}
      {verificationStatus === 'failed' && verificationError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-600">
          {verificationError}
        </div>
      )}

      {/* Face Tracking Status Bar - Simplified */}
      {showTrackingDebug && trackingData && (
        <div className="border-b border-slate-200 bg-white px-4 py-2">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
              {/* Face Position */}
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1',
                  !trackingData.faceDetected || Math.abs(trackingData.headPose.yaw) > 40
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-100 text-emerald-700'
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-2 w-2 rounded-full',
                    !trackingData.faceDetected || Math.abs(trackingData.headPose.yaw) > 40
                      ? 'bg-red-500'
                      : 'bg-emerald-500'
                  )}
                />
                <span className="font-medium">
                  {!trackingData.faceDetected
                    ? 'No Face'
                    : Math.abs(trackingData.headPose.yaw) > 40
                      ? 'Face Away'
                      : 'Facing Screen'}
                </span>
              </div>

              {/* Gaze Direction */}
              {trackingData.faceDetected && (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1',
                    trackingData.eyes.gazeDirection !== 'CENTER'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  )}
                >
                  <Eye className="h-3 w-3" />
                  <span className="font-medium">
                    {trackingData.eyes.gazeDirection === 'CENTER'
                      ? 'Looking at Screen'
                      : `Looking ${trackingData.eyes.gazeDirection}`}
                  </span>
                </div>
              )}

              {/* Talking Detection */}
              {trackingData.faceDetected && (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1',
                    trackingData.expression.mouthOpen > 30
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  )}
                >
                  <span className="font-medium">
                    {trackingData.expression.mouthOpen > 30
                      ? `Talking (${trackingData.expression.mouthOpen}%)`
                      : 'Silent'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Face Tracking Event Log */}
      {showTrackingDebug && (
        <div className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-3xl">
            {/* Event Log Header */}
            <button
              onClick={() => setShowEventLog(!showEventLog)}
              className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Activity className="h-3 w-3" />
                <span>Tracking Event Log</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-500">
                  {trackingEvents.length}
                </span>
              </div>
              {showEventLog ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {/* Event Log Content */}
            {showEventLog && (
              <div
                ref={eventLogRef}
                className="max-h-40 overflow-y-auto border-t border-slate-200 bg-white"
              >
                {trackingEvents.length === 0 ? (
                  <div className="px-4 py-3 text-center text-xs text-slate-400">
                    No events yet. Face tracking events will appear here.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {trackingEvents.map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          'flex items-start gap-3 px-4 py-2 text-xs',
                          event.severity === 'warning' && 'bg-amber-50',
                          event.severity === 'success' && 'bg-emerald-50'
                        )}
                      >
                        {/* Event Icon */}
                        <div
                          className={cn(
                            'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                            event.severity === 'info' && 'bg-blue-400',
                            event.severity === 'warning' && 'bg-amber-400',
                            event.severity === 'success' && 'bg-emerald-400'
                          )}
                        />

                        {/* Event Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'font-medium',
                                event.severity === 'info' && 'text-slate-700',
                                event.severity === 'warning' && 'text-amber-700',
                                event.severity === 'success' && 'text-emerald-700'
                              )}
                            >
                              {event.message}
                            </span>
                          </div>
                          {event.details && (
                            <p className="mt-0.5 text-slate-500 truncate">
                              {event.details}
                            </p>
                          )}
                        </div>

                        {/* Timestamp */}
                        <span className="shrink-0 text-slate-400">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-[calc(100vh-220px)] flex-col items-center justify-center text-center">
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
  );
}
