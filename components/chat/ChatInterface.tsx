"use client";

import { useState } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { 
  useChat, 
  useChatStore, 
  useModelSelection, 
  useDetailsSidebar, 
  useChatSidebarState 
} from "../../stores";
import ErrorDisplay from "../ui/ErrorDisplay";
import ModelDropdown from "../ui/ModelDropdown";
import { ModelDetailsSidebar } from "../ui/ModelDetailsSidebar";
import { ChatSidebar } from "../ui/ChatSidebar";
import { ModelInfo } from "../../lib/types/openrouter";
import { Bars3Icon } from "@heroicons/react/24/outline";

export default function ChatInterface() {
  const { messages, isLoading, error, sendMessage, clearError, retryLastMessage } = useChat();
  const createConversation = useChatStore((state) => state.createConversation);
  const { 
    availableModels, 
    selectedModel, 
    setSelectedModel, 
    isLoading: modelsLoading, 
    isEnhanced 
  } = useModelSelection();

  // UI state from Zustand store
  const {
    selectedDetailModel,
    isDetailsSidebarOpen,
    selectedTab,
    selectedGenerationId,
    hoveredGenerationId,
    showModelDetails,
    closeDetailsSidebar,
    setHoveredGenerationId,
  } = useDetailsSidebar();

  const {
    isChatSidebarOpen,
    toggleChatSidebar,
  } = useChatSidebarState();

  // Local state for scroll behavior (transient, doesn't need to be in store)
  const [scrollToCompletionId, setScrollToCompletionId] = useState<string | undefined>(undefined);
  // Local state for prompt selection
  const [selectedPrompt, setSelectedPrompt] = useState<string>("");

  // Retry function to resend the last user message
  const handleRetry = () => {
    // Clear the error first, then retry the last message
    clearError();
    retryLastMessage();
  };

  const handleShowDetails = (model: ModelInfo) => {
    showModelDetails(model);
  };

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    
    // Automatically update the details sidebar when a model is selected
    if (availableModels.length > 0) {
      const selectedModelInfo = availableModels.find(model => 
        typeof model === 'string' ? model === modelId : model.id === modelId
      );
      
      if (selectedModelInfo && typeof selectedModelInfo === 'object') {
        // Clear generation ID when switching models and show details
        showModelDetails(selectedModelInfo, 'overview', undefined);
        
        // Only auto-open sidebar on desktop (xl breakpoint and above)
        // On mobile, let users manually open it via the info icon
        const isDesktop = window.matchMedia('(min-width: 1280px)').matches;
        if (!isDesktop) {
          closeDetailsSidebar(); // Don't auto-open on mobile
        }
      }
    }
  };

  const handleCloseDetailsSidebar = () => {
    closeDetailsSidebar();
  };

  const handleModelClickFromMessage = (modelId: string, tab: 'overview' | 'pricing' | 'capabilities' = 'overview', generationId?: string) => {
    // Find the model info from available models
    if (availableModels.length > 0) {
      const modelInfo = availableModels.find(model => 
        typeof model === 'string' ? model === modelId : model.id === modelId
      );
      
      if (modelInfo && typeof modelInfo === 'object') {
        showModelDetails(modelInfo, tab, generationId);
      }
    }
  };

  const handleGenerationHover = (generationId: string | undefined) => {
    setHoveredGenerationId(generationId);
  };

  const handleGenerationClick = (generationId: string) => {
    setScrollToCompletionId(generationId);
    // Clear the scroll trigger after a short delay
    setTimeout(() => setScrollToCompletionId(undefined), 500);
  };

  const focusMessageInput = () => {
    // Focus and select the message input if present
    if (typeof document !== 'undefined') {
      const textarea = document.getElementById('message-input') as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
        textarea.select();
      }
    }
  };

  const handleNewChat = () => {
    // Create a new conversation using the store
    createConversation();

    // On mobile, dismiss the chat sidebar and focus the input
    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 1280; // matches xl breakpoint
    let delay = 0;
    if (isMobileViewport && isChatSidebarOpen) {
      toggleChatSidebar();
      // Wait for sidebar transition (~300ms) before focusing to avoid iOS focus glitches
      delay = 320;
    }

    // Defer focus slightly to ensure the input is mounted and visible
    window.setTimeout(focusMessageInput, delay);
  };

  const handleToggleChatSidebar = () => {
    toggleChatSidebar();
  };

  const handlePromptSelect = (prompt: string) => {
    setSelectedPrompt(prompt);
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-gray-800 overflow-visible mobile-safe-area">
      {/* Left Sidebar - Chat History (15%) */}
      <div className="hidden xl:block w-[15%] min-w-[200px]">
        <ChatSidebar
          isOpen={true}
          onClose={() => {}} // Not used on desktop
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main Chat Area (70%) */}
      <div className="flex flex-col flex-1 xl:w-[70%] min-w-0">
    {/* Header */}
  <div className="relative z-30 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-gray-700 bg-slate-50/95 dark:bg-gray-800 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                onClick={handleToggleChatSidebar}
                className="xl:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg"
                aria-label="Toggle chat sidebar"
              >
                <Bars3Icon className="w-5 h-5" />
              </button>
              
                <div className="hidden sm:block">
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                  AI Assistant
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Powered by OpenRouter
                </p>
                </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {availableModels.length > 0 && (
                <ModelDropdown
                  models={availableModels}
                  selectedModel={selectedModel}
                  onModelSelect={handleModelSelect}
                  isLoading={modelsLoading}
                  enhanced={isEnhanced}
                  onShowDetails={handleShowDetails}
                />
              )}
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {messages.length} messages
                {isEnhanced && (
                  <span className="ml-1 text-violet-500 dark:text-violet-300">
                    • Enhanced
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 min-h-0">
          <MessageList 
            messages={messages} 
            isLoading={isLoading}
            onModelClick={handleModelClickFromMessage}
            hoveredGenerationId={hoveredGenerationId}
            scrollToCompletionId={scrollToCompletionId}
            onPromptSelect={handlePromptSelect}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="px-4 sm:px-6 py-2">
            <ErrorDisplay
              message={error.message}
              type={error.code === 'too_many_requests' ? 'warning' : 'error'}
              title={error.code === 'too_many_requests' ? 'Rate Limited' : 'Error'}
              onRetry={handleRetry}
              onClose={clearError}
              suggestions={error.suggestions}
              retryAfter={error.retryAfter}
              code={error.code}
            />
          </div>
        )}

        {/* Input Area */}
  <div className="border-t border-slate-200 dark:border-gray-700 bg-slate-50/95 dark:bg-gray-800 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
          <MessageInput 
            onSendMessage={(message) => {
              sendMessage(message, selectedModel);
              setSelectedPrompt(""); // Clear the selected prompt after sending
            }}
            disabled={isLoading}
            initialMessage={selectedPrompt}
          />
        </div>
      </div>

      {/* Right Sidebar - Model Details (15%) */}
      <div className="hidden xl:block w-[15%] min-w-[240px]">
        <ModelDetailsSidebar
          model={selectedDetailModel}
          isOpen={true} // Always open on desktop
          onClose={handleCloseDetailsSidebar}
          initialTab={selectedTab}
          generationId={selectedGenerationId}
          onGenerationHover={handleGenerationHover}
          onGenerationClick={handleGenerationClick}
          variant="desktop"
        />
      </div>

      {/* Mobile Chat Sidebar */}
      <ChatSidebar
        isOpen={isChatSidebarOpen}
        onClose={() => toggleChatSidebar()}
        onNewChat={handleNewChat}
        className="xl:hidden"
      />

      {/* Mobile Model Details Sidebar */}
      <div className="xl:hidden">
        <ModelDetailsSidebar
          model={selectedDetailModel}
          isOpen={isDetailsSidebarOpen}
          onClose={handleCloseDetailsSidebar}
          initialTab={selectedTab}
          generationId={selectedGenerationId}
          onGenerationHover={handleGenerationHover}
          onGenerationClick={handleGenerationClick}
          variant="mobile"
        />
      </div>
    </div>
  );
}
