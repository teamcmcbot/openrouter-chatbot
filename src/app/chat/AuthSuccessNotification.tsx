'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function AuthSuccessNotification() {
  const searchParams = useSearchParams()
  const [showAuthSuccess, setShowAuthSuccess] = useState(false)

  useEffect(() => {
    if (searchParams.get('auth') === 'success') {
      setShowAuthSuccess(true)
      // Hide success message after 5 seconds
      const timer = setTimeout(() => setShowAuthSuccess(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  if (!showAuthSuccess) return null

  return (
    <div className="mb-4 mx-auto max-w-4xl">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3 dark:bg-green-900/20 dark:border-green-800">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            🎉 Successfully signed in! Your chat history will now be saved.
          </p>
        </div>
        <button
          onClick={() => setShowAuthSuccess(false)}
          className="flex-shrink-0 text-green-400 hover:text-green-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  )
}
