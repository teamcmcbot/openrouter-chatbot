// app/auth/callback/route.ts
import { createClient } from '../../../../lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSafeReturnTo } from '../../../../lib/utils/returnTo'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/chat' // legacy param support
  const returnToRaw = searchParams.get('returnTo')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Determine safe redirect target (query param first, then cookie fallback)
      const cookieJar = await cookies()
      const cookieVal = cookieJar.get('post_sign_in_redirect')?.value
      const cookieDecoded = cookieVal ? decodeURIComponent(cookieVal) : null
      const target = getSafeReturnTo(returnToRaw) || getSafeReturnTo(cookieDecoded) || next
      // Clear cookie after use
      cookieJar.set({ name: 'post_sign_in_redirect', value: '', expires: new Date(0), path: '/' })
      return NextResponse.redirect(`${origin}${target}`)
    }
  }

  // If there's an error, redirect to an error page or back to login
  return NextResponse.redirect(`${origin}/auth/error`)
}
