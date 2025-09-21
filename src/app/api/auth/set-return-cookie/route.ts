import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSafeReturnTo } from '../../../../../lib/utils/returnTo';

const COOKIE_NAME = 'post_sign_in_redirect';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = typeof body?.returnTo === 'string' ? body.returnTo : null;
    const safe = getSafeReturnTo(input);
    const res = NextResponse.json({ ok: true, stored: !!safe });

    // Always clear before setting
    const cookieJar = await cookies();
    cookieJar.set({ name: COOKIE_NAME, value: '', expires: new Date(0), path: '/' });

    if (safe) {
      const ttlMinutes = 10;
      const expireAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      cookieJar.set({
        name: COOKIE_NAME,
        value: encodeURIComponent(safe),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: expireAt,
      });
    }
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
