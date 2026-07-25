import type { Metadata, Viewport } from 'next';
import PasscodeGate from '@/components/PasscodeGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'ISEE Arcade',
  description: 'Arcade games that stop to quiz you on ISEE Lower Level practice questions.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'ISEE Arcade',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a14',
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom during play just fights the on-screen controls.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <PasscodeGate>{children}</PasscodeGate>
      </body>
    </html>
  );
}
