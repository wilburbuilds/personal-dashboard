import type { Metadata, Viewport } from 'next';
import { Familjen_Grotesk, Hanken_Grotesk, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { homeConfig } from '@/lib/home-config.mjs';
import './globals.css';
import './home.css';
import './home-v2.css';

const display = Familjen_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const ui = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Home',
  description: 'Your private household dashboard: today, projects, systems, budget, and notes.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0B0E0D' }, { media: '(prefers-color-scheme: light)', color: '#CFD7D4' }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const fonts = homeConfig.webFonts ? `${display.variable} ${ui.variable} ${mono.variable}` : '';
  return (
    <html lang="en" className={fonts} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme={homeConfig.theme} enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
