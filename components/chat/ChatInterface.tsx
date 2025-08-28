"use client";

import { useState } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { 
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
import { useAuth } from "../../stores/useAuthStore";
import { useUserData } from "../../hooks/useUserData";
import TierBadge from "../ui/TierBadge";
import { useChatStreaming } from "../../hooks/useChatStreaming";

export default function ChatInterface() {
  const { 
    messages, 
    isLoading, 
    sendMessage, 
  // error,  // Use per-conversation message error instead of global error
  retryLastMessage,
    isStreaming,
    streamingContent,
    streamingReasoning,
    streamingReasoningDetails,
    streamingAnnotations
  } = useChatStreaming();
  const createConversation = useChatStore((state) => state.createConversation);
  const { 
    availableModels, 
    selectedModel, 
    setSelectedModel, 
    isLoading: modelsLoading
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
  // Control for the model dropdown from child actions (e.g., MessageInput banner)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelDropdownPreset, setModelDropdownPreset] = useState<'all' | 'free' | 'paid' | 'multimodal' | 'reasoning' | undefined>(undefined);
  // NEW: Track reasoning enablement state for conditional display
  const [lastReasoningEnabled, setLastReasoningEnabled] = useState<boolean>(false);

  // Ephemeral per-conversation banner (session-only)
  const { conversationErrorBanners, currentConversationId, clearConversationErrorBanner } = useChatStore();
  const activeBanner = currentConversationId ? conversationErrorBanners[currentConversationId] : undefined;
  const lastFailedUserMessage = activeBanner
    ? [...messages].slice().reverse().find((m) => m.id === activeBanner.messageId && m.role === 'user')
    : undefined;

  // Retry function to resend the last failed user message
  const handleRetry = () => {
    // Do not clear global error; per-message retry methods will clear the message's error flag
    // Dismiss the banner for this conversation before retrying
    if (currentConversationId) clearConversationErrorBanner(currentConversationId);
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
        
  // Only auto-open sidebar on desktop/tablet (lg breakpoint and above)
        // On mobile, let users manually open it via the info icon
  const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
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
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 1024; // matches lg breakpoint
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

  // Account tier indicator (Anonymous | Free | Pro | Enterprise)
  const { isAuthenticated } = useAuth();
  const { data: userData } = useUserData({ enabled: !!isAuthenticated });
  const accountTier = isAuthenticated
    ? (userData?.profile.subscription_tier || 'free')
    : 'anonymous';
  const accountType = isAuthenticated ? (userData?.profile.account_type || 'user') : 'user';
  // Tier label now rendered by TierBadge

  // Determine if the last failed message should show a retry action
  const shouldShowRetry = (() => {
    if (!lastFailedUserMessage) return false;
    if (lastFailedUserMessage.retry_available === false) return false;
    // Non-retryable error codes
    const nonRetryableCodes = new Set([
      'bad_request',
      'forbidden',
      'unauthorized',
      'method_not_allowed',
      'not_found',
      'unprocessable_entity',
      'payload_too_large',
      'token_limit_exceeded',
      'feature_not_available',
      'tier_upgrade_required',
    ]);
    const code = (lastFailedUserMessage.error_code || '').toLowerCase();
    if (code && nonRetryableCodes.has(code)) return false;
    // Heuristic for streaming errors where code may be missing
    const msg = (lastFailedUserMessage.error_message || '').toLowerCase();
    const nonRetryableByText = [
      'character limit',
      'web search is available for pro and enterprise',
      'reasoning is available for enterprise',
      'attachment limit exceeded',
      'unsupported attachment type',
      'does not support image input',
    ];
    if (nonRetryableByText.some((s) => msg.includes(s))) return false;
    return true;
  })();

  return (
    <div className="flex h-full overflow-visible mobile-safe-area">
  {/* Left Sidebar - Chat History (15%) */}
  <div className="hidden lg:block w-[15%] min-w-[200px]">
        <ChatSidebar
          isOpen={true}
          onClose={() => {}} // Not used on desktop
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main Chat Area (70%) */}
  <div className="flex flex-col flex-1 lg:w-[70%] min-w-0 bg-slate-50 dark:bg-gray-800">
        {/* Header */}
  <div id="chat-header" className="relative z-30 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
          {/* Mobile layout (< lg): two-cluster row; right cluster can wrap Enhanced to next line */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between gap-2">
              {/* Left cluster: hamburger + model selector */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={handleToggleChatSidebar}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg flex-shrink-0"
                  aria-label="Toggle chat sidebar"
                >
                  <Bars3Icon className="w-5 h-5" />
                </button>
        {availableModels.length > 0 && (
                  <div className="min-w-0 sm:transform sm:scale-[1.05]">
                    <ModelDropdown
                      models={availableModels}
                      selectedModel={selectedModel}
                      onModelSelect={handleModelSelect}
                      isLoading={modelsLoading}
                      onShowDetails={handleShowDetails}
          open={isModelDropdownOpen}
          onOpenChange={setIsModelDropdownOpen}
          presetFilter={modelDropdownPreset}
                    />
                  </div>
                )}
              </div>

              {/* Right cluster: messages + account tier; wraps with right alignment */}
              <div className="flex flex-col items-end gap-1 text-xs text-gray-500 dark:text-gray-400 max-w-full">
                <div className="whitespace-nowrap">{messages.length} messages</div>
                <TierBadge tier={accountTier} side="bottom" align="end" accountType={accountType} />
              </div>
            </div>
          </div>

          {/* Desktop/tablet layout: model selector left, meta right (>= lg) */}
          <div className="hidden lg:flex items-center justify-between">
            <div className="flex items-center gap-3">
      {availableModels.length > 0 && (
                <div className="transform scale-[1.05]">
                  <ModelDropdown
                    models={availableModels}
                    selectedModel={selectedModel}
                    onModelSelect={handleModelSelect}
                    isLoading={modelsLoading}
                    onShowDetails={handleShowDetails}
        open={isModelDropdownOpen}
        onOpenChange={setIsModelDropdownOpen}
        presetFilter={modelDropdownPreset}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {messages.length} messages
              </div>
              <TierBadge tier={accountTier} side="bottom" align="end" accountType={accountType} />
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
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            streamingReasoning={streamingReasoning}
            streamingReasoningDetails={streamingReasoningDetails}
            streamingAnnotations={streamingAnnotations}
            reasoningEnabled={lastReasoningEnabled}
          />
        </div>

    {/* Error Display (per-conversation) */}
  {activeBanner && lastFailedUserMessage && (
          <div className="px-4 sm:px-6 py-2">
            <ErrorDisplay
              message={activeBanner.message || lastFailedUserMessage.error_message || 'Message failed. Please try again.'}
      type={'error'}
      title={'Error'}
        onRetry={shouldShowRetry ? handleRetry : undefined}
      code={lastFailedUserMessage.error_code || activeBanner.code}
      retryAfter={lastFailedUserMessage.retry_after || activeBanner.retryAfter}
      onClose={() => currentConversationId && clearConversationErrorBanner(currentConversationId)}
            />
          </div>
        )}

  {/* Input Area */}
  <div className="border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 sm:pb-2">
          <MessageInput 
            onSendMessage={(message, options) => {
              // NEW: Track reasoning enablement for conditional display
              setLastReasoningEnabled(!!options?.reasoning);
              // Dismiss current conversation's visible error banner when a new message is sent
              if (currentConversationId) clearConversationErrorBanner(currentConversationId);
              // Pass through to store; store will include options downstream in API body
              sendMessage(message, selectedModel, options);
              setSelectedPrompt(""); // Clear the selected prompt after sending
            }}
            disabled={isLoading}
            initialMessage={selectedPrompt}
            onOpenModelSelector={(preset) => {
              setModelDropdownPreset(preset ?? 'all');
              setIsModelDropdownOpen(true);
            }}
          />
        </div>
      </div>

  {/* Right Sidebar - Model Details (15%) */}
  <div className="hidden lg:block w-[15%] min-w-[240px]">
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
        className="lg:hidden"
      />

      {/* Mobile Model Details Sidebar */}
  <div className="lg:hidden">
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
