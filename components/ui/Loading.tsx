interface LoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  variant?: "spinner" | "skeleton" | "dots";
}

export default function Loading({ 
  size = "md", 
  text = "", 
  variant = "spinner" 
}: Readonly<LoadingProps>) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8", 
    lg: "w-12 h-12"
  };

  if (variant === "spinner") {
    return (
      <div className="flex flex-col items-center justify-center space-y-2">
        <svg 
          className={`${sizeClasses[size]} animate-spin text-blue-600`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 12a8 8 0 018-8V0l4 4-4 4V4a4 4 0 00-4 4zm0 8a4 4 0 014-4v4H0l4-4z" 
          />
        </svg>
        {text && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {text}
          </p>
        )}
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className="flex flex-col items-center justify-center space-y-2">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
        </div>
        {text && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {text}
          </p>
        )}
      </div>
    );
  }

  // Skeleton variant
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
      {text && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {text}
        </p>
      )}
    </div>
  );
}
