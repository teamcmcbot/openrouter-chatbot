// lib/middleware/internalAuth.ts
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../utils/logger';

/**
 * Internal job authentication middleware
 * - Accepts either:
 *   1) Authorization: Bearer <INTERNAL_SYNC_TOKEN>
 *   2) X-Signature: <hex(hmacSHA256(body, INTERNAL_SYNC_SECRET))>
 * - No user context; for server-to-server only.
 */
export function withInternalAuth<T extends NextRequest>(
  handler: (req: T) => Promise<NextResponse>
) {
  return async (req: T): Promise<NextResponse> => {
    try {
      // Read env
      const token = process.env.INTERNAL_SYNC_TOKEN || '';
      const secret = process.env.INTERNAL_SYNC_SECRET || '';

      // Fast path: Bearer token
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const provided = authHeader.slice('Bearer '.length).trim();
        if (!token) {
          logger.warn('Bearer token provided but INTERNAL_SYNC_TOKEN not set');
        } else if (timingSafeEqualStrings(provided, token)) {
          return handler(req);
        }
      }

      // HMAC path: X-Signature over raw body
      const signature = req.headers.get('x-signature') || req.headers.get('X-Signature');
      if (signature && secret) {
        const raw = await req.text();
        const computed = await hmacSha256Hex(secret, raw);
        if (timingSafeEqualStrings(signature, computed)) {
          // Re-create request since body was consumed
          const newReq = new Request(req.url, {
            method: req.method,
            headers: req.headers,
            body: raw,
          }) as T;
          return handler(newReq);
        }
      }

      logger.warn('Internal auth failed');
      return NextResponse.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          message: 'Invalid internal authorization',
        },
        { status: 401 }
      );
    } catch (error) {
      logger.error('Internal auth middleware error:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          code: 'INTERNAL_AUTH_ERROR',
          message: 'Failed to process internal authentication',
        },
        { status: 500 }
      );
    }
  };
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  // Use Web Crypto if available, else Node crypto
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
  } else {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', secret).update(data).digest('hex');
  }
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Timing-safe compare
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
