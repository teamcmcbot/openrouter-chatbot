import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  CustomCodeBlock,
  CustomTable,
  CustomBlockquote,
  CustomLink,
  CustomPreBlock
} from './markdown/MarkdownComponents';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer = memo(({ content }: MarkdownRendererProps) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        className="prose prose-sm max-w-none dark:prose-invert"
        components={{
          code: CustomCodeBlock,
          pre: CustomPreBlock,
          table: CustomTable,
          blockquote: CustomBlockquote,
          a: CustomLink,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';

export default MarkdownRenderer;
