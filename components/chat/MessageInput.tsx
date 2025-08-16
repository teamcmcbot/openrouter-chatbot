"use client";

import { useState, useEffect, useRef } from "react";
import type React from "react";
import { PaperAirplaneIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface MessageInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean;
  initialMessage?: string;
}

export default function MessageInput({ onSendMessage, disabled = false, initialMessage }: Readonly<MessageInputProps>) {
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const composingRef = useRef(false);

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

  // Detect mobile/touch devices to adjust Enter behavior
  useEffect(() => {
    const checkIsMobile = () => {
      if (typeof window === "undefined") return false;
      // Heuristics: coarse pointer OR small viewport width
      const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      const smallViewport = window.innerWidth <= 768; // tailwind md breakpoint
      return coarse || smallViewport;
    };

    const update = () => setIsMobile(checkIsMobile());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On mobile, Enter should insert newline (do not send). Users tap the Send button to submit.
    // On desktop, Enter sends (unless Shift is held for newline).
    if (e.key === "Enter" && !e.shiftKey) {
      // If IME composition is active, don't treat Enter as submit
      // (covers languages like Chinese/Japanese/Korean).
  if (e.nativeEvent.isComposing || composingRef.current) {
        return;
      }
      if (isMobile) {
        // Allow default newline behavior on mobile
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 sm:px-6 py-4">
      <div className="flex items-start space-x-4">
        <div className="flex-1">
          <textarea
            id="message-input"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => (composingRef.current = true)}
            onCompositionEnd={() => (composingRef.current = false)}
            placeholder="Type your message..."
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
            rows={1}
            style={{
              minHeight: "48px",
              maxHeight: "120px",
            }}
            enterKeyHint="send"
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
          {isMobile
            ? "Tap Send to send • Return for new line"
            : "Press Enter to send • Shift+Enter for new line"}
        </span>
      </div>
    </div>
  );
}
