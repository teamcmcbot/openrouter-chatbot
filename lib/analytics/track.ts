// lib/analytics/track.ts
// Lightweight client-side analytics helper for CTA clicks

export type TrackCtaOptions = {
  page: string;
  cta_id: string;
  location?: string;
  meta?: Record<string, unknown>;
};

export async function trackCtaClick(opts: TrackCtaOptions) {
  try {
    // Fire-and-forget; don't block navigation
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    await fetch("/api/analytics/cta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "cta_click", ...opts }),
      signal: controller.signal,
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
    clearTimeout(timeout);
  } catch {
    // Silently ignore
  }
}
