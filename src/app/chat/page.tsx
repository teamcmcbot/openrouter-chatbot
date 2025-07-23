'use client'

import { Suspense } from 'react'
import ChatInterface from "../../../components/chat/ChatInterface";
import AuthSuccessNotification from './AuthSuccessNotification'

function ChatPageContent() {
  return (
    <div className="h-mobile-full bg-gray-100 dark:bg-gray-900 p-4 sm:p-6">
      <Suspense fallback={null}>
        <AuthSuccessNotification />
      </Suspense>
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
