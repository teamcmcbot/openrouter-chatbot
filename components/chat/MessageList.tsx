"use client";

import { useEffect, useRef, memo, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ChatMessage } from "../../lib/types/chat";
import { formatMessageTime } from "../../lib/utils/dateFormat";
import { useAuthStore } from "../../stores/useAuthStore";
import { 
  CustomCodeBlock, 
  CustomTable, 
  CustomBlockquote, 
  CustomLink, 
  CustomPreBlock 
} from "./markdown/MarkdownComponents";
import PromptTabs from "./PromptTabs";

// Memoized markdown component for better performance
const MemoizedMarkdown = memo(({ children }: { children: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
    components={{
      code: CustomCodeBlock,
      pre: CustomPreBlock,
      table: CustomTable,
      blockquote: CustomBlockquote,
      a: CustomLink,
    }}
  >
    {children}
  </ReactMarkdown>
));

MemoizedMarkdown.displayName = 'MemoizedMarkdown';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onModelClick?: (modelId: string, tab?: 'overview' | 'pricing' | 'capabilities', generationId?: string) => void;
  hoveredGenerationId?: string;
  scrollToCompletionId?: string; // Add scroll trigger prop
  onPromptSelect?: (prompt: string) => void;
}

export default function MessageList({ messages, isLoading, onModelClick, hoveredGenerationId, scrollToCompletionId, onPromptSelect }: Readonly<MessageListProps>) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  
  // Get user from auth store
  const user = useAuthStore((state) => state.user);

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const handleAvatarError = (avatarUrl: string) => {
    setFailedAvatars(prev => new Set(prev).add(avatarUrl));
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      const { scrollHeight, clientHeight } = messagesContainerRef.current;
      messagesContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  };

  // Function to scroll to a specific message by completion_id
  const scrollToMessage = (completionId: string) => {
    const messageElement = document.querySelector(`[data-completion-id="${completionId}"]`);
    if (messageElement && messagesContainerRef.current) {
      const containerTop = messagesContainerRef.current.offsetTop;
      const messageTop = (messageElement as HTMLElement).offsetTop;
      messagesContainerRef.current.scrollTop = messageTop - containerTop - 20; // 20px offset for better visibility
    }
  };

  // Scroll to message when scrollToCompletionId changes
  useEffect(() => {
    if (scrollToCompletionId) {
      const timeoutId = setTimeout(() => {
        scrollToMessage(scrollToCompletionId);
      }, 100); // Small delay to ensure DOM is ready
      
      return () => clearTimeout(timeoutId);
    }
  }, [scrollToCompletionId]);

  useEffect(() => {
    // Use a small delay to ensure the DOM has updated
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, isLoading]);


  return (
    <div 
      ref={messagesContainerRef}
  className="h-full overflow-y-auto px-4 sm:px-6 py-4 scroll-smooth"
    >
      <div className="space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-lg mb-2">Start a conversation</p>
            <p className="text-sm text-center max-w-md mb-6">
              Type a message to chat with the AI.
            </p>
            <PromptTabs onPromptSelect={onPromptSelect || (() => {})} />
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            data-completion-id={message.completion_id} // Add data attribute for scrolling
          >
            <div className={`flex w-full sm:max-w-[90%] lg:max-w-[85%] xl:max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar - Hidden on mobile (< sm breakpoint) */}
              <div className={`hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full items-center justify-center text-sm font-medium overflow-hidden ${
                message.role === "user"
                  ? "bg-emerald-600 text-white ml-3"
                  : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 mr-3"
              }`}>
                {message.role === "user" ? (
                  user?.user_metadata?.avatar_url && !failedAvatars.has(user.user_metadata.avatar_url) ? (
                    <Image
                      src={user.user_metadata.avatar_url}
                      alt="User Avatar"
                      width={32}
                      height={32}
                      className="w-full h-full rounded-full object-cover"
                      onError={() => handleAvatarError(user.user_metadata.avatar_url)}
                    />
                  ) : (
                    "ME"
                  )
                ) : (
                  "AI"
                )}
              </div>

        {/* Message Content */}
        <div className={`rounded-lg px-3 sm:px-4 py-2 transition-all duration-200 relative flex-1 sm:flex-initial ${
                message.role === "user"
                  ? `bg-emerald-600 text-white`
          : `bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-slate-200/80 dark:border-white/10 shadow-sm ${
                      hoveredGenerationId && message.completion_id === hoveredGenerationId
                        ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }`
              }`}>
                {/* LLM Model Tag for assistant */}
                {message.role === "assistant" && message.model && (
                  <button
                    onClick={() => onModelClick?.(message.model!, 'overview', undefined)}
                    className="inline-block mb-1 mr-2 px-2 py-0.5 text-xs font-semibold rounded bg-gray-300 dark:bg-gray-800 text-purple-800 dark:text-purple-300 align-middle hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    title={`View details for ${message.model}`}
                  >
                    {message.model}
                  </button>
                )}
                
                {/* Message Content - Conditional Markdown Rendering */}
                {message.contentType === "markdown" ? (
                  <div className="markdown-content">
                    <MemoizedMarkdown>
                      {message.content}
                    </MemoizedMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
                
                {/* Error icon for failed user messages */}
                {message.role === "user" && message.error && (
                  <div className="absolute -top-1 -left-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center" title="Message failed to send">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
                
                <div className="mt-2 flex flex-wrap items-start w-full gap-x-2 gap-y-1">
                  {/* Left column (Group 1 + Group 2) */}
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1 flex-grow min-w-0">
                    {/* Group 1: Time + Elapsed Time */}
                    <div className={`flex items-center text-xs ${message.role === "user" ? "text-white/80" : "text-gray-600 dark:text-gray-300"}`}> 
                      <span>{formatMessageTime(message.timestamp)}</span>
                      {message.role === "assistant" && typeof message.elapsed_ms === 'number' && message.elapsed_ms > 0 && (
                        <span className="ml-1">(Took {(message.elapsed_ms/1000).toFixed(1)}s)</span>
                      )}
                      {message.role === "user" && typeof message.input_tokens === 'number' && message.input_tokens > 0 && (
                        <span className="ml-1">
                          ({message.input_tokens} input tokens)
                        </span>
                      )}
                    </div>

                    {/* Group 2: Tokens Info */}
                    {message.role === "assistant" && (
                      <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
                        Input: {message.input_tokens || 0}, Output: {message.output_tokens || 0}, 
                        Total: {message.total_tokens} tokens
                      </div>
                    )}
                  </div>

                  {/* Group 3 (always on the far right or its own row) */}
                  {message.role === "assistant" && message.completion_id && (
                    <div className="flex items-center justify-between w-full md:w-auto md:flex-grow-0 md:ml-auto">
                      <button
                        onClick={() => onModelClick?.(message.model!, 'pricing', message.completion_id)}
                        className="text-xs underline hover:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer truncate max-w-[120px] md:max-w-[220px] block overflow-hidden whitespace-nowrap text-ellipsis"
                        title={message.completion_id} // Optional: show full ID on hover
                      >
                        {message.completion_id}
                      </button>
                      <button
                        onClick={() => handleCopyMessage(message.id, message.content)}
                        className="ml-2 p-1 rounded transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-300"
                        title={copiedMessageId === message.id ? "Copied!" : "Copy message"}
                      >
                        {copiedMessageId === message.id ? (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                  {/* Copy button for user messages (green bubble) */}
                  {message.role === "user" && (
                    <div className="flex items-center justify-end w-full md:w-auto md:flex-grow-0 md:ml-auto">
                      <button
                        onClick={() => handleCopyMessage(message.id, message.content)}
                        className="ml-2 p-1 rounded transition-colors hover:bg-emerald-700 text-white/80"
                        title={copiedMessageId === message.id ? "Copied!" : "Copy message"}
                      >
                        {copiedMessageId === message.id ? (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex w-full sm:max-w-[70%]">
              {/* Avatar - Hidden on mobile (< sm breakpoint) */}
              <div className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 items-center justify-center text-sm font-medium mr-3">
                AI
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 sm:px-4 py-2 flex-1 sm:flex-initial border border-slate-200/80 dark:border-white/10 shadow-sm">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
