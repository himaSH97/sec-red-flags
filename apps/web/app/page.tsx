'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PreChatChecklistModal } from '@/components/pre-chat-checklist-modal';
import { socketService } from '@/lib/socket';
import { MessageSquare, Shield, Zap, List, Settings } from 'lucide-react';
import { toast } from 'sonner';

export default function Home() {
  const router = useRouter();
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  const handleStartChat = () => {
    console.log('Starting chat...');
    // Always show the checklist modal - the toggle only affects face verification API,
    // not the pre-chat checks (display, screen share, camera)
    setShowChecklistModal(true);
  };

  const handleChecklistComplete = (capturedFace: string) => {
    console.log('Checklist complete, storing face and navigating...');

    // Store the captured face in sessionStorage
    sessionStorage.setItem('referenceFace', capturedFace);

    // Disconnect any existing connection (chat page will create new one)
    socketService.disconnect();

    // Close the modal
    setShowChecklistModal(false);

    // Show toast and navigate
    toast.success('All checks passed!', {
      description: 'Connecting to chat...',
      duration: 2000,
    });

    // Navigate to chat page
    router.push('/chat');
  };

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
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => router.push('/sessions')}
                className="gap-2"
              >
                <List className="h-4 w-4" />
                Sessions
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push('/admin')}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Admin
              </Button>
            </div>
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

      {/* Pre-Chat Checklist Modal */}
      <PreChatChecklistModal
        open={showChecklistModal}
        onOpenChange={setShowChecklistModal}
        onComplete={handleChecklistComplete}
      />
    </main>
  );
}
