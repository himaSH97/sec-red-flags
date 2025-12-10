'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CameraModal } from '@/components/camera-modal';
import { socketService } from '@/lib/socket';
import { MessageSquare, Shield, Zap, List } from 'lucide-react';
import { toast } from 'sonner';

export default function Home() {
  const router = useRouter();
  const [showCameraModal, setShowCameraModal] = useState(false);

  const handleStartChat = () => {
    console.log('Starting chat...');
    setShowCameraModal(true);
  };

  const handleFaceCapture = (imageBase64: string) => {
    console.log('Face captured, storing and navigating...');

    // Store the captured face in sessionStorage
    sessionStorage.setItem('referenceFace', imageBase64);

    // Disconnect any existing connection (chat page will create new one)
    socketService.disconnect();

    // Show toast and navigate
    toast.success('Face captured!', {
      description: 'Connecting to chat...',
      duration: 2000,
    });

    // Navigate to chat page
    router.push('/chat');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up socket if navigating away
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-slate-700" />
              <span className="text-lg font-semibold text-slate-800">
                SecFlags
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={() => router.push('/sessions')}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              View Sessions
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center text-center">
          {/* Icon */}
          <div className="mb-8 rounded-2xl bg-slate-100 p-4">
            <MessageSquare className="h-12 w-12 text-slate-600" />
          </div>

          {/* Heading */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Secure Conversations
          </h1>

          {/* Subheading */}
          <p className="mb-8 max-w-lg text-lg text-slate-600">
            Start a conversation with our intelligent assistant. Face
            verification ensures your session stays secure.
          </p>

          {/* CTA Button */}
          <Button
            onClick={handleStartChat}
            size="lg"
            className="h-12 px-8 text-base font-medium shadow-lg shadow-slate-200 transition-all hover:shadow-xl hover:shadow-slate-300"
          >
            <MessageSquare className="mr-2 h-5 w-5" />
            Start Chat
          </Button>

          {/* Features */}
          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            <div className="flex flex-col items-center">
              <div className="mb-3 rounded-lg bg-slate-100 p-2">
                <Zap className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="mb-1 font-medium text-slate-800">Fast Response</h3>
              <p className="text-sm text-slate-500">
                Get instant answers to your questions
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div className="mb-3 rounded-lg bg-slate-100 p-2">
                <Shield className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="mb-1 font-medium text-slate-800">Face Verified</h3>
              <p className="text-sm text-slate-500">
                Periodic face checks keep sessions secure
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div className="mb-3 rounded-lg bg-slate-100 p-2">
                <MessageSquare className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="mb-1 font-medium text-slate-800">Intuitive</h3>
              <p className="text-sm text-slate-500">
                Natural conversation experience
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Modal */}
      <CameraModal
        open={showCameraModal}
        onOpenChange={setShowCameraModal}
        onCapture={handleFaceCapture}
      />
    </main>
  );
}
