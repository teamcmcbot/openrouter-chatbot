import React from "react";

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
        className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono"
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
  <div className="overflow-x-auto my-4">
    <table
      className="min-w-full border-collapse border border-gray-300 dark:border-gray-600"
      {...props}
    >
      {children}
    </table>
  </div>
);

export const CustomBlockquote = ({ children, ...props }: CustomBlockquoteProps) => (
  <blockquote
    className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-2 my-4 italic text-gray-700 dark:text-gray-300"
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
export const CustomPreBlock = ({ children, ...props }: CustomPreBlockProps) => (
  <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 whitespace-pre-wrap break-words my-2" {...props}>
    {children}
  </pre>
);
