'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from '../../stores/useUIStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { fetchUserData } from '../../lib/services/user-data'

export default function ThemeInitializer() {
  const { theme, setTheme } = useTheme()
  const isInitialized = useRef(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated || isInitialized.current) return
    isInitialized.current = true

    // Fetch theme once after sign-in and apply if different
    ;(async () => {
      try {
        const data = await fetchUserData()
        const raw = data?.preferences?.ui?.theme as string | undefined
        const serverTheme = raw === 'light' ? 'light' : 'dark'
        if (serverTheme !== theme) {
          setTheme(serverTheme)
        }
      } catch (e) {
        // non-fatal
        console.warn('ThemeInitializer: failed to fetch user data for theme', e)
      }
    })()
  }, [isAuthenticated, theme, setTheme])

  return null
}
