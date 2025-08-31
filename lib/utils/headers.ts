// lib/utils/headers.ts
// Utilities for robust header access across runtime and tests.

export function safeHeaderGet(headers: unknown, key: string): string | undefined {
  if (!headers) return undefined;
  const lowerKey = key.toLowerCase();
  try {
    const anyHeaders = headers as { get?: (k: string) => unknown };
    if (typeof anyHeaders.get === 'function') {
      let v = anyHeaders.get(key);
      if (v == null) v = anyHeaders.get(lowerKey);
      if (v == null) v = anyHeaders.get(key.toUpperCase());
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return (v[0] as string) ?? undefined;
      return v as string | undefined;
    }
  } catch {
    // ignore and try object access below
  }
  if (typeof headers === 'object') {
    const rec = headers as Record<string, unknown>;
    if (typeof rec[lowerKey] === 'string') return rec[lowerKey] as string;
    for (const k of Object.keys(rec)) {
      if (k.toLowerCase() === lowerKey) {
        const v = rec[k];
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return (v[0] as string) ?? undefined;
        return v as string | undefined;
      }
    }
  }
  return undefined;
}

export function deriveRequestIdFromHeaders(headers: unknown): string {
  const forwardedId = safeHeaderGet(headers, 'x-request-id') || safeHeaderGet(headers, 'x-correlation-id');
  return forwardedId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
