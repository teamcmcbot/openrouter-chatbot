'use client'

import { Toaster } from 'react-hot-toast'

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 5000,
        className:
          'bg-white text-black dark:bg-black dark:text-white border border-emerald-500',
        iconTheme: {
          primary: '#10b981',
          secondary: '#ffffff',
        },
      }}
    />
  )
}
