// components/auth/AuthButton.tsx
'use client'

import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { UserMenu } from './UserMenu'
import { SignInModal } from './SignInModal'
import Button from '../ui/Button'

export function AuthButton() {
  const { user, loading } = useAuth()
  const [showSignInModal, setShowSignInModal] = useState(false)

  // Debug logging
  console.log('AuthButton render:', { user, loading, showSignInModal })

  if (loading) {
    return (
      <div className="w-20 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
    )
  }

  if (user) {
    return <UserMenu />
  }

  return (
    <>
      <Button
        onClick={() => {
          console.log('Sign In button clicked')
          setShowSignInModal(true)
        }}
        variant="primary"
        size="sm"
      >
        Sign In
      </Button>
      <SignInModal
        isOpen={showSignInModal}
        onClose={() => {
          console.log('Modal close called')
          setShowSignInModal(false)
        }}
      />
    </>
  )
}
