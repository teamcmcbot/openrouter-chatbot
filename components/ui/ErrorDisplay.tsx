import { ReactNode } from "react";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  type?: "error" | "warning" | "info";
  actionButton?: ReactNode;
  onRetry?: () => void;
}

export default function ErrorDisplay({ 
  title,
  message, 
  type = "error",
  actionButton,
  onRetry
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
      container: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
      icon: "text-blue-600 dark:text-blue-400",
      title: "text-blue-800 dark:text-blue-300",
      text: "text-blue-700 dark:text-blue-400"
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
    <div className={`border rounded-lg p-4 ${styles.container}`}>
      <div className="flex">
        <div className={`flex-shrink-0 ${styles.icon}`}>
          {getIcon()}
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-medium ${styles.title}`}>
              {title}
            </h3>
          )}
          <div className={`text-sm ${title ? "mt-1" : ""} ${styles.text}`}>
            <p>{message}</p>
          </div>
          
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
