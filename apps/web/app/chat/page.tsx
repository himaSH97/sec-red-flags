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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type VerificationStatus = 'pending' | 'verified' | 'failed' | 'checking';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const verificationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false); // Track if we've already initialized
  const isCleaningUpRef = useRef(false); // Track if cleanup is intentional

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
