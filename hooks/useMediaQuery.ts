"use client";

import { useEffect, useState } from "react";

/**
 * Custom hook to detect media query matches with SSR-safe hydration.
 * 
 * @param query - Media query string (e.g., "(max-width: 767px)")
 * @returns Boolean indicating if the media query matches
 * 
 * @example
 * ```tsx
 * const isMobile = useMediaQuery('(max-width: 767px)');
 * return isMobile ? <MobileView /> : <DesktopView />;
 * ```
 */
export function useMediaQuery(query: string): boolean {
  // Initialize as false to match SSR (no window)
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Only run in browser (CSR)
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(query);
    
    // Set initial value
    setMatches(media.matches);

    // Create listener for changes
    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // Modern browsers
    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
    
    // Legacy browsers (Safari < 14)
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, [query]);

  return matches;
}

/**
 * Predefined breakpoint hooks for common use cases
 */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet = () => useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
