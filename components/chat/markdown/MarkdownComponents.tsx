import React, { useState } from "react";

interface CustomCodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface CustomTableProps extends React.HTMLAttributes<HTMLTableElement> {
  children?: React.ReactNode;
}

interface CustomBlockquoteProps extends React.HTMLAttributes<HTMLQuoteElement> {
  children?: React.ReactNode;
}

interface CustomLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children?: React.ReactNode;
}

interface CustomPreBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  children?: React.ReactNode;
}

export const CustomCodeBlock = ({
  inline,
  children,
  ...props
}: CustomCodeBlockProps) => {
  if (inline) {
    return (
      <code
  className="bg-slate-200/80 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  // For block code, just render the code element - the pre wrapper is handled by CustomPreBlock
  return (
    <code className="text-sm font-mono" {...props}>
      {children}
    </code>
  );
};

export const CustomTable = ({ children, ...props }: CustomTableProps) => (
  <div className="responsive-table-wrapper">
    <div className="responsive-table-container">
      <table
        className="responsive-table"
        {...props}
      >
        {children}
      </table>
    </div>
  </div>
);

export const CustomBlockquote = ({ children, ...props }: CustomBlockquoteProps) => (
  <blockquote
    className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-2 my-4 italic text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800"
    {...props}
  >
    {children}
  </blockquote>
);

export const CustomLink = ({ href, children, ...props }: CustomLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 underline"
    {...props}
  >
    {children}
  </a>
);

// Custom component for handling pre elements (used with code blocks)
export const CustomPreBlock = ({ children, ...props }: CustomPreBlockProps) => {
  const [copied, setCopied] = useState(false);

  const extractTextContent = (node: React.ReactNode): string => {
    if (typeof node === 'string') {
      return node;
    }
    
    if (typeof node === 'number') {
      return node.toString();
    }
    
    if (React.isValidElement(node)) {
      const element = node as React.ReactElement<{ children?: React.ReactNode }>;
      if (element.props.children) {
        return extractTextContent(element.props.children);
      }
    }
    
    if (Array.isArray(node)) {
      return node.map(extractTextContent).join('');
    }
    
    return '';
  };

  const handleCopy = async () => {
    try {
      const textContent = extractTextContent(children);
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  return (
    <div className="relative group">
  <pre className="!bg-slate-600 dark:!bg-gray-800 rounded-lg p-3 whitespace-pre-wrap break-words my-2 border !border-slate-300 dark:!border-white/10 shadow-sm" {...props}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 bg-slate-300/90 dark:bg-gray-700 hover:bg-slate-400 dark:hover:bg-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100"
        title={copied ? "Copied!" : "Copy to clipboard"}
      >
        {copied ? (
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
};
