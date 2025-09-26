import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../../../lib/utils/logger';

export const runtime = 'nodejs';

const ROUTE = '/api/cron/models/sync';

function unauthorized(reason: string, context: Record<string, unknown> = {}) {
  logger.warn('cron.models.sync.unauthorized', {
    route: ROUTE,
    reason,
    ...context,
  });
  return new NextResponse('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return unauthorized('missing-cron-secret', {
      headerPresent: Boolean(authHeader),
      headerLength: authHeader.length,
    });
  }

  const expected = `Bearer ${cronSecret}`;
  const headerMatchesExpected = authHeader === expected;

  logger.debug('cron.models.sync.auth_check', {
    route: ROUTE,
    headerPresent: Boolean(authHeader),
    headerLength: authHeader.length,
    secretPresent: true,
    secretLength: cronSecret.length,
    headerMatchesExpected,
  });

  if (!authHeader) {
    return unauthorized('missing-authorization-header');
  }

  if (!headerMatchesExpected) {
    return unauthorized('mismatched-authorization-header', {
      headerLength: authHeader.length,
      secretLength: cronSecret.length,
    });
  }

  logger.debug('cron.models.sync.authorized', {
    route: ROUTE,
    headerLength: authHeader.length,
  });

  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    logger.error('cron.models.sync.misconfigured', {
      route: ROUTE,
      missing: 'BASE_URL',
    });
    return new NextResponse('Server misconfigured: missing BASE_URL', { status: 500 });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.INTERNAL_SYNC_TOKEN;
  const secret = process.env.INTERNAL_SYNC_SECRET;

  const bodyObj = { source: 'vercel-cron' };
  const body = JSON.stringify(bodyObj);

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (secret) {
    const { createHmac } = await import('crypto');
    headers['X-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
  } else {
    return new NextResponse('Server misconfigured: missing INTERNAL_SYNC_TOKEN/SECRET', { status: 500 });
  }

  logger.debug('cron.models.sync.forwarding', {
    route: ROUTE,
    baseUrl,
    target: '/api/internal/sync-models',
    hasAuthorization: Boolean(headers['Authorization']),
    authorizationLength: headers['Authorization']?.length ?? 0,
    hasSignature: Boolean(headers['X-Signature']),
    bodyLength: body.length,
  });

  const res = await fetch(`${baseUrl}/api/internal/sync-models`, { method: 'POST', headers, body });
  logger.debug('cron.models.sync.forwarding_response', {
    route: ROUTE,
    target: '/api/internal/sync-models',
    status: res.status,
  });
  const text = await res.text();
  const out = new NextResponse(text, { status: res.status });
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('Content-Type', res.headers.get('content-type') || 'application/json');
  return out;
}
