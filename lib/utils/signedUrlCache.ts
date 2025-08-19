// lib/utils/signedUrlCache.ts

/** sessionStorage-based cache for short-lived signed URLs */
const KEY = (id: string) => `att:${id}`;

export function getCachedSignedUrl(id: string): string | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY(id));
  if (!raw) return null;
  try {
    const { url, expiresAt } = JSON.parse(raw) as { url: string; expiresAt: number };
    if (Date.now() < (expiresAt - 5000)) return url; // 5s skew
  } catch {}
  return null;
}

export function setCachedSignedUrl(id: string, url: string, ttlMs = 300_000): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY(id), JSON.stringify({ url, expiresAt: Date.now() + Math.max(0, ttlMs - 5000) }));
  } catch {}
}

export async function fetchSignedUrl(id: string): Promise<string> {
  const cached = getCachedSignedUrl(id);
  if (cached) return cached;
  const res = await fetch(`/api/attachments/${id}/signed-url`);
  if (!res.ok) throw new Error('signed_url_failed');
  const data = await res.json();
  const url = data?.signedUrl as string;
  const ttl = (data?.ttlSeconds ?? 300) * 1000;
  setCachedSignedUrl(id, url, ttl);
  return url;
}
