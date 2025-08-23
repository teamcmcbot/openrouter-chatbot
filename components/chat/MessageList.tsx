"use client";

import { useEffect, useRef, memo, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ChatMessage } from "../../lib/types/chat";
import { formatMessageTime } from "../../lib/utils/dateFormat";
import { detectMarkdownContent } from "../../lib/utils/markdown";
import { useAuthStore } from "../../stores/useAuthStore";
import { 
  CustomCodeBlock, 
  CustomTable, 
  CustomBlockquote, 
  CustomLink, 
  CustomPreBlock 
} from "./markdown/MarkdownComponents";
import PromptTabs from "./PromptTabs";
import { fetchSignedUrl } from "../../lib/utils/signedUrlCache";
import { sanitizeAttachmentName, fallbackImageLabel } from "../../lib/utils/sanitizeAttachmentName";
import InlineAttachment from "./InlineAttachment";
import { getDomainFromUrl, getFaviconUrl } from "../../lib/utils/url";

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
  // Streaming support
  isStreaming?: boolean;
  streamingContent?: string;
  // NEW: Real-time reasoning support
  streamingReasoning?: string;
  streamingReasoningDetails?: Record<string, unknown>[];
}

export default function MessageList({ 
  messages, 
  isLoading, 
  onModelClick, 
  hoveredGenerationId, 
  scrollToCompletionId, 
  onPromptSelect,
  isStreaming = false,
  streamingContent = '',
  streamingReasoning = '', // NEW
  streamingReasoningDetails = [] // NEW
}: Readonly<MessageListProps>) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{ open: boolean; url?: string; alt?: string }>(() => ({ open: false }));
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(() => new Set());
  
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

  const handleOpenImage = async (attachmentId: string, alt?: string) => {
    try {
      const url = await fetchSignedUrl(attachmentId);
      setLightbox({ open: true, url, alt });
    } catch (e) {
      console.warn('Failed to open image', e);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox({ open: false });
    };
    if (lightbox.open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [lightbox.open]);


  return (
    <div 
      ref={messagesContainerRef}
  className="h-full overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 scroll-smooth"
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
  <div className={`rounded-lg px-3 sm:px-4 py-2 transition-all duration-200 relative flex-1 sm:flex-initial max-w-full ${message.role === "user" && message.error ? "overflow-visible" : "overflow-x-hidden"} ${
                message.role === "user"
                  ? `bg-emerald-600 text-white`
          : `bg-slate-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-slate-300/80 dark:border-white/10 shadow-sm ${
                      hoveredGenerationId && message.completion_id === hoveredGenerationId
                        ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }`
              }`}>
                {/* LLM Model Tag for assistant */}
                {message.role === "assistant" && message.model && (
                  <button
                    onClick={() => onModelClick?.(message.model!, 'overview', undefined)}
                    className="inline-block mb-1 mr-1 px-2 py-0.5 text-xs font-semibold rounded bg-gray-300 dark:bg-gray-800 text-purple-800 dark:text-purple-300 align-middle hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    title={`View details for ${message.model}`}
                  >
                    {message.model}
                  </button>
                )}
                {message.role === "assistant" && message.has_websearch && (
                  <span
                    className="inline-flex items-center mb-1 mr-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border border-blue-300/70 bg-blue-100 text-blue-700 shadow-sm align-middle dark:border-blue-300/30 dark:bg-blue-900/30 dark:text-blue-200"
                    title="Includes web search results"
                  >
                    Web Search
                  </span>
                )}
                
                {/* Reasoning (assistant) - show before content for better UX */}
                {message.role === "assistant" && (
                  (typeof message.reasoning === 'string' && message.reasoning.trim().length > 0) ||
                  (Array.isArray(message.reasoning_details) && message.reasoning_details.length > 0)
                ) && (
                  <div className="mb-3 border rounded-md bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300/80 dark:border-yellow-700/60">
                    <button
                      type="button"
                      aria-expanded={expandedReasoning.has(message.id)}
                      onClick={() => {
                        setExpandedReasoning(prev => {
                          const next = new Set(prev);
                          if (next.has(message.id)) next.delete(message.id); else next.add(message.id);
                          return next;
                        });
                      }}
                      className="w-full text-left px-2 py-1 flex items-center justify-between hover:bg-yellow-100/70 dark:hover:bg-yellow-900/40 rounded-t-md"
                    >
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-900 dark:text-yellow-100">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10 2a6 6 0 00-3.832 10.59c.232.186.332.49.245.776l-.451 1.486a1 1 0 001.265 1.265l1.486-.451c.286-.087.59.013.776.245A6 6 0 1010 2z" />
                        </svg>
                        Reasoning
                      </span>
                      <span className="text-[11px] text-yellow-900/80 dark:text-yellow-200/80">
                        {expandedReasoning.has(message.id) ? 'Hide' : 'Show'}
                      </span>
                    </button>
                    {expandedReasoning.has(message.id) && (
                      <div className="px-2 pb-2 pt-1 border-t border-yellow-300/60 dark:border-yellow-800/60 text-yellow-950 dark:text-yellow-50">
                        {typeof message.reasoning === 'string' && message.reasoning.trim().length > 0 && (
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <MemoizedMarkdown>
                              {message.reasoning}
                            </MemoizedMarkdown>
                          </div>
                        )}
                        {message.reasoning_details && Array.isArray(message.reasoning_details) && message.reasoning_details.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-yellow-900/80 dark:text-yellow-200/90">Details</summary>
                            <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words p-2 rounded bg-yellow-100/70 dark:bg-yellow-900/40 border border-yellow-300/60 dark:border-yellow-800/60 overflow-x-auto">
{JSON.stringify(message.reasoning_details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Message Content - Conditional rendering based on contentType */}
                <div className="markdown-content">
                  {message.contentType === "markdown" ? (
                    <MemoizedMarkdown>
                      {message.content}
                    </MemoizedMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">
                      {message.content}
                    </p>
                  )}
                </div>

                {/* Linked image attachments (history and recent) */}
                {message.has_attachments && Array.isArray(message.attachment_ids) && message.attachment_ids.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.attachment_ids.map((attId, idx) => {
                      const alt = sanitizeAttachmentName(undefined) || fallbackImageLabel(idx);
                      return (
                        <InlineAttachment
                          key={attId}
                          id={attId}
                          alt={alt || undefined}
                          onClick={() => handleOpenImage(attId, alt || undefined)}
                          width={96}
                          height={96}
                        />
                      );
                    })}
                  </div>
                )}

                {/* URL Citations (Sources) */}
                {message.role === "assistant" && Array.isArray(message.annotations) && message.annotations.length > 0 && (
                  <div className="mt-3 border-t border-black/10 dark:border-white/10 pt-2 overflow-x-hidden max-w-full">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Sources</div>
                    <ul className="space-y-1.5 max-w-full overflow-x-hidden">
                      {message.annotations.map((ann, i) => {
                        const host = getDomainFromUrl(ann.url) || ann.url;
                        const favicon = getFaviconUrl(ann.url, 32);
                        const title = ann.title?.trim() || host;
                        return (
                          <li key={`${message.id}-ann-${i}`} className="w-full max-w-full min-w-0">
                            <a
                              href={ann.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              title={title}
                              className="group flex items-start gap-2 rounded-md px-2 py-1 transition-colors hover:bg-gray-200/70 dark:hover:bg-gray-700/40 w-full max-w-full overflow-hidden"
                            >
                              {/* Favicon (32x32, contrasting border) */}
                              {favicon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={favicon}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="mt-0.5 h-8 w-8 rounded bg-white dark:bg-gray-900 border border-black/40 dark:border-white/60 shadow-sm flex-shrink-0"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="mt-0.5 h-8 w-8 rounded bg-gray-300 dark:bg-gray-600 border border-black/40 dark:border-white/60 inline-block flex-shrink-0" aria-hidden="true" />
                              )}
                              <span className="min-w-0 leading-4 w-full max-w-full">
                                <span className="block max-w-full overflow-hidden text-xs font-medium text-blue-700 dark:text-blue-300 group-hover:underline truncate whitespace-nowrap" title={title}>
                                  {title}
                                </span>
                                <span className="block max-w-full overflow-hidden text-[11px] text-gray-600 dark:text-gray-400 truncate whitespace-nowrap" title={host}>
                                  {host}
                                </span>
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                
                {/* Error icon for failed user messages */}
                {message.role === "user" && message.error && (
                  <div className="absolute -top-2 -left-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center z-1" title="Message failed to send">
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

        {/* Loading indicator and streaming content */}
        {(isLoading || isStreaming) && (
          <div className="flex justify-start">
            <div className="flex w-full sm:max-w-[90%] lg:max-w-[85%] xl:max-w-[80%]">
              {/* Avatar - Hidden on mobile (< sm breakpoint) */}
              <div className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 items-center justify-center text-sm font-medium mr-3">
                AI
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 sm:px-4 py-2 flex-1 border border-slate-200/80 dark:border-white/10 shadow-sm">
                
                {/* ENHANCED: Persistent Streaming Reasoning Section */}
                {isStreaming && (
                  <div className="mb-3 border rounded-md bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300/80 dark:border-yellow-700/60">
                    <div className="w-full text-left px-2 py-1 rounded-t-md">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-900 dark:text-yellow-100">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10 2a6 6 0 00-3.832 10.59c.232.186.332.49.245.776l-.451 1.486a1 1 0 001.265 1.265l1.486-.451c.286-.087.59.013.776.245A6 6 0 1010 2z" />
                          </svg>
                          {streamingReasoning ? 'Thinking...' : 'Processing...'}
                        </div>
                      </span>
                    </div>
                    
                    {/* ENHANCED: Always show reasoning content area, even if empty initially */}
                    <div className="px-2 pb-2 pt-1 border-t border-yellow-300/60 dark:border-yellow-800/60 text-yellow-950 dark:text-yellow-50">
                      {streamingReasoning ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <MemoizedMarkdown>
                            {streamingReasoning}
                          </MemoizedMarkdown>
                          <span className="inline-block ml-1 animate-pulse text-yellow-600">▋</span>
                        </div>
                      ) : (
                        <div className="text-yellow-700 dark:text-yellow-300 text-sm italic">
                          Initializing AI reasoning...
                        </div>
                      )}
                      
                      {/* ENHANCED: Only show details when there's actual content */}
                      {streamingReasoningDetails.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-yellow-900/80 dark:text-yellow-200/90">
                            Reasoning Details ({streamingReasoningDetails.length} chunks)
                          </summary>
                          <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words p-2 rounded bg-yellow-100/70 dark:bg-yellow-900/40 border border-yellow-300/60 dark:border-yellow-800/60 overflow-x-auto">
{JSON.stringify(streamingReasoningDetails, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )}
                
                {/* ENHANCED: Separate Content Section - Completely Isolated */}
                {isStreaming && streamingContent ? (
                  <div className="content-section markdown-content">
                    {detectMarkdownContent(streamingContent) ? (
                      <div className="streaming-markdown">
                        <MemoizedMarkdown>{streamingContent}</MemoizedMarkdown>
                        <span className="inline-block ml-1 animate-pulse text-blue-500">▋</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {streamingContent}
                        <span className="inline-block ml-1 animate-pulse text-blue-500">▋</span>
                      </div>
                    )}
                  </div>
                ) : isStreaming ? (
                  /* ENHANCED: Show loading state only when streaming but no content yet */
                  <div className="flex space-x-1 mt-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Lightbox modal */}
      {lightbox.open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox({ open: false })}
        >
          <div className="max-w-5xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            {lightbox.url && (
              <Image src={lightbox.url} alt={lightbox.alt || 'Attachment'} width={1600} height={1200} className="w-full h-auto max-h-[90vh] object-contain rounded" />
            )}
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => setLightbox({ open: false })}
                className="px-3 py-1 rounded bg-white/90 text-gray-800 hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
