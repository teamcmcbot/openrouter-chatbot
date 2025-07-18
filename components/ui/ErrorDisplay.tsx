import { ReactNode } from "react";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  type?: "error" | "warning" | "info";
  actionButton?: ReactNode;
  onRetry?: () => void;
  onClose?: () => void;
  suggestions?: string[];
  retryAfter?: number; // Seconds until retry is recommended
  code?: string; // Error code for specific handling
}

export default function ErrorDisplay({ 
  title,
  message, 
  type = "error",
  actionButton,
  onRetry,
  onClose,
  suggestions,
  retryAfter,
  code
}: Readonly<ErrorDisplayProps>) {
  const typeStyles = {
    error: {
      container: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
      icon: "text-red-600 dark:text-red-400",
      title: "text-red-800 dark:text-red-300",
      text: "text-red-700 dark:text-red-400"
    },
    warning: {
      container: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800",
      icon: "text-yellow-600 dark:text-yellow-400",
      title: "text-yellow-800 dark:text-yellow-300",
      text: "text-yellow-700 dark:text-yellow-400"
    },
    info: {
      container: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
      icon: "text-emerald-600 dark:text-emerald-400",
      title: "text-emerald-800 dark:text-emerald-300",
      text: "text-emerald-700 dark:text-emerald-400"
    }
  };

  const styles = typeStyles[type];

  const getIcon = () => {
    switch (type) {
      case "error":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "warning":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.732-.833-2.464 0L4.348 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case "info":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${styles.container} relative`}>
      {/* Close button in top-right corner */}
      {onClose && (
        <button
          onClick={onClose}
          className={`absolute top-2 right-2 inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-800 hover:bg-opacity-75 ${styles.icon} hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors`}
          aria-label="Close error message"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      
      <div className="flex">
        <div className={`flex-shrink-0 ${styles.icon}`}>
          {getIcon()}
        </div>
        <div className="ml-3 flex-1 pr-8">
          {title && (
            <h3 className={`text-sm font-medium ${styles.title}`}>
              {title}
            </h3>
          )}
          <div className={`text-sm ${title ? "mt-1" : ""} ${styles.text}`}>
            <p>{message}</p>
          </div>

          {/* Display suggestions if available */}
          {suggestions && suggestions.length > 0 && (
            <div className={`mt-3 text-sm ${styles.text}`}>
              <p className="font-medium mb-1">Suggestions:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                {suggestions.map((suggestion, index) => (
                  <li key={`suggestion-${suggestion.slice(0, 20)}-${index}`}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Display retry countdown for rate limiting */}
          {code === 'too_many_requests' && retryAfter && (
            <div className={`mt-3 text-sm ${styles.text}`}>
              <p>⏱️ Recommended retry time: {retryAfter} seconds</p>
            </div>
          )}
          
          {(onRetry || actionButton) && (
            <div className="mt-4 flex space-x-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className={`text-sm font-medium underline hover:no-underline ${styles.text}`}
                >
                  Try again
                </button>
              )}
              {actionButton}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
