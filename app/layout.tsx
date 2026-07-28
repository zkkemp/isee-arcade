import type { Metadata, Viewport } from 'next';
import DailyLimitProvider from '@/components/DailyLimitProvider';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://isee-arcade.vercel.app'),
  title: {
    default: 'ISEE Arcade',
    template: '%s · ISEE Arcade',
  },
  description:
    'A family learning arcade with real games, adaptive study practice, and progress that follows every learner.',
  applicationName: 'ISEE Arcade',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'ISEE Arcade',
    title: 'ISEE Arcade · Real games. Smarter practice.',
    description:
      'Study, play, and build progress that follows every learner in one family learning arcade.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ISEE Arcade · Real games. Smarter practice.',
    description:
      'Study, play, and build progress that follows every learner in one family learning arcade.',
  },
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
        <DailyLimitProvider>{children}</DailyLimitProvider>
      </body>
    </html>
  );
}
