'use client'

import { useEffect } from 'react'
import { useTheme } from '../stores/useUIStore'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()

  // Apply theme to <html> element (binary only)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const isDark = theme === 'dark'
    if (isDark) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  return <>{children}</>
}
