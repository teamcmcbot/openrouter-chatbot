'use client'

import { useEffect, useRef, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '../lib/supabase/client'
import toast from 'react-hot-toast'

export function useAuthSuccessToast() {
  const [isClient, setIsClient] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const hasShownToast = useRef(false)
  const hasCheckedAuth = useRef(false)

  useEffect(() => {
    // Ensure we're on the client side
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (isClient) {
      // Get user session directly from Supabase client
      const getUser = async () => {
        try {
          const supabase = createClient()
          const { data: { session }, error } = await supabase.auth.getSession()
          
          if (error) {
            console.error('Error getting session:', error)
          } else {
            setUser(session?.user || null)
          }
          setLoading(false)
        } catch (err) {
          console.error('Error getting user:', err)
          setLoading(false)
        }
      }

      getUser()
    }
  }, [isClient])

  useEffect(() => {
    // Only run this check once when the component mounts and auth is loaded, and only on client side
    if (isClient && !loading && !hasCheckedAuth.current && user) {
      hasCheckedAuth.current = true
      
      // Check if this is a new sign-in or a returning user
      const isNewUser = !user.user_metadata?.last_sign_in_at ||
                       new Date(user.user_metadata.last_sign_in_at).getTime() > Date.now() - 30000 // 30 second window
      
      // Get user's display name
      const displayName = user.user_metadata?.full_name ||
                         user.email?.split('@')[0] ||
                         'User'
      
      // Show appropriate toast message
      if (isNewUser) {
        toast.success(`Hello ${displayName}!`, {
          id: 'auth-success', // Prevent duplicate toasts
        })
      } else {
        toast.success(`Welcome back ${displayName}!`, {
          id: 'auth-success', // Prevent duplicate toasts
        })
      }
      
      hasShownToast.current = true
    }
  }, [user, loading, isClient])
}