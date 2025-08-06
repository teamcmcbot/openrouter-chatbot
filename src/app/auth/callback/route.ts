// app/auth/callback/route.ts
import { createClient } from '../../../../lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/chat' // Redirect to chat instead of home

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Successful authentication, redirect to chat page with success indicator
      return NextResponse.redirect(`${origin}${next}?auth=success`)
    }
  }

  // If there's an error, redirect to an error page or back to login
  return NextResponse.redirect(`${origin}/auth/error`)
}
