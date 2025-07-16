// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export function createClient() {
  if (supabaseClient) {
    console.log('Supabase client: Using existing client')
    return supabaseClient
  }
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  console.log('Supabase client creation:', {
    url: url ? `${url.substring(0, 30)}...` : 'undefined',
    key: key ? `${key.substring(0, 20)}...` : 'undefined'
  })
  
  if (!url || !key) {
    console.error('Missing Supabase environment variables!')
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  
  supabaseClient = createBrowserClient(url, key)
  return supabaseClient
}

// Export a singleton instance for client-side use
export const supabase = createClient()
