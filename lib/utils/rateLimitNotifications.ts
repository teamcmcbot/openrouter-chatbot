import toast from 'react-hot-toast';

export interface RateLimitHeaders {
  limit: number;
  remaining: number;
  reset: string; // ISO date string
}

/**
 * Parse rate limit headers from a Response object
 */
export function parseRateLimitHeaders(response: Response): RateLimitHeaders | null {
  if (!response || !response.headers) {
    return null;
  }

  const limitHeader = response.headers.get('X-RateLimit-Limit');
  const remainingHeader = response.headers.get('X-RateLimit-Remaining');
  const resetHeader = response.headers.get('X-RateLimit-Reset');

  if (!limitHeader || !remainingHeader || !resetHeader) {
    return null;
  }

  const limit = parseInt(limitHeader, 10);
  const remaining = parseInt(remainingHeader, 10);

  if (isNaN(limit) || isNaN(remaining)) {
    return null;
  }

  return {
    limit,
    remaining,
    reset: resetHeader,
  };
}

/**
 * Calculate minutes until rate limit reset
 */
function getMinutesUntilReset(resetTime: string): number {
  const resetDate = new Date(resetTime);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60)); // Convert to minutes
}

/**
 * Show proactive rate limit notifications based on remaining requests
 */
export function showRateLimitNotification(headers: RateLimitHeaders): void {
  const { limit, remaining, reset } = headers;
  const minutesUntilReset = getMinutesUntilReset(reset);

  // Show warning when at critical thresholds
  if (remaining === 0) {
    // Rate limit reached
    toast.error(
      `Rate limit reached! ${limit} requests used. Try again in ${minutesUntilReset} minutes.`,
      {
        id: 'rate-limit-reached',
        duration: 8000,
        // Use default error icon so it respects Toaster.iconTheme for better contrast
      }
    );
  } else if (remaining === 1) {
    // Last request remaining → amber warning style
    toast(
      `Last request remaining! Limit resets in ${minutesUntilReset} minutes.`,
      {
        id: 'rate-limit-last-request',
        duration: 6000,
        className: 'toast-warning',
        icon: '⚠️',
      }
    );
  } else if (remaining <= 2) {
    // Low remaining (2 left) → amber warning style
    toast(
      `Rate limit warning: Only ${remaining} of ${limit} requests remaining. Resets in ${minutesUntilReset} minutes.`,
      {
        id: 'rate-limit-warning-low-remaining',
        duration: 5000,
        className: 'toast-warning',
        icon: '⚠️',
      }
    );
  }
}

/**
 * Check rate limit headers and show notifications if needed
 */
export function checkRateLimitHeaders(response: Response): void {
  const headers = parseRateLimitHeaders(response);
  if (headers) {
    showRateLimitNotification(headers);
  }
}
