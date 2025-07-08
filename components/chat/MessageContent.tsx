import React, { lazy, Suspense } from 'react';
import { ChatMessage } from '../../lib/types/chat';

// Lazy load the markdown renderer
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

interface MessageContentProps {
  message: ChatMessage;
}

const MessageContent = ({ message }: MessageContentProps) => {
  if (message.contentType === 'markdown') {
    return (
      <Suspense fallback={<div className="whitespace-pre-wrap">{message.content}</div>}>
        <MarkdownRenderer content={message.content} />
      </Suspense>
    );
  }

  return <p className="whitespace-pre-wrap">{message.content}</p>;
};

export default MessageContent;
