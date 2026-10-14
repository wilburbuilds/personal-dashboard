import type { Metadata, Viewport } from 'next';
import { Familjen_Grotesk, Hanken_Grotesk, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { getSettings } from '@/lib/settings.mjs';

export const dynamic = 'force-dynamic';
import './globals.css';
import './home.css';
import './home-v2.css';

const display = Familjen_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const ui = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Home',
  description: 'Your private household dashboard: today, projects, systems, budget, and notes.',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/apple-touch-icon.png',
  },
};
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0F1312' }, { media: '(prefers-color-scheme: light)', color: '#DDE3E1' }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const st = getSettings();
  const fonts = st.webFonts ? `${display.variable} ${ui.variable} ${mono.variable}` : '';
  return (
    <html lang="en" className={fonts} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" storageKey="hd-theme-v4" defaultTheme="system" forcedTheme={st.theme === 'system' ? undefined : st.theme} enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
