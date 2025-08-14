'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../stores/useUIStore'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const mediaQueryRef = useRef<MediaQueryList | null>(null)
  const [systemDark, setSystemDark] = useState<boolean>(false)

  // Setup system preference listener once
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryRef.current = mq
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    setSystemDark(mq.matches)
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [])

  // Apply theme to <html> element
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const effectiveDark = theme === 'system' ? systemDark : theme === 'dark'

    if (effectiveDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme, systemDark])

  return <>{children}</>
}
