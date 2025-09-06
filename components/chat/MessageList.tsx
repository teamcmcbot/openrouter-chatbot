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
import { logger } from "../../lib/utils/logger";

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
  // NEW: Real-time annotations support
  streamingAnnotations?: Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>;
  // NEW: Reasoning enablement state for conditional display
  reasoningEnabled?: boolean;
}

export default function MessageList({ 
  messages, 
  isLoading, 
  onModelClick, 
  hoveredGenerationId, 
  scrollToCompletionId, 
  onPromptSelect,
  // Streaming props
  isStreaming = false,
  streamingContent = '',
  streamingReasoning = '', // NEW: Real-time reasoning
  streamingReasoningDetails = [], // NEW: Real-time reasoning details
  streamingAnnotations = [], // NEW: Real-time annotations
  reasoningEnabled = false, // NEW: Reasoning enablement state for conditional display
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const streamingReasoningRef = useRef<HTMLDivElement>(null);
  // NEW: track which pane should own auto-scroll during streaming
  const [streamingScrollTarget, setStreamingScrollTarget] = useState<"reasoning" | "content" | null>(null);
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
  logger.warn('message.copy.failed', { err: (error as Error)?.message, messageId });
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

  // Streaming scroll owner selection
  useEffect(() => {
    if (!isStreaming) {
      // Reset when stream completes
      setStreamingScrollTarget(null);
      return;
    }
    // If content has started, content takes over permanently for this stream
    if (isStreaming && streamingContent && streamingContent.length > 0) {
      setStreamingScrollTarget("content");
      return;
    }
    // Otherwise, fall back to reasoning if we have any reasoning text
    if (isStreaming && (!streamingScrollTarget || streamingScrollTarget === null) && streamingReasoning && streamingReasoning.length > 0) {
      setStreamingScrollTarget("reasoning");
    }
  }, [isStreaming, streamingContent, streamingReasoning, streamingScrollTarget]);

  // Auto-scroll streaming reasoning to bottom (only when reasoning is the active target)
  useEffect(() => {
    if (
      isStreaming &&
      streamingScrollTarget === "reasoning" &&
      streamingReasoning &&
      streamingReasoningRef.current
    ) {
      streamingReasoningRef.current.scrollTop = streamingReasoningRef.current.scrollHeight;
    }
  }, [isStreaming, streamingReasoning, streamingScrollTarget]);

  // Auto-scroll main container to bottom while content streams (takes over once any content arrives)
  useEffect(() => {
    if (isStreaming && streamingScrollTarget === "content" && streamingContent && messagesContainerRef.current) {
      // Use a micro-delay to ensure DOM has painted the latest chunk
      const id = window.setTimeout(() => {
        const el = messagesContainerRef.current!;
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [isStreaming, streamingContent, streamingScrollTarget]);

  const handleOpenImage = async (attachmentId: string, alt?: string) => {
    try {
      const url = await fetchSignedUrl(attachmentId);
      setLightbox({ open: true, url, alt });
    } catch (e) {
  logger.warn('image.open.failed', { attachmentId, err: (e as Error)?.message });
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
  data-testid="messages-container"
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
                  <div className="mb-3 border rounded-md bg-slate-50/80 dark:bg-slate-800/20 border-slate-300/80 dark:border-slate-500/60 shadow-sm backdrop-blur-sm">
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
                      className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-100/60 dark:hover:bg-slate-700/30 rounded-t-md transition-all duration-200"
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M10 2a3 3 0 00-3 3v1.5a1.5 1.5 0 01-1.5 1.5v1a1.5 1.5 0 001.5 1.5V12a3 3 0 106 0v-1.5A1.5 1.5 0 0114.5 9V8A1.5 1.5 0 0113 6.5V5a3 3 0 00-3-3zM6.5 15.5a1 1 0 011-1h5a1 1 0 110 2h-5a1 1 0 01-1-1zM8 17a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        </svg>
                        AI Reasoning
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {expandedReasoning.has(message.id) ? 'Hide' : 'Show'} process
                        </span>
                        <svg 
                          className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${expandedReasoning.has(message.id) ? 'rotate-180' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {expandedReasoning.has(message.id) && (
                      <div className="px-3 pb-3 pt-2 border-t border-slate-300/60 dark:border-slate-500/40 text-slate-800 dark:text-slate-200">
                        {typeof message.reasoning === 'string' && message.reasoning.trim().length > 0 && (
                          <div className="prose prose-sm prose-slate dark:prose-invert max-w-none max-h-32 overflow-y-auto scroll-smooth">
                            <MemoizedMarkdown>
                              {message.reasoning}
                            </MemoizedMarkdown>
                          </div>
                        )}
                        {message.reasoning_details && Array.isArray(message.reasoning_details) && message.reasoning_details.length > 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                              <span>Technical Details</span>
                              <span className="text-xs bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                                {message.reasoning_details.length} steps
                              </span>
                            </summary>
                            <pre className="mt-2 text-xs whitespace-pre-wrap break-words p-3 rounded bg-slate-100/70 dark:bg-slate-800/50 border border-slate-300/70 dark:border-slate-500/50 overflow-x-auto">
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

                {/* Phase 2: Non-persisted assistant output images (data URLs)
                   UX update: If exactly 1 image, show it inline full-width (still constrained) instead of thumbnails.
                   If multiple, retain thumbnail grid with lightbox. */}
                {message.role === 'assistant' && Array.isArray(message.output_images) && message.output_images.length > 0 && (
                  message.output_images.length === 1 ? (
        <div className="mt-4" data-testid="assistant-output-image-single">
                      <button
                        type="button"
                        onClick={() => setLightbox({ open: true, url: message.output_images![0], alt: 'Generated image' })}
        className="group relative text-left rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer mx-auto max-w-full"
                        title="Click to view full size"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.output_images[0]}
                          alt="Generated image"
          className="max-w-full h-auto max-h-[480px] object-contain bg-black/5 dark:bg-white/5 transition-opacity group-hover:opacity-95 mx-auto"
                          loading="lazy"
                        />
                        <span className="absolute bottom-2 right-2 bg-black/50 text-white text-[11px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
                      </button>
                    </div>
                  ) : (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="assistant-output-images">
                      {message.output_images.map((dataUrl, idx) => (
                        <button
                          key={`${message.id}-outimg-${idx}`}
                          type="button"
          className="relative group w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          onClick={() => setLightbox({ open: true, url: dataUrl, alt: `Generated image ${idx + 1}` })}
                          title="Click to enlarge"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={dataUrl}
                            alt={"Generated image " + (idx + 1)}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                          />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/40 text-[10px] text-white px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">View</span>
                        </button>
                      ))}
                    </div>
                  )
                )}

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
                                <Image
                                  src={favicon}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="mt-0.5 h-8 w-8 rounded bg-white dark:bg-gray-900 border border-black/40 dark:border-white/60 shadow-sm flex-shrink-0"
                                  unoptimized
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

        {/* Streaming content with reasoning */}
        {isStreaming && (streamingContent || (reasoningEnabled && streamingReasoning) || (!reasoningEnabled && streamingReasoning.length > 0)) && (
          <div className="flex justify-start">
            <div className="flex w-full sm:max-w-[90%] lg:max-w-[85%] xl:max-w-[80%]">
              {/* Avatar - Hidden on mobile (< sm breakpoint) */}
              <div className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 items-center justify-center text-sm font-medium mr-3">
                AI
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 sm:px-4 py-2 flex-1 border border-slate-200/80 dark:border-white/10 shadow-sm">
                
                {/* ENHANCED: Conditional streaming reasoning section */}
                {isStreaming && reasoningEnabled && (
                  <div className="mb-3 border rounded-md bg-slate-50/80 dark:bg-slate-800/20 border-slate-300/80 dark:border-slate-500/60 shadow-sm backdrop-blur-sm">
                    <div className="w-full text-left px-3 py-2 rounded-t-md">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-slate-500 rounded-full animate-pulse"></div>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10 2a3 3 0 00-3 3v1.5a1.5 1.5 0 01-1.5 1.5v1a1.5 1.5 0 001.5 1.5V12a3 3 0 106 0v-1.5A1.5 1.5 0 0114.5 9V8A1.5 1.5 0 0113 6.5V5a3 3 0 00-3-3zM6.5 15.5a1 1 0 011-1h5a1 1 0 110 2h-5a1 1 0 01-1-1zM8 17a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                          </svg>
                          {streamingReasoning ? 'AI Thinking...' : 'Processing...'}
                        </div>
                      </span>
                    </div>
                    
                    {/* ENHANCED: Always show reasoning content area, even if empty initially */}
                    <div className="px-3 pb-3 pt-2 border-t border-slate-300/60 dark:border-slate-500/40 text-slate-800 dark:text-slate-200">
                      {streamingReasoning ? (
                        <div ref={streamingReasoningRef} data-testid="streaming-reasoning" className="prose prose-sm prose-slate dark:prose-invert max-w-none max-h-32 overflow-y-auto scroll-smooth">
                          <MemoizedMarkdown>
                            {streamingReasoning}
                          </MemoizedMarkdown>
                          <span className="inline-block ml-1 animate-pulse text-slate-600 dark:text-slate-400">▋</span>
                        </div>
                      ) : (
                        <div className="text-slate-600 dark:text-slate-400 text-sm italic">
                          Initializing AI reasoning...
                        </div>
                      )}
                      
                      {/* ENHANCED: Only show details when there's actual content */}
                      {streamingReasoningDetails.length > 0 && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                            <span>Reasoning Details</span>
                            <span className="text-xs bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                              {streamingReasoningDetails.length} chunks
                            </span>
                          </summary>
                          <pre className="mt-2 text-xs whitespace-pre-wrap break-words p-3 rounded bg-slate-100/70 dark:bg-slate-800/50 border border-slate-300/70 dark:border-slate-500/50 overflow-x-auto">
{JSON.stringify(streamingReasoningDetails, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )}

                {/* NEW: Handle models that send reasoning anyway (after first chunk) */}
                {isStreaming && !reasoningEnabled && streamingReasoning.length > 0 && (
                  <div className="mb-3 border rounded-md bg-slate-50/80 dark:bg-slate-800/20 border-slate-300/80 dark:border-slate-500/60 shadow-sm backdrop-blur-sm">
                    <div className="w-full text-left px-3 py-2 rounded-t-md">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10 2a3 3 0 00-3 3v1.5a1.5 1.5 0 01-1.5 1.5v1a1.5 1.5 0 001.5 1.5V12a3 3 0 106 0v-1.5A1.5 1.5 0 0114.5 9V8A1.5 1.5 0 0113 6.5V5a3 3 0 00-3-3zM6.5 15.5a1 1 0 011-1h5a1 1 0 110 2h-5a1 1 0 01-1-1zM8 17a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                          </svg>
                          Technical Details
                        </div>
                      </span>
                    </div>
                    
                    <div className="px-3 pb-3 pt-2 border-t border-slate-300/60 dark:border-slate-500/40 text-slate-800 dark:text-slate-200">
                      <div ref={streamingReasoningRef} data-testid="streaming-reasoning" className="prose prose-sm prose-slate dark:prose-invert max-w-none max-h-32 overflow-y-auto scroll-smooth">
                        <MemoizedMarkdown>
                          {streamingReasoning}
                        </MemoizedMarkdown>
                        <span className="inline-block ml-1 animate-pulse text-slate-600 dark:text-slate-400">▋</span>
                      </div>
                      
                      {/* Show details when there's actual content */}
                      {streamingReasoningDetails.length > 0 && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                            <span>Reasoning Details</span>
                            <span className="text-xs bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                              {streamingReasoningDetails.length} chunks
                            </span>
                          </summary>
                          <pre className="mt-2 text-xs whitespace-pre-wrap break-words p-3 rounded bg-slate-100/70 dark:bg-slate-800/50 border border-slate-300/70 dark:border-slate-500/50 overflow-x-auto">
{JSON.stringify(streamingReasoningDetails, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )}
                
                {/* ENHANCED: Streaming content section */}
                {isStreaming && streamingContent && (
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
                    
                    {/* NEW: Streaming URL Citations (Sources) - show while streaming */}
                    {Array.isArray(streamingAnnotations) && streamingAnnotations.length > 0 && (
                      <div className="mt-3 border-t border-black/10 dark:border-white/10 pt-2 overflow-x-hidden max-w-full">
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Sources</div>
                        <ul className="space-y-1.5 max-w-full overflow-x-hidden">
                          {streamingAnnotations.map((ann, i) => {
                            const host = getDomainFromUrl(ann.url) || ann.url;
                            const favicon = getFaviconUrl(ann.url, 32);
                            const title = ann.title?.trim() || host;
                            return (
                              <li key={`streaming-ann-${i}`} className="w-full max-w-full min-w-0">
                                <a
                                  href={ann.url}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow"
                                  className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-xs group min-w-0 max-w-full"
                                >
                                  <Image
                                    src={favicon || `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><rect width='16' height='16' fill='%23e5e7eb'/></svg>`}
                                    alt=""
                                    width={16}
                                    height={16}
                                    className="w-4 h-4 rounded-sm bg-white dark:bg-gray-700 flex-shrink-0"
                                    unoptimized
                                  />
                                  <span className="truncate min-w-0 flex-1 text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200">
                                    {title}
                                  </span>
                                  <svg className="w-3 h-3 text-blue-500 dark:text-blue-400 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Compact loading indicator for streaming (before content appears) */}
        {isStreaming && !streamingContent && !(reasoningEnabled && streamingReasoning) && !(!reasoningEnabled && streamingReasoning.length > 0) && (
          <div className="flex justify-start">
            <div className="flex items-center">
              {/* Avatar - Hidden on mobile (< sm breakpoint) */}
              <div className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 items-center justify-center text-sm font-medium mr-3">
                AI
              </div>
              {/* Compact 3-dot loading animation */}
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
              </div>
            </div>
          </div>
        )}

        {/* Compact loading indicator for non-streaming */}
        {isLoading && !isStreaming && (
          <div className="flex justify-start">
            <div className="flex items-center">
              {/* Avatar - Hidden on mobile (< sm breakpoint) */}
              <div className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 items-center justify-center text-sm font-medium mr-3">
                AI
              </div>
              {/* Compact 3-dot loading animation */}
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
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
