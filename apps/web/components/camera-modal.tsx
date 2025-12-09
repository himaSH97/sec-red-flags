'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CameraModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (imageBase64: string) => void;
}

type CameraState = 'idle' | 'requesting' | 'active' | 'captured' | 'error';

export function CameraModal({ open, onOpenChange, onCapture }: CameraModalProps) {
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraState('requesting');
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraState('active');
      }
    } catch (error) {
      console.error('Camera error:', error);
      setCameraState('error');
      
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setErrorMessage('Camera access denied. Please allow camera access to continue.');
        } else if (error.name === 'NotFoundError') {
          setErrorMessage('No camera found. Please connect a camera and try again.');
        } else {
          setErrorMessage('Failed to access camera. Please try again.');
        }
      } else {
        setErrorMessage('An unexpected error occurred.');
      }
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Capture image from video
  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageBase64);
    setCameraState('captured');
  }, []);

  // Retake photo
  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    setCameraState('active');
  }, []);

  // Confirm and submit
  const confirmCapture = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage);
      stopCamera();
      onOpenChange(false);
    }
  }, [capturedImage, onCapture, onOpenChange, stopCamera]);

  // Start camera when modal opens
  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
      setCameraState('idle');
      setCapturedImage(null);
    }

    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Face Verification
          </DialogTitle>
          <DialogDescription>
            We need to capture your face for security verification during the chat session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera/Preview Area */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-900">
            {/* Video element (hidden when captured) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                'h-full w-full object-cover',
                cameraState === 'captured' && 'hidden'
              )}
            />

            {/* Captured image preview */}
            {cameraState === 'captured' && capturedImage && (
              <img
                src={capturedImage}
                alt="Captured face"
                className="h-full w-full object-cover"
              />
            )}

            {/* Canvas for capture (hidden) */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Loading state */}
            {cameraState === 'requesting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white">
                <Loader2 className="mb-2 h-8 w-8 animate-spin" />
                <p className="text-sm">Requesting camera access...</p>
              </div>
            )}

            {/* Idle state */}
            {cameraState === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white">
                <Camera className="mb-2 h-8 w-8" />
                <p className="text-sm">Initializing camera...</p>
              </div>
            )}

            {/* Error state */}
            {cameraState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-4 text-center text-white">
                <AlertCircle className="mb-2 h-8 w-8 text-red-400" />
                <p className="text-sm text-red-300">{errorMessage}</p>
              </div>
            )}

            {/* Face guide overlay */}
            {cameraState === 'active' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-36 rounded-full border-2 border-dashed border-white/50" />
              </div>
            )}
          </div>

          {/* Instructions */}
          {cameraState === 'active' && (
            <p className="text-center text-sm text-slate-500">
              Position your face within the oval and click capture
            </p>
          )}

          {/* Action buttons */}
          <div className="flex justify-center gap-3">
            {cameraState === 'error' && (
              <Button onClick={startCamera} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            )}

            {cameraState === 'active' && (
              <Button onClick={captureImage}>
                <Camera className="mr-2 h-4 w-4" />
                Capture
              </Button>
            )}

            {cameraState === 'captured' && (
              <>
                <Button onClick={retakePhoto} variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retake
                </Button>
                <Button onClick={confirmCapture}>
                  <Check className="mr-2 h-4 w-4" />
                  Continue
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

