"use client";

import { useState } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { useChat } from "../../hooks/useChat";
import { useModelSelection } from "../../hooks/useModelSelection";
import ErrorDisplay from "../ui/ErrorDisplay";
import ModelDropdown from "../ui/ModelDropdown";
import { ModelDetailsSidebar } from "../ui/ModelDetailsSidebar";
import { ChatSidebar } from "../ui/ChatSidebar";
import { ModelInfo } from "../../lib/types/openrouter";
import { Bars3Icon } from "@heroicons/react/24/outline";

export default function ChatInterface() {
  const { messages, isLoading, error, sendMessage, clearError, clearMessageError } = useChat();
  const { 
    availableModels, 
    selectedModel, 
    setSelectedModel, 
    isLoading: modelsLoading, 
    isEnhanced 
  } = useModelSelection();

  // Retry function to resend the last user message
  const handleRetry = () => {
    // Find the last user message
    const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
    if (lastUserMessage) {
      // Clear the error flag from the failed message
      clearMessageError(lastUserMessage.id);
      
      // Clear the error first
      clearError();
      // Resend the last user message with the current selected model
      sendMessage(lastUserMessage.content, selectedModel);
    }
  };

  // Sidebar states
  const [selectedDetailModel, setSelectedDetailModel] = useState<ModelInfo | null>(null);
  const [isDetailsSidebarOpen, setIsDetailsSidebarOpen] = useState(false);
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'pricing' | 'capabilities'>('overview');
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | undefined>(undefined);
  const [hoveredGenerationId, setHoveredGenerationId] = useState<string | undefined>(undefined);
  const [scrollToCompletionId, setScrollToCompletionId] = useState<string | undefined>(undefined);

  const handleShowDetails = (model: ModelInfo) => {
    setSelectedDetailModel(model);
    setIsDetailsSidebarOpen(true);
  };

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    
    // Automatically update the details sidebar when a model is selected
    if (availableModels.length > 0) {
      const selectedModelInfo = availableModels.find(model => 
        typeof model === 'string' ? model === modelId : model.id === modelId
      );
      
      if (selectedModelInfo && typeof selectedModelInfo === 'object') {
        setSelectedDetailModel(selectedModelInfo);
        setSelectedGenerationId(undefined); // Clear generation ID when switching models
        
        // Only auto-open sidebar on desktop (md breakpoint and above)
        // On mobile, let users manually open it via the info icon
        const isDesktop = window.matchMedia('(min-width: 768px)').matches;
        if (isDesktop) {
          setIsDetailsSidebarOpen(true);
        }
      }
    }
  };

  const handleCloseDetailsSidebar = () => {
    setIsDetailsSidebarOpen(false);
    setSelectedDetailModel(null);
    setSelectedGenerationId(undefined);
  };

  const handleModelClickFromMessage = (modelId: string, tab: 'overview' | 'pricing' | 'capabilities' = 'overview', generationId?: string) => {
    // Find the model info from available models
    if (availableModels.length > 0) {
      const modelInfo = availableModels.find(model => 
        typeof model === 'string' ? model === modelId : model.id === modelId
      );
      
      if (modelInfo && typeof modelInfo === 'object') {
        setSelectedDetailModel(modelInfo);
        setSelectedTab(tab);
        setSelectedGenerationId(generationId);
        setIsDetailsSidebarOpen(true);
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

  const handleNewChat = () => {
    // Clear messages and start new chat
    window.location.reload(); // Simple implementation - in a real app, you'd use proper state management
  };

  const handleToggleChatSidebar = () => {
    setIsChatSidebarOpen(!isChatSidebarOpen);
  };

  return (
    <div className="flex h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      {/* Left Sidebar - Chat History (15%) */}
      <div className="hidden md:block w-[15%] min-w-[200px]">
        <ChatSidebar
          isOpen={true}
          onClose={() => {}} // Not used on desktop
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main Chat Area (70%) */}
      <div className="flex flex-col flex-1 md:w-[70%] min-w-0">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                onClick={handleToggleChatSidebar}
                className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg"
                aria-label="Toggle chat sidebar"
              >
                <Bars3Icon className="w-5 h-5" />
              </button>
              
              <div>
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
                  <span className="ml-1 text-violet-500 dark:text-violet-400">
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
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <MessageInput 
            onSendMessage={(message) => sendMessage(message, selectedModel)}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Right Sidebar - Model Details (15%) */}
      <div className="hidden md:block w-[15%] min-w-[240px]">
        <ModelDetailsSidebar
          model={selectedDetailModel}
          isOpen={true} // Always open on desktop
          onClose={handleCloseDetailsSidebar}
          initialTab={selectedTab}
          generationId={selectedGenerationId}
          onGenerationHover={handleGenerationHover}
          onGenerationClick={handleGenerationClick}
        />
      </div>

      {/* Mobile Chat Sidebar */}
      <ChatSidebar
        isOpen={isChatSidebarOpen}
        onClose={() => setIsChatSidebarOpen(false)}
        onNewChat={handleNewChat}
        className="md:hidden"
      />

      {/* Mobile Model Details Sidebar */}
      <div className="md:hidden">
        <ModelDetailsSidebar
          model={selectedDetailModel}
          isOpen={isDetailsSidebarOpen}
          onClose={handleCloseDetailsSidebar}
          initialTab={selectedTab}
          generationId={selectedGenerationId}
          onGenerationHover={handleGenerationHover}
          onGenerationClick={handleGenerationClick}
        />
      </div>
    </div>
  );
}
