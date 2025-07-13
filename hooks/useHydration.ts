// hooks/useHydration.ts

import { useEffect, useState } from 'react';

/**
 * Hook to track client-side hydration status
 * Useful for preventing SSR mismatches with localStorage
 */
export const useHydration = () => {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated;
};
