'use client'

import { Suspense } from 'react'
import ChatInterface from "../../../components/chat/ChatInterface";
import { useAuthSuccessToast } from "../../../hooks/useAuthSuccessToast";

function AuthSuccessToastWrapper() {
  useAuthSuccessToast() // Check for auth success when chat page loads
  return null
}

function ChatPageContent() {
  return (
  <div className="h-full bg-slate-50 dark:bg-gray-900">
      <Suspense fallback={null}>
        <AuthSuccessToastWrapper />
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
  <div className="h-full bg-slate-50 dark:bg-gray-900">
        <div className="h-full max-w-full mx-auto">
          <ChatInterface />
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
