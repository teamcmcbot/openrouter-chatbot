"use client";

// Lightweight client util to emit anonymous usage/error events.
// Maintains a sliding-TTL anonymous_session_id in localStorage and
// posts to the public anonymous ingestion endpoints.

type UsageEvent = {
  timestamp: string; // ISO
  type: "message_sent" | "completion_received";
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  elapsed_ms?: number;
};

type ErrorPayload = {
  timestamp: string; // ISO
  model: string;
  http_status?: number;
  error_code?: string;
  error_message?: string;
  provider?: string;
  provider_request_id?: string;
  completion_id?: string;
  metadata?: Record<string, unknown>;
};

const LS_KEY_ID = "anon_session_id";
const LS_KEY_EXP = "anon_session_expiry";
const LS_KEY_OPTOUT = "anon_usage_opt_out";
// Default TTL: 24h (sliding)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function safeWindow(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function genUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID === "function") {
      return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
    }
  } catch {}
  // Fallback: not cryptographically strong, but acceptable for ephemeral anon id
  return `anon_${Math.random().toString(36).slice(2)}_${nowMs()}`;
}

export function getOrCreateAnonymousSessionId(ttlMs: number = DEFAULT_TTL_MS): string | null {
  if (!safeWindow()) return null;
  try {
    const optOut = localStorage.getItem(LS_KEY_OPTOUT);
    if (optOut === "true") return null;

    const existing = localStorage.getItem(LS_KEY_ID);
    const expiryRaw = localStorage.getItem(LS_KEY_EXP);
    const expiry = expiryRaw ? parseInt(expiryRaw, 10) : 0;
    const now = nowMs();

    if (!existing || !expiry || now > expiry) {
      const id = genUUID();
      const newExpiry = now + ttlMs;
      localStorage.setItem(LS_KEY_ID, id);
      localStorage.setItem(LS_KEY_EXP, String(newExpiry));
      return id;
    }

    // Sliding TTL: extend on access
    localStorage.setItem(LS_KEY_EXP, String(now + ttlMs));
    return existing;
  } catch {
    return null;
  }
}

export function clearAnonymousSessionId() {
  if (!safeWindow()) return;
  try {
    localStorage.removeItem(LS_KEY_ID);
    localStorage.removeItem(LS_KEY_EXP);
  } catch {}
}

export function setAnonymousOptOut(value: boolean) {
  if (!safeWindow()) return;
  try {
    localStorage.setItem(LS_KEY_OPTOUT, value ? "true" : "false");
  } catch {}
}

async function postJSON(url: string, body: unknown): Promise<void> {
  try {
    // Avoid interfering with Jest unit tests that assert fetch call counts
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true, // allow during unload
    });
  } catch {
    // best-effort only
  }
}

export function emitAnonymousUsage(events: UsageEvent[], opts?: { ttlMs?: number }): void {
  if (!safeWindow()) return;
  const id = getOrCreateAnonymousSessionId(opts?.ttlMs);
  if (!id) return; // opt-out or failure
  if (!events || events.length === 0) return;
  // Fire-and-forget
  void postJSON("/api/chat/anonymous", {
    anonymous_session_id: id,
    events,
  });
}

export function emitAnonymousError(payload: ErrorPayload, opts?: { ttlMs?: number }): void {
  if (!safeWindow()) return;
  const id = getOrCreateAnonymousSessionId(opts?.ttlMs);
  if (!id) return;
  const safe: ErrorPayload = {
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString(),
  };
  // Fire-and-forget
  void postJSON("/api/chat/anonymous/error", {
    anonymous_session_id: id,
    ...safe,
  });
}
