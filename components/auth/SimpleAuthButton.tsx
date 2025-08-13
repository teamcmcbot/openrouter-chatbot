// components/auth/SimpleAuthButton.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { UserIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon, ChatBubbleLeftRightIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../stores/useAuthStore'
import Button from '../ui/Button'
import UserSettings from '../ui/UserSettings'
import ClientPortal from '../ui/ClientPortal'
import { createClient } from '../../lib/supabase/client'

export function SimpleAuthButton() {
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
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

  // Detect admin role from profiles.account_type
  useEffect(() => {
    let isMounted = true
    async function fetchAccountType() {
      try {
        if (!user?.id) {
          if (isMounted) setIsAdmin(false)
          return
        }
        const supabase = createClient()
        const { data, error } = await supabase
          .from('profiles')
          .select('account_type')
          .eq('id', user.id)
          .single()
        if (error) {
          console.warn('Failed to fetch account_type:', error.message)
          if (isMounted) setIsAdmin(false)
          return
        }
        if (isMounted) setIsAdmin((data?.account_type as string) === 'admin')
      } catch (e) {
        console.warn('Error checking admin role:', e)
        if (isMounted) setIsAdmin(false)
      }
    }
    fetchAccountType()
    return () => {
      isMounted = false
    }
  }, [user?.id])

  // Close menu on outside click or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowMenu(false)
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEsc)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showMenu])

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
    const avatar = user.user_metadata?.avatar_url
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
    return (
      <div className="relative" ref={menuRef}>
        {/* Avatar-only trigger */}
        <button
          type="button"
          aria-label="User menu"
          disabled={isLoading}
          onClick={() => setShowMenu((v) => !v)}
          className="inline-flex items-center justify-center rounded-full p-0.5 ring-1 ring-gray-300 dark:ring-gray-600 hover:ring-emerald-500 transition focus:outline-none"
        >
          {avatar ? (
            <Image
              src={avatar}
              alt="Profile"
              width={28}
              height={28}
              className="rounded-full"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-gray-500 dark:text-gray-300" />
            </div>
          )}
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-50">
            {/* Header with user info */}
            <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-100 dark:border-gray-700">
              {avatar ? (
                <Image src={avatar} alt="Avatar" width={28} height={28} className="rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-gray-500 dark:text-gray-300" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">{displayName}</p>
                <p className="text-xs truncate text-gray-500 dark:text-gray-400">{user.email}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="py-1">
              {/* 1) Chat - visible to all authenticated users */}
              <Link
                href="/chat"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setShowMenu(false)}
              >
                <ChatBubbleLeftRightIcon className="w-4 h-4" />
                Chat
              </Link>

              {/* 2) View Usage - /usage/costs */}
              <Link
                href="/usage/costs"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setShowMenu(false)}
              >
                <ChartBarIcon className="w-4 h-4" />
                View Usage
              </Link>

              {/* 3) Settings */}
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowMenu(false)
                  setShowSettings(true)
                }}
              >
                <Cog6ToothIcon className="w-4 h-4" />
                Settings
              </button>

              {/* 4) Admin Console - admin only */}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setShowMenu(false)}
                >
                  <span className="inline-flex w-4 h-4 items-center justify-center">🏁</span>
                  Admin Console
                </Link>
              )}

              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={async () => {
                  setShowMenu(false)
                  await handleSignOut()
                }}
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Settings modal */}
        {showSettings && (
          <ClientPortal>
            <UserSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
          </ClientPortal>
        )}
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
              className="bg-gray-100 dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-white-200 dark:border-white-700"
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
