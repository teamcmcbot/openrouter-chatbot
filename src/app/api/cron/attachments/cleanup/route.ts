import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  const expected = cronSecret ? `Bearer ${cronSecret}` : '';
  if (!expected || authHeader !== expected) return unauthorized();

  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    return new NextResponse('Server misconfigured: missing BASE_URL', { status: 500 });
  }

  const hours = Number(process.env.CRON_CLEANUP_HOURS || 24);
  const limit = Number(process.env.CRON_CLEANUP_LIMIT || 500);
  const dryRun = (process.env.CRON_CLEANUP_DRYRUN || '').toLowerCase() === 'true';
  const bodyObj = { hours, limit, dryRun, source: 'vercel-cron' };
  const body = JSON.stringify(bodyObj);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.INTERNAL_CLEANUP_TOKEN;
  const secret = process.env.INTERNAL_CLEANUP_SECRET;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (secret) {
    const { createHmac } = await import('crypto');
    headers['X-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
  } else {
    return new NextResponse('Server misconfigured: missing INTERNAL_CLEANUP_TOKEN/SECRET', { status: 500 });
  }

  const res = await fetch(`${baseUrl}/api/internal/attachments/cleanup`, { method: 'POST', headers, body });
  const text = await res.text();
  const out = new NextResponse(text, { status: res.status });
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('Content-Type', res.headers.get('content-type') || 'application/json');
  return out;
}
