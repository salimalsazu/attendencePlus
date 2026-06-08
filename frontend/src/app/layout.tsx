import type { Metadata } from 'next';
import { ColorSchemeScript } from '@mantine/core';
import { Providers } from './providers';
import { AppLayout } from '@/components/AppLayout';
import { AuthProvider } from '@/components/AuthProvider';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';

export const metadata: Metadata = {
  title: 'AttendTrack Pro',
  description: 'Attendance management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body style={{ margin: 0 }}>
        <Providers>
          <AuthProvider>
            <AppLayout>{children}</AppLayout>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
