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
}
