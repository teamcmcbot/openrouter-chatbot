// hooks/useAuth.ts
'use client'

import { useAuth as useAuthContext } from '../contexts/AuthContext'

export const useAuth = () => {
  return useAuthContext()
}

// Additional auth-related hooks can be added here
export const useUser = () => {
  const { user } = useAuth()
  return user
}

export const useSession = () => {
  const { session } = useAuth()
  return session
}

export const useIsAuthenticated = () => {
  const { user } = useAuth()
  return !!user
}
