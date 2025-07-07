// lib/types/api.ts

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}

export interface ApiError {
  error: string;
  code: string;
  details?: string;
  timestamp: string;
  retryAfter?: number; // For rate limiting errors
  suggestions?: string[]; // Helpful suggestions for the user
}

export type ErrorCategory = 'rate_limit' | 'validation' | 'server' | 'network' | 'unknown';
