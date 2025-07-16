// components/auth/SimpleAuthButton.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../../stores/useAuthStore'
import Button from '../ui/Button'

export function SimpleAuthButton() {
  const [showModal, setShowModal] = useState(false)
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    isInitialized,
    error,
    signInWithGoogle, 
    signOut,
    initialize,
    clearError 
  } = useAuth()

  // Initialize auth on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  const handleSignOut = async () => {
    try {
      await signOut()
      // signOut already handles redirect, so no need to do anything else
    } catch (err) {
      console.error('Sign out failed:', err)
      // Error is handled in the store
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      clearError() // Clear any previous errors
      await signInWithGoogle()
      setShowModal(false) // Close modal as redirect will happen
    } catch (err) {
      console.error('Sign in failed:', err)
      // Error is handled in the store and displayed via error state
      // Keep modal open to show error
    }
  }

  // Show loading state during initialization
  if (!isInitialized) {
    return (
      <Button variant="ghost" size="sm" disabled>
        Loading...
      </Button>
    )
  }

  // Show authenticated user state
  if (isAuthenticated && user) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Hi, {user.email?.split('@')[0]}!
        </span>
        <Button 
          onClick={handleSignOut} 
          variant="ghost" 
          size="sm"
          loading={isLoading}
        >
          Sign Out
        </Button>
      </div>
    )
  }

  // Show sign in button for non-authenticated users
  return (
    <>
      <Button
        onClick={() => {
          console.log('Sign in button clicked!')
          clearError() // Clear any previous errors
          setShowModal(true)
        }}
        variant="primary"
        size="sm"
        loading={isLoading}
      >
        Sign In
      </Button>
      {showModal && (
        <div 
          className="fixed inset-0 z-50 bg-black bg-opacity-50"
          onClick={() => {
            console.log('Backdrop clicked, closing modal')
            setShowModal(false)
            clearError() // Clear error when closing modal
          }}
        >
          <div className="min-h-screen flex items-center justify-center p-4">
            <div 
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-white-200 dark:border-white-700"
              onClick={(e) => e.stopPropagation()}
            >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
              Sign In
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
              Sign in to save your chat history and personalize your experience.
            </p>
            
            {/* Error display */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 dark:text-red-400 m-0">
                  {error}
                </p>
              </div>
            )}
            
            <div className="mb-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className={`
                  w-full flex items-center justify-center gap-3 px-4 py-3 
                  bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                  text-white font-medium rounded-lg transition-colors
                  disabled:cursor-not-allowed
                  ${isLoading ? 'opacity-70' : ''}
                `}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path fill="#fff" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                      <path fill="#fff" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-2.7.75 4.8 4.8 0 0 1-4.52-3.36H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                      <path fill="#fff" d="M4.46 10.41a4.8 4.8 0 0 1-.25-1.41c0-.49.09-.97.25-1.41V5.52H1.83a8 8 0 0 0 0 6.96l2.63-2.07z"/>
                      <path fill="#fff" d="M8.98 3.58c1.32 0 2.5.45 3.44 1.35l2.54-2.54A8 8 0 0 0 8.98 1a8 8 0 0 0-7.15 4.52l2.63 2.07c.61-1.8 2.26-3.01 4.52-3.01z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
            </div>
            
            <button
              onClick={() => {
                setShowModal(false)
                clearError()
              }}
              className="w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Maybe later
            </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
