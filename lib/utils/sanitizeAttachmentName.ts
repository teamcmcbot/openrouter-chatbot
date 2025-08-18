// lib/utils/sanitizeAttachmentName.ts

/**
 * Sanitize a filename for display/alt text: strip extension, remove unsafe chars,
 * collapse whitespace, trim, and clamp length. Returns null if empty/unsafe.
 */
export function sanitizeAttachmentName(raw?: string | null, maxLen = 64): string | null {
  if (!raw) return null;
  try {
    // Strip directory fragments
    const justName = raw.split(/[\\/]/).pop() || raw;
    // Strip extension (keep base)
    const base = justName.replace(/\.[^.]+$/, "");
  // Remove unsafe characters, allow letters, numbers, spaces, dashes, underscores
  let cleaned = base.replace(/[^\p{L}\p{N}\s_\-]+/gu, "");
    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    if (cleaned.length > maxLen) cleaned = cleaned.slice(0, maxLen).trim();
    return cleaned;
  } catch {
    return null;
  }
}

/** Create a fallback label like Image01, Image02, ... (1-indexed) */
export function fallbackImageLabel(index: number): string {
  const n = Math.max(1, Math.floor(index + 1));
  return `Image${String(n).padStart(2, "0")}`;
}
