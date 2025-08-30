import React, { lazy, Suspense, useEffect, useState } from 'react';
import { ChatMessage } from '../../lib/types/chat';

// Lazy load the markdown renderer
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

interface StreamingMessageContentProps {
  message?: ChatMessage;
  streamingContent?: string;
  isStreaming?: boolean;
}

/**
 * Enhanced message content component that handles both regular messages
 * and streaming content with progressive updates
 */
const StreamingMessageContent = ({ 
  message, 
  streamingContent = '', 
  isStreaming = false 
}: StreamingMessageContentProps) => {
  const [displayContent, setDisplayContent] = useState('');
  const [contentType, setContentType] = useState<'text' | 'markdown'>('text');

  useEffect(() => {
    if (isStreaming && streamingContent) {
      // During streaming, show the streaming content
      setDisplayContent(streamingContent);
      // Simple heuristic to detect markdown during streaming
      setContentType(
        streamingContent.includes('```') || 
        streamingContent.includes('#') || 
        streamingContent.includes('**') || 
        streamingContent.includes('*') && streamingContent.includes('*')
          ? 'markdown' 
          : 'text'
      );
    } else if (message) {
      // After streaming or for regular messages, show the final content
      setDisplayContent(message.content);
      setContentType(message.contentType === 'markdown' ? 'markdown' : 'text');
    }
  }, [message, streamingContent, isStreaming]);

  // Show loading indicator if no content yet
  if (!displayContent && !streamingContent) {
    return (
      <div className="flex items-center space-x-1">
        <div className="animate-pulse flex space-x-1">
          <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  }

  // Streaming cursor effect
  const streamingCursor = isStreaming ? (
    <span className="animate-pulse text-blue-500">▋</span>
  ) : null;

  if (contentType === 'markdown') {
    return (
      <div className="relative">
        <Suspense fallback={<div className="whitespace-pre-wrap">{displayContent}</div>}>
          <MarkdownRenderer content={displayContent} />
        </Suspense>
        {streamingCursor && (
          <span className="inline-block ml-1">{streamingCursor}</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="whitespace-pre-wrap">
        {displayContent}
        {streamingCursor && (
          <span className="inline-block ml-1">{streamingCursor}</span>
        )}
      </p>
    </div>
  );
};

export default StreamingMessageContent;
