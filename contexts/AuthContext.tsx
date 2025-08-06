// contexts/AuthContext.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '../lib/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)

  // Initialize Supabase client
  useEffect(() => {
    try {
      console.log('AuthProvider: Initializing Supabase client...')
      const client = createClient()
      setSupabase(client)
      console.log('AuthProvider: Supabase client initialized successfully')
    } catch (error) {
      console.error('AuthProvider: Failed to initialize Supabase client:', error)
      setLoading(false)
    }
  }, [])

  // Initialize auth when Supabase client is ready
  useEffect(() => {
    if (!supabase) {
      console.log('AuthContext: Waiting for Supabase client...')
      return
    }

    console.log('AuthContext: Starting auth initialization...')
    
    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log('AuthContext: Getting initial session...')
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('AuthContext: Error getting session:', error)
        } else {
          console.log('AuthContext: Initial session:', session ? 'Found' : 'None')
        }
        
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        console.log('AuthContext: Initial auth state set, loading = false')
      } catch (err) {
        console.error('AuthContext: Exception in getInitialSession:', err)
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    console.log('AuthContext: Setting up auth state change listener...')
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('AuthContext: Auth state change:', event, session ? 'with session' : 'no session')
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Handle sign in success
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('User signed in:', session.user.email)
          // TODO: Create/update user profile in database
          // TODO: Migrate anonymous conversations
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          console.log('User signed out')
          // TODO: Clear user-specific data
          // TODO: Revert to anonymous mode
        }
      }
    )

    return () => {
      console.log('AuthContext: Cleaning up auth listener...')
      subscription.unsubscribe()
    }
  }, [supabase])

  const signInWithGoogle = async () => {
    if (!supabase) {
      console.error('Supabase client not initialized')
      throw new Error('Auth not ready')
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    if (error) {
      console.error('Error signing in with Google:', error)
      throw error
    }
  }

  const signOut = async () => {
    if (!supabase) {
      console.error('Supabase client not initialized')
      throw new Error('Auth not ready')
    }
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signInWithGoogle,
    signOut
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
