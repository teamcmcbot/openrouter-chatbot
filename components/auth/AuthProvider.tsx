// components/auth/AuthProvider.tsx
'use client'

import { useEffect } from 'react'
import { useAuthStore } from '../../stores/useAuthStore'
import { useChatSync } from '../../hooks/useChatSync'

interface AuthProviderProps {
  children: React.ReactNode
}

/**
 * Simple auth provider that initializes the auth store and chat sync
 * This replaces the complex AuthContext with a simple initialization component
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const initialize = useAuthStore((state) => state.initialize)
  const isInitialized = useAuthStore((state) => state.isInitialized)
  
  // Initialize chat sync - this will handle user state changes automatically
  useChatSync()

  useEffect(() => {
    if (!isInitialized) {
      console.log('Initializing auth store...')
      initialize()
    }
  }, [isInitialized, initialize])

  return <>{children}</>
}
