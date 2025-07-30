'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'react-hot-toast'
import ChatInterface from "../../../components/chat/ChatInterface";

function ChatPageContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('auth') === 'success') {
      toast.success('🎉 Successfully signed in! Your chat history will now be saved.')
    }
  }, [searchParams])

  return (
    <div className="h-mobile-full bg-gray-100 dark:bg-gray-900 p-4 sm:p-6">
      <div className="h-full max-w-full mx-auto">
        <ChatInterface />
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="h-mobile-full bg-gray-100 dark:bg-gray-900 p-4 sm:p-6">
        <div className="h-full max-w-full mx-auto">
          <ChatInterface />
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
