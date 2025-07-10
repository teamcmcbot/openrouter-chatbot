"use client";

import { useEffect, useRef, memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ChatMessage } from "../../lib/types/chat";
import { 
  CustomCodeBlock, 
  CustomTable, 
  CustomBlockquote, 
  CustomLink, 
  CustomPreBlock 
} from "./markdown/MarkdownComponents";

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
  onModelClick?: (modelId: string, tab?: 'overview' | 'pricing' | 'capabilities') => void;
}

export default function MessageList({ messages, isLoading, onModelClick }: Readonly<MessageListProps>) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      const { scrollHeight, clientHeight } = messagesContainerRef.current;
      messagesContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  };

  useEffect(() => {
    // Use a small delay to ensure the DOM has updated
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, isLoading]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div 
      ref={messagesContainerRef}
      className="h-full overflow-y-auto px-6 py-4 scroll-smooth"
    >
      <div className="space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-lg mb-2">Start a conversation</p>
            <p className="text-sm text-center max-w-md">
              Type a message below to begin chatting with the AI assistant.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`flex max-w-full sm:max-w-[90%] lg:max-w-[85%] xl:max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                message.role === "user" 
                  ? "bg-emerald-600 text-white ml-3" 
                  : "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 mr-3"
              }`}>
                {message.role === "user" ? "ME" : "AI"}
              </div>

              {/* Message Content */}
              <div className={`rounded-lg px-4 py-2 ${
                message.role === "user"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              }`}>
                {/* LLM Model Tag for assistant */}
                {message.role === "assistant" && message.model && (
                  <button
                    onClick={() => onModelClick?.(message.model!, 'overview')}
                    className="inline-block mb-1 mr-2 px-2 py-0.5 text-xs font-semibold rounded bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-purple-300 align-middle hover:bg-gray-400 dark:hover:bg-gray-700 transition-colors cursor-pointer"
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
                <div className="flex justify-between items-center mt-1">
                  <p className={`text-xs ${
                    message.role === "user" 
                      ? "text-emerald-100" 
                      : "text-gray-400 dark:text-gray-300"
                  }`}>
                    {formatTime(message.timestamp)}{" "}
                    {message.elapsed_time && (
                      <span className="text-gray-300 dark:text-gray-400">
                        (Took {message.elapsed_time} seconds, {message.total_tokens} tokens - 
                        <button
                          onClick={() => onModelClick?.(message.model!, 'pricing')}
                          className="underline hover:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer ml-1"
                          title={`View pricing details for ${message.model}`}
                        >
                          {message.completion_id}
                        </button>
                        )
                      </span>
                    )}
                  </p>
                  <button
                    onClick={() => handleCopyMessage(message.id, message.content)}
                    className={`ml-2 p-1 rounded transition-colors ${
                      message.role === "user" 
                        ? "hover:bg-emerald-700 text-emerald-100 hover:text-white" 
                        : "hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-300"
                    }`}
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
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex max-w-[70%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 flex items-center justify-center text-sm font-medium mr-3">
                AI
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
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
