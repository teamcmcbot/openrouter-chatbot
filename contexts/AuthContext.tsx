// contexts/AuthContext.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '../lib/supabase/client'
import { clearGenerationCache } from '../lib/utils/generationCache'
import { logger } from '../lib/utils/logger'

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
      logger.debug('auth.context.init.start')
      const client = createClient()
      setSupabase(client)
      logger.debug('auth.context.init.success')
    } catch (error) {
      logger.error('auth.context.init.failed', error)
      setLoading(false)
    }
  }, [])

  // Initialize auth when Supabase client is ready
  useEffect(() => {
    if (!supabase) {
      logger.debug('auth.context.waitingForClient')
      return
    }

    logger.debug('auth.context.authInit.start')
    
    // Get initial session
    const getInitialSession = async () => {
      try {
        logger.debug('auth.context.getSession.start')
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          logger.error('auth.context.getSession.error', error)
        } else {
          logger.debug('auth.context.getSession.success', { hasSession: !!session })
        }
        
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        logger.debug('auth.context.authState.initialized')
      } catch (err) {
        logger.error('auth.context.getSession.exception', err)
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    logger.debug('auth.context.listener.setup')
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        logger.debug('auth.context.stateChange', { event, hasSession: !!session })
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Handle sign in success
        if (event === 'SIGNED_IN' && session?.user) {
          logger.info('auth.context.signIn.success', { email: session.user.email })
          // TODO: Create/update user profile in database
          // TODO: Migrate anonymous conversations
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          logger.info('auth.context.signOut.success')
          // TODO: Clear user-specific data
          // TODO: Revert to anonymous mode
          try {
            clearGenerationCache()
          } catch (e) {
            logger.warn('auth.context.signOut.cacheCleanupFailed', e)
          }
        }
      }
    )

    return () => {
      logger.debug('auth.context.listener.cleanup')
      subscription.unsubscribe()
    }
  }, [supabase])

  const signInWithGoogle = async () => {
    if (!supabase) {
      logger.error('auth.context.signIn.clientNotReady')
      throw new Error('Auth not ready')
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    if (error) {
      logger.error('auth.context.signIn.googleError', error)
      throw error
    }
  }

  const signOut = async () => {
    if (!supabase) {
      logger.error('auth.context.signOut.clientNotReady')
      throw new Error('Auth not ready')
    }
    const { error } = await supabase.auth.signOut()
    if (error) {
      logger.error('auth.context.signOut.error', error)
      throw error
    }
    try {
      clearGenerationCache()
    } catch (e) {
      logger.warn('auth.context.signOut.cacheClearFailed', e)
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
