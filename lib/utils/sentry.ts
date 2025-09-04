// lib/utils/sentry.ts
// Minimal, server-only Sentry wrapper. No-op unless enabled.

type CaptureCtx = { requestId?: string; route?: string; model?: string };

// Minimal shapes to avoid importing Sentry types
interface SentryScope { setTag(key: string, value: string): void }
interface SentryModule {
  init(opts: {
    dsn?: string;
    environment?: string;
    tracesSampleRate?: number;
    replaysSessionSampleRate?: number;
    beforeSend?: (event: unknown) => unknown;
  }): void;
  captureException(err: unknown): string;
  withScope(cb: (scope: SentryScope) => void): void;
}

let inited = false;
let sentryMod: SentryModule | null = null;
let initPromise: Promise<void> | null = null;

function isServer() {
  return typeof window === 'undefined';
}

function isEnabled() {
  if (!isServer()) return false;
  if (process.env.NODE_ENV === 'test') return false;
  const devOptIn = process.env.SENTRY_ENABLE_DEV === 'true';
  const envOk = process.env.NODE_ENV === 'production' || devOptIn;
  const hasDsn = !!process.env.SENTRY_DSN;
  return envOk && hasDsn;
}

type SentryEvent = { request?: { headers?: Record<string, unknown>; data?: unknown }; extra?: Record<string, unknown> };
function scrubEvent(event: SentryEvent) {
  try {
    // Remove/blank sensitive fields commonly seen
    const redactKeys = [
      'authorization', 'cookie', 'cookies', 'set-cookie', 'x-api-key', 'x-openai-key',
      'prompt', 'prompts', 'response', 'responses', 'headers', 'token', 'tokens', 'access_token',
    ];

    // Headers
    if (event && event.request && event.request.headers && typeof event.request.headers === 'object') {
      for (const k of Object.keys(event.request.headers)) {
        if (redactKeys.includes(k.toLowerCase())) {
          event.request.headers[k] = '[redacted]';
        }
      }
    }

    // Request data
    if (event && event.request && 'data' in event.request) {
      event.request.data = '[redacted]';
    }

    // Extra/context
    if (event && event.extra && typeof event.extra === 'object') {
      for (const k of Object.keys(event.extra)) {
        if (redactKeys.includes(k.toLowerCase())) {
          event.extra[k] = '[redacted]';
        }
      }
    }
  } catch {
    // swallow
  }
  return event;
}

function initOnce() {
  if (inited) return;
  if (!isEnabled()) return;
  if (initPromise) return;
  // Use standard dynamic import. If the package isn't installed in certain envs,
  // the isEnabled() guard prevents this path from running.
  initPromise = import('@sentry/node')
    .then((mod: unknown) => {
      const Sentry = mod as unknown as SentryModule;
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENV || process.env.NODE_ENV,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        beforeSend(event: unknown) {
          return scrubEvent((event || {}) as SentryEvent);
        },
      });
      sentryMod = Sentry;
      inited = true;
    })
    .catch(() => {
      inited = false;
      sentryMod = null;
    })
    .finally(() => {
      initPromise = null;
    });
}

// Attempt eager init on module load so the first error isn't dropped in dev
try { initOnce(); } catch {}

function doCapture(err: unknown, ctx?: CaptureCtx): string | undefined {
  try {
    if (!sentryMod) return undefined;
    let eventId: string | undefined;
    sentryMod.withScope((scope: SentryScope) => {
      if (ctx?.requestId) scope.setTag('requestId', ctx.requestId);
      if (ctx?.route) scope.setTag('route', ctx.route);
  if (ctx?.model) scope.setTag('model', ctx.model);
      eventId = sentryMod!.captureException(err instanceof Error ? err : new Error(String(err)));
    });
    return eventId;
  } catch {
    return undefined;
  }
}

export function capture(error: unknown, ctx?: CaptureCtx): string | undefined {
  try {
    if (!isEnabled()) return undefined;
    initOnce();
    // If Sentry is ready, capture immediately
    if (sentryMod) return doCapture(error, ctx);
    // If init is still in-flight, schedule a deferred capture (fire-and-forget)
    if (initPromise) {
      initPromise.then(() => {
        try { if (sentryMod) doCapture(error, ctx); } catch {}
      });
    }
    // Return undefined eventId for immediate caller; event will still be sent after init
    return undefined;
  } catch {
    return undefined;
  }
}

// Pre-initialize at module load to reduce first-error race conditions in dev/prod.
// This is a no-op if disabled or already initialized.
initOnce();
