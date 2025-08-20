'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from '../../stores/useUIStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useUserData } from '../../hooks/useUserData'

export default function ThemeInitializer() {
  const { theme, setTheme } = useTheme()
  const isInitialized = useRef(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { data: userData } = useUserData({ enabled: !!isAuthenticated })

  useEffect(() => {
    if (!isAuthenticated || isInitialized.current) return
    // Wait for userData to be populated; apply once
    if (!userData) return
    isInitialized.current = true

    const raw = userData?.preferences?.ui?.theme as string | undefined
    const serverTheme = raw === 'light' ? 'light' : 'dark'
    if (serverTheme !== theme) {
      setTheme(serverTheme)
    }
  }, [isAuthenticated, userData, theme, setTheme])

  return null
}
