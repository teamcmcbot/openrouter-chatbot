// hooks/useIsomorphicLayoutEffect.ts

import { useEffect, useLayoutEffect } from 'react';
import { isServer } from '../stores/storeUtils';

/**
 * Use layoutEffect on client, useEffect on server
 * Prevents SSR hydration mismatches
 */
export const useIsomorphicLayoutEffect = isServer() ? useEffect : useLayoutEffect;
