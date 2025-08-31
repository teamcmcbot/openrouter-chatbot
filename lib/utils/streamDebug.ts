/**
 * Client-side streaming debug flag helper.
 *
 * Enable via either:
 * - localStorage.setItem('DEBUG_STREAMING', '1') (or 'true') at runtime
 * - NEXT_PUBLIC_DEBUG_STREAMING=1 at build/run time
 */
export function isStreamingDebugEnabled(): boolean {
  try {
    // Build-time public env (inlined by Next.js)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envFlag = (process as any)?.env?.NEXT_PUBLIC_DEBUG_STREAMING;
    if (typeof envFlag === 'string') {
      if (envFlag === '1' || envFlag.toLowerCase() === 'true') return true;
    }
    // Runtime localStorage flag (browser only)
    if (typeof window !== 'undefined') {
      const ls = window.localStorage?.getItem('DEBUG_STREAMING');
      if (ls && (ls === '1' || ls.toLowerCase() === 'true')) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function streamDebug(...args: unknown[]) {
  if (isStreamingDebugEnabled()) {
  console.warn('[STREAM-DEBUG]', ...args);
  }
}
