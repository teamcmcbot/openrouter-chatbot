"use client";

import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { useChat } from "../../hooks/useChat";
import { useModelSelection } from "../../hooks/useModelSelection";
import ErrorDisplay from "../ui/ErrorDisplay";
import ModelDropdown from "../ui/ModelDropdown";

export default function ChatInterface() {
  const { messages, isLoading, error, sendMessage, clearError } = useChat();
  const { availableModels, selectedModel, setSelectedModel } = useModelSelection();

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              AI Assistant
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Powered by OpenRouter
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {availableModels.length > 0 && (
              <ModelDropdown
                models={availableModels}
                selectedModel={selectedModel}
                onModelSelect={setSelectedModel}
              />
            )}
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {messages.length} messages
            </div>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 min-h-0">
        <MessageList 
          messages={messages} 
          isLoading={isLoading}
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 sm:px-6 py-2">
          <ErrorDisplay
            message={error}
            type="error"
            onRetry={clearError}
          />
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <MessageInput 
          onSendMessage={(message) => sendMessage(message, selectedModel)}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}
