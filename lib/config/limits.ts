/**
 * Limits configuration helpers.
 * Provides a single source of truth for MAX_MESSAGE_CHARS across UI and API.
 */

// Parse an integer from env with fallback and basic sanity checks
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

/**
 * Resolves the max characters allowed for a user message.
 * - On client: reads NEXT_PUBLIC_MAX_MESSAGE_CHARS (inlined at build time)
 * - On server: reads MAX_MESSAGE_CHARS
 * - Default: 20000
 */
export function resolveMaxMessageChars(): number {
  // In Next.js, process.env is statically replaced on client builds
  const clientEnv = process.env.NEXT_PUBLIC_MAX_MESSAGE_CHARS;
  const serverEnv = process.env.MAX_MESSAGE_CHARS;
  // Prefer client env when present on the client; server env otherwise
  const preferred = typeof window === "undefined" ? serverEnv : clientEnv ?? serverEnv;
  return parsePositiveInt(preferred, 20000);
}

/**
 * Constant resolved at module import time. Safe to use in both client and server code.
 */
export const MAX_MESSAGE_CHARS = resolveMaxMessageChars();
