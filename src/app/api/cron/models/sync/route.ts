import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../../../lib/utils/logger';

export const runtime = 'nodejs';

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  const expected = cronSecret ? `Bearer ${cronSecret}` : '';
  logger.debug('cron.models.sync.auth_check', {
    route: '/api/cron/models/sync',
    headerPresent: Boolean(authHeader),
    headerLength: authHeader.length,
    secretPresent: Boolean(cronSecret),
    secretLength: cronSecret?.length ?? 0,
    headerMatchesExpected: expected ? authHeader === expected : false,
  });
  if (!expected || authHeader !== expected) return unauthorized();

  const baseUrl = new URL(req.url).origin;

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

  const res = await fetch(`${baseUrl}/api/internal/sync-models`, { method: 'POST', headers, body });
  const text = await res.text();
  const out = new NextResponse(text, { status: res.status });
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('Content-Type', res.headers.get('content-type') || 'application/json');
  return out;
}
