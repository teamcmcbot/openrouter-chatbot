// Lightweight URL helpers for UI rendering

export function getDomainFromUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Prefer Google's gstatic favicon service (PNG) for broad compatibility
export function getFaviconUrl(rawUrl: string | undefined | null, size: 16 | 24 | 32 = 16): string | null {
  const domain = getDomainFromUrl(rawUrl);
  if (!domain) return null;
  const safeSize = Math.max(16, Math.min(size, 64));
  return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=${safeSize}`;
}
