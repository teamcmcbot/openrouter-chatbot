'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase/client'
import { User } from '@supabase/supabase-js'

export function AuthStatus() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="text-sm text-gray-500">
        Loading...
      </div>
    )
  }

  if (user) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>Signed in as {user.email}</span>
        </div>
        <button
          onClick={async () => {
            const supabase = createClient()
            if (supabase) {
              await supabase.auth.signOut()
            }
            window.location.href = '/'
          }}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Sign out
        </button>
      </div>
    )
  }

  return null
}
