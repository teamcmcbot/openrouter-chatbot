// components/auth/SimpleAuthButton.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase/client'
import { User } from '@supabase/supabase-js'
import Button from '../ui/Button'

export function SimpleAuthButton() {
  const [showModal, setShowModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true)
      console.log('Starting Google sign-in...')
      
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        console.error('Google sign-in error:', error)
        alert(`Sign-in error: ${error.message}`)
      } else {
        console.log('Google sign-in initiated:', data)
        setShowModal(false) // Close modal as redirect will happen
      }
    } catch (err) {
      console.error('Unexpected error during sign-in:', err)
      alert('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  if (authLoading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        Loading...
      </Button>
    )
  }

  if (user) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Hi, {user.email?.split('@')[0]}!
        </span>
        <Button onClick={handleSignOut} variant="ghost" size="sm">
          Sign Out
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button
        onClick={() => {
          console.log('Sign in button clicked!')
          // Option 1: Show modal first (current behavior)
          setShowModal(true)
          
          // Option 2: Direct redirect (uncomment line below and comment line above)
          // handleGoogleSignIn()
        }}
        variant="primary"
        size="sm"
        loading={isLoading}
      >
        Sign In
      </Button>
      {showModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => {
            console.log('Backdrop clicked, closing modal')
            setShowModal(false)
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '8px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
              Welcome to OpenRouter Chat
            </h2>
            <p style={{ margin: '0 0 1.5rem 0', color: '#666' }}>
              Sign in to save your chat history and personalize your experience.
            </p>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                style={{
                  backgroundColor: '#4285f4',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  opacity: isLoading ? 0.7 : 1
                }}
              >
                {isLoading ? (
                  <>
                    <div style={{ 
                      width: '16px', 
                      height: '16px', 
                      border: '2px solid #ffffff', 
                      borderTop: '2px solid transparent', 
                      borderRadius: '50%', 
                      animation: 'spin 1s linear infinite' 
                    }} />
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
              onClick={() => setShowModal(false)}
              style={{
                backgroundColor: 'transparent',
                color: '#666',
                padding: '0.5rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                width: '100%'
              }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
