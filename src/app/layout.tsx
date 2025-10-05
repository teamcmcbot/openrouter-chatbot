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

const siteUrl = (`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}`).replace(/\/$/, "");
const brandName = process.env.BRAND_NAME || "GreenBubble";
const defaultTitle = `${brandName} | Secure OpenRouter-Powered AI Chat`;
const defaultDescription = `Secure chat workspace powered by OpenRouter. Access multiple AI models, manage team conversations, and keep your chat history safe with Supabase.`;
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: `%s | ${brandName}`,
  },
  description: defaultDescription,
  keywords: [
    "GreenBubble",
    "OpenRouter",
    "AI chat",
    "ChatGPT alternative",
    "multi-model AI",
    "secure chat workspace",
    "team collaboration",
    "persistent chat history",
  ],
  manifest: "/manifest.json",
  applicationName: brandName,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brandName,
  },
  openGraph: {
    type: "website",
    siteName: brandName,
    title: defaultTitle,
    description: defaultDescription,
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/web-app-manifest-512x512.png`,
        width: 512,
        height: 512,
        alt: `${brandName} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [`${siteUrl}/web-app-manifest-512x512.png`],
  },
  icons: {
    icon: [
      // SVG first - modern browsers prefer this (scalable, sharp at any size)
      { url: '/favicon.svg', type: 'image/svg+xml' },
      // PNG fallback for browsers that don't support SVG icons
      { url: '/icon1.png', sizes: '96x96', type: 'image/png' },
      // ICO fallback for legacy browsers
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "android-chrome-192x192",
        url: "/web-app-manifest-192x192.png",
      },
      {
        rel: "android-chrome-512x512",
        url: "/web-app-manifest-512x512.png",
      },
    ],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Important for devices with notches/dynamic islands
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
  <html lang="en" className="dark" suppressHydrationWarning>
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
    var theme = stored && stored.state && stored.state.theme ? stored.state.theme : 'dark';
    if (theme === 'system') theme = 'dark';
    var enableDark = theme === 'dark';
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
              <nav className="sticky top-0 z-50 border-b border-slate-200 bg-slate-100 dark:border-gray-800 dark:bg-gray-900 flex-shrink-0">
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
              {/* Footer: explicit height to match --footer-height for precise layout math at sm+ */}
              <footer className="hidden sm:flex h-[var(--footer-height)] border-t border-slate-200 bg-slate-100 dark:border-gray-800 dark:bg-gray-900 flex-shrink-0 items-center">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
                  <div className="text-center text-sm text-slate-600 dark:text-gray-400">
                    <p>
                      &copy; 2025 {process.env.BRAND_NAME || "GreenBubble"}. Powered by OpenRouter AI.
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
