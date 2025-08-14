import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import ErrorBoundary from "../../components/ui/ErrorBoundary";
import "./globals.css";
import { LogoWithText } from "../../components/ui/Logo";
import { AuthProvider } from "../../components/auth/AuthProvider";
import { SimpleAuthButton } from "../../components/auth/SimpleAuthButton";
import Toaster from "../../components/ui/Toaster";
import ThemeProvider from "../../contexts/ThemeProvider";
import ThemeInitializer from "../../components/system/ThemeInitializer";
import MainContainer from "../../components/layout/MainContainer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: process.env.BRAND_NAME || "OpenRouter Chatbot",
  description: "A modern chatbot powered by OpenRouter's AI models",
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.svg', sizes: '16x16', type: 'image/svg+xml' },
      { url: '/favicon-32x32.svg', sizes: '32x32', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'android-chrome-192x192',
        url: '/android-chrome-192x192.svg',
      },
      {
        rel: 'android-chrome-512x512',
        url: '/android-chrome-512x512.svg',
      },
    ],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // Important for devices with notches/dynamic islands
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-gray-900`}
      >
        {/* Pre-hydration script to avoid theme flash and prevent hydration mismatch */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function(){
              try {
                var key = 'openrouter-ui-preferences';
                var raw = localStorage.getItem(key);
                var stored = raw ? JSON.parse(raw) : null;
                var theme = stored && stored.state && stored.state.theme ? stored.state.theme : 'system';
                var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                var enableDark = theme === 'dark' || (theme === 'system' && prefersDark);
                var root = document.documentElement;
                if (enableDark) { root.classList.add('dark'); } else { root.classList.remove('dark'); }
              } catch (e) { /* no-op */ }
            })();
          `}
        </Script>
        <AuthProvider>
          <ErrorBoundary>
            <ThemeProvider>
            <div className="flex flex-col h-mobile-screen">
              <nav className="sticky top-0 z-50 border-b border-gray-200 bg-gray-50 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80 flex-shrink-0">
                <div className="w-full px-4 sm:px-6 lg:px-8">
                  <div className="flex h-16 items-center justify-between">
                    <div className="flex items-center">
                      {/* <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                        OpenRouter Chat
                      </Link> */}
                      <Link href="/" className="">
                        <LogoWithText size={32} />
                      </Link>
                    </div>
                    <div className="flex items-center space-x-4">
                      <SimpleAuthButton />
                    </div>
                  </div>
                </div>
              </nav>
              <MainContainer>{children}</MainContainer>
                <footer className="hidden sm:block border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 flex-shrink-0">
                <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                  <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                    <p>
                    &copy; 2025 {process.env.BRAND_NAME || "OpenRouter Chatbot"}. Powered by OpenRouter AI.
                    </p>
                  </div>
                </div>
                </footer>
            </div>
            <ThemeInitializer />
            </ThemeProvider>
            <Toaster />
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
