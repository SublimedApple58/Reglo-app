import '@/assets/styles/globals.css';
import { APP_DESCRIPTION, APP_NAME, SERVER_URL } from '@/lib/constants';
import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from '@/components/ui/toaster';

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  fallback: ['Circular', '-apple-system', 'system-ui', 'Helvetica Neue', 'sans-serif'],
});

// viewport-fit=cover: le barre fisse in basso (tab bar mobile) usano
// env(safe-area-inset-bottom) per stare sopra l'indicatore home di iOS.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    template: `%s | Reglo`,
    default: APP_NAME,
  },
  description: APP_DESCRIPTION,
  metadataBase: new URL(SERVER_URL),
  icons: {
    icon: '/images/favicon.png',
  },
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${figtree.variable} font-sans antialiased`}
        data-new-gr-c-s-check-loaded='14.1241.0'
        data-gr-ext-installed=''
      >
        <NextIntlClientProvider>
          <SessionProvider>
            {children}
            <Toaster />
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
