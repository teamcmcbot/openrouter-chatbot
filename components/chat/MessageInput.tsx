"use client";

import { useState, KeyboardEvent } from "react";

interface MessageInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean;
}

export default function MessageInput({ onSendMessage, disabled = false }: Readonly<MessageInputProps>) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-6 py-4">
      <div className="flex items-start space-x-4">
        <div className="flex-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
            rows={1}
            style={{
              minHeight: "48px",
              maxHeight: "120px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "48px";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className="flex-shrink-0 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 h-12"
          aria-label="Send message"
        >
          {disabled ? (
            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0l4 4-4 4V4a4 4 0 00-4 4zm0 8a4 4 0 014-4v4H0l4-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
      
      {/* Character count and hint */}
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {message.length > 0 && `${message.length} characters`}
        </span>
        <span>
          Press Enter to send • Shift+Enter for new line
        </span>
      </div>
    </div>
  );
}
