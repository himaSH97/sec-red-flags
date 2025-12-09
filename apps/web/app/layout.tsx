import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: 'SecFlags Chat',
  description: 'Professional chat interface',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
