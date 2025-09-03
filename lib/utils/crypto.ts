// lib/utils/crypto.ts
import { logger } from './logger';

/**
 * Compute HMAC-SHA256(secret, data) and return hex string
 */
export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  if (!secret) throw new Error('Missing HMAC secret');

  try {
    if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
      return bufferToHex(new Uint8Array(sig));
    }
  } catch {
    // fall through to node crypto
    logger.debug('WebCrypto HMAC failed, falling back to node crypto');
  }

  const { createHmac } = await import('crypto');
  return createHmac('sha256', secret).update(data).digest('hex');
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive anon_hash from anonymous_session_id using ANON_USAGE_HMAC_SECRET.
 * Returns a lowercase hex string.
 */
export async function deriveAnonHash(anonymousSessionId: string): Promise<string> {
  const secret = process.env.ANON_USAGE_HMAC_SECRET || '';
  if (!secret) {
    throw new Error('Server misconfigured: missing ANON_USAGE_HMAC_SECRET');
  }
  return hmacSha256Hex(secret, anonymousSessionId);
}
