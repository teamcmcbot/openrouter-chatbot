'use client'

import { Toaster as HotToaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'

export default function Toaster() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    // Check if dark mode is enabled
    const checkDarkMode = () => {
      //setIsDarkMode(document.documentElement.classList.contains('dark'))
      setIsDarkMode(
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      )
    }

    // Initial check
    checkDarkMode()

    // Listen for theme changes
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <HotToaster
      position="top-center"
      containerStyle={{
        top: '5.5rem', // Position below the sticky header (h-16 = 4rem + margin)
      }}
      toastOptions={{
        duration: 5000,
        style: {
          background: isDarkMode ? '#111827' : '#f9fafb', // dark:bg-gray-900 / bg-gray-50
          color: isDarkMode ? '#f3f4f6' : '#111827', // dark:text-gray-300 / text-gray-900
          border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb', // dark:border-gray-700 / border-gray-200
          borderRadius: '0.5rem', // rounded-lg
          maxWidth: '28rem', // max-w-md
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
        success: {
          style: {
            background: isDarkMode ? '#14532d' : '#f0fdf4', // dark:bg-green-900/20 / bg-green-50
            color: isDarkMode ? '#bbf7d0' : '#166534', // dark:text-green-200 / text-green-800
            border: isDarkMode ? '1px solid #166534' : '1px solid #bbf7d0', // dark:border-green-800 / border-green-200
          },
          iconTheme: {
            primary: isDarkMode ? '#4ade80' : '#22c55e', // dark:text-green-400 / text-green-500
            secondary: isDarkMode ? '#14532d' : '#f0fdf4', // dark:bg-green-900/20 / bg-green-50
          },
        },
      }}
    />
  )
}