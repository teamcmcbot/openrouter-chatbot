"use client";

import { useState, KeyboardEvent, useEffect } from "react";
import { PaperAirplaneIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface MessageInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean;
  initialMessage?: string;
}

export default function MessageInput({ onSendMessage, disabled = false, initialMessage }: Readonly<MessageInputProps>) {
  const [message, setMessage] = useState("");

  // Update message when initialMessage prop changes
  useEffect(() => {
    if (initialMessage) {
      setMessage(initialMessage);
      // Focus and select the textarea
      const textarea = document.getElementById('message-input') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.select();
      }
    }
  }, [initialMessage]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
      // Reset textarea height responsively and focus/select
      setTimeout(() => {
        const textarea = document.getElementById('message-input') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = "auto";
          textarea.style.height = textarea.scrollHeight + "px";
        }
      }, 0);
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
            id="message-input"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
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
          className="flex-shrink-0 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 h-12"
          aria-label="Send message"
        >
          {disabled ? (
            <ArrowPathIcon className="w-5 h-5 animate-spin" />
          ) : (
            <PaperAirplaneIcon className="w-5 h-5" />
          )}
        </button>
      </div>
      
      {/* Character count and hint */}
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {message.length > 0 && `${message.length} characters`}
        </span>
        <span className="hidden sm:inline">
          Press Enter to send • Shift+Enter for new line
        </span>
      </div>
    </div>
  );
}
