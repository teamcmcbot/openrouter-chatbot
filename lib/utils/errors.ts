// lib/utils/errors.ts
// Use type-only import to avoid runtime dependency on Next.js in Jest/node contexts
import type { NextResponse } from 'next/server';
import { ApiError } from '../types';
import { AuthErrorCode, AuthError } from '../types/auth';
import { logger } from './logger';

export enum ErrorCode {
  // Client Errors
  BAD_REQUEST = 'bad_request',
  UNAUTHORIZED = 'unauthorized',
  FORBIDDEN = 'forbidden',
  NOT_FOUND = 'not_found',
  METHOD_NOT_ALLOWED = 'method_not_allowed',
  CONFLICT = 'conflict',
  UNPROCESSABLE_ENTITY = 'unprocessable_entity',
  TOO_MANY_REQUESTS = 'too_many_requests',
  PAYLOAD_TOO_LARGE = 'payload_too_large',

  // Server Errors
  INTERNAL_SERVER_ERROR = 'internal_server_error',
  NOT_IMPLEMENTED = 'not_implemented',
  BAD_GATEWAY = 'bad_gateway',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  GATEWAY_TIMEOUT = 'gateway_timeout',

  // JWT Authentication Errors (mapped from AuthErrorCode)
  TOKEN_MISSING = 'token_missing',
  TOKEN_INVALID = 'token_invalid',
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_MALFORMED = 'token_malformed',
  AUTH_REQUIRED = 'auth_required',
  AUTH_FAILED = 'auth_failed',
  USER_NOT_FOUND = 'user_not_found',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  TIER_UPGRADE_REQUIRED = 'tier_upgrade_required',
  FEATURE_NOT_AVAILABLE = 'feature_not_available',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  TOKEN_LIMIT_EXCEEDED = 'token_limit_exceeded',
  AUTH_SERVICE_UNAVAILABLE = 'auth_service_unavailable',
  PROFILE_FETCH_FAILED = 'profile_fetch_failed',
}

const errorStatusMap: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.METHOD_NOT_ALLOWED]: 405,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.UNPROCESSABLE_ENTITY]: 422,
  [ErrorCode.TOO_MANY_REQUESTS]: 429,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.BAD_GATEWAY]: 502,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.GATEWAY_TIMEOUT]: 504,

  // JWT Authentication Error Status Mappings
  [ErrorCode.TOKEN_MISSING]: 401,
  [ErrorCode.TOKEN_INVALID]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.TOKEN_MALFORMED]: 400,
  [ErrorCode.AUTH_REQUIRED]: 401,
  [ErrorCode.AUTH_FAILED]: 401,
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.TIER_UPGRADE_REQUIRED]: 402, // Payment Required
  [ErrorCode.FEATURE_NOT_AVAILABLE]: 403,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.TOKEN_LIMIT_EXCEEDED]: 413, // Payload Too Large
  [ErrorCode.AUTH_SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.PROFILE_FETCH_FAILED]: 500,
};

export class ApiErrorResponse extends Error {
  public readonly code: ErrorCode;
  public readonly details?: string;
  public readonly retryAfter?: number;
  public readonly suggestions?: string[];

  constructor(
    message: string, 
    code: ErrorCode, 
    details?: string, 
    retryAfter?: number, 
    suggestions?: string[]
  ) {
    super(message);
    this.name = 'ApiErrorResponse';
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
    this.suggestions = suggestions;
  }
}

export function handleError(error: unknown, requestId?: string): NextResponse<ApiError> {
  // Centralized error logging with optional correlation id
  logger.error('[API_ERROR]', { error, requestId });

  let errorResponse: ApiError;
  let status: number;

  if (error instanceof ApiErrorResponse) {
    // Attempt to parse upstream error JSON envelope
    let upstreamCode: number | string | undefined;
    let upstreamMessage: string | undefined;
    let upstreamProvider: string | undefined;
    let upstreamProviderRequestId: string | undefined;
    try {
      if (error.details && typeof error.details === 'string' && error.details.trim().startsWith('{')) {
        const parsed = JSON.parse(error.details) as { error?: { code?: number; message?: string; metadata?: Record<string, unknown> } };
        if (parsed && parsed.error) {
          upstreamCode = parsed.error.code;
          upstreamMessage = parsed.error.message;
          const meta = parsed.error.metadata as Record<string, unknown> | undefined;
          if (meta && typeof meta === 'object') {
            const provider = (meta['provider_name'] as string) || (meta['provider'] as string);
            if (provider && typeof provider === 'string') upstreamProvider = provider;
            const reqId = (meta['provider_request_id'] as string) || (meta['request_id'] as string) || (meta['x-request-id'] as string);
            if (reqId && typeof reqId === 'string') upstreamProviderRequestId = reqId;
          }
        }
      }
    } catch {}

    errorResponse = {
      error: error.message,
      code: error.code,
      details: error.details,
      timestamp: new Date().toISOString(),
      retryAfter: error.retryAfter,
      suggestions: error.suggestions,
      ...(upstreamCode !== undefined ? { upstreamErrorCode: upstreamCode } : {}),
      ...(upstreamMessage ? { upstreamErrorMessage: upstreamMessage } : {}),
      ...(upstreamProvider ? { upstreamProvider } : {}),
      ...(upstreamProviderRequestId ? { upstreamProviderRequestId } : {}),
    };
    status = errorStatusMap[error.code];
  } else {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    errorResponse = {
      error: 'An internal error occurred.',
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      timestamp: new Date().toISOString(),
    };
    status = 500;
  }

  // Return a standard Response in non-Next runtimes (e.g., unit tests)
  const res = new Response(JSON.stringify(errorResponse), {
    status,
    headers: { 'Content-Type': 'application/json', ...(requestId ? { 'x-request-id': requestId } : {}) },
  });
  return res as unknown as NextResponse<ApiError>;
}

/**
 * Create an AuthError from an AuthErrorCode
 */
export function createAuthError(
  code: AuthErrorCode,
  message?: string,
  details?: string,
  retryable: boolean = false,
  suggestedAction?: string
): AuthError {
  return {
    code,
    message: message || getDefaultAuthErrorMessage(code),
    details,
    retryable,
    suggestedAction,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get default error message for AuthErrorCode
 */
function getDefaultAuthErrorMessage(code: AuthErrorCode): string {
  switch (code) {
    case AuthErrorCode.TOKEN_MISSING:
      return 'Authentication token is missing';
    case AuthErrorCode.TOKEN_INVALID:
      return 'Authentication token is invalid';
    case AuthErrorCode.TOKEN_EXPIRED:
      return 'Authentication token has expired';
    case AuthErrorCode.TOKEN_MALFORMED:
      return 'Authentication token is malformed';
    case AuthErrorCode.AUTH_REQUIRED:
      return 'Authentication is required for this operation';
    case AuthErrorCode.AUTH_FAILED:
      return 'Authentication failed';
    case AuthErrorCode.USER_NOT_FOUND:
      return 'User not found';
    case AuthErrorCode.INSUFFICIENT_PERMISSIONS:
      return 'Insufficient permissions for this operation';
    case AuthErrorCode.TIER_UPGRADE_REQUIRED:
      return 'Subscription tier upgrade required';
    case AuthErrorCode.FEATURE_NOT_AVAILABLE:
      return 'Feature not available for your subscription tier';
    case AuthErrorCode.RATE_LIMIT_EXCEEDED:
      return 'Rate limit exceeded';
    case AuthErrorCode.TOKEN_LIMIT_EXCEEDED:
      return 'Token limit exceeded for this request';
    case AuthErrorCode.AUTH_SERVICE_UNAVAILABLE:
      return 'Authentication service is temporarily unavailable';
    case AuthErrorCode.PROFILE_FETCH_FAILED:
      return 'Failed to fetch user profile';
    default:
      return 'Authentication error occurred';
  }
}

/**
 * Convert AuthErrorCode to ErrorCode for API responses
 */
export function authErrorToErrorCode(authCode: AuthErrorCode): ErrorCode {
  switch (authCode) {
    case AuthErrorCode.TOKEN_MISSING:
      return ErrorCode.TOKEN_MISSING;
    case AuthErrorCode.TOKEN_INVALID:
      return ErrorCode.TOKEN_INVALID;
    case AuthErrorCode.TOKEN_EXPIRED:
      return ErrorCode.TOKEN_EXPIRED;
    case AuthErrorCode.TOKEN_MALFORMED:
      return ErrorCode.TOKEN_MALFORMED;
    case AuthErrorCode.AUTH_REQUIRED:
      return ErrorCode.AUTH_REQUIRED;
    case AuthErrorCode.AUTH_FAILED:
      return ErrorCode.AUTH_FAILED;
    case AuthErrorCode.USER_NOT_FOUND:
      return ErrorCode.USER_NOT_FOUND;
    case AuthErrorCode.INSUFFICIENT_PERMISSIONS:
      return ErrorCode.INSUFFICIENT_PERMISSIONS;
    case AuthErrorCode.TIER_UPGRADE_REQUIRED:
      return ErrorCode.TIER_UPGRADE_REQUIRED;
    case AuthErrorCode.FEATURE_NOT_AVAILABLE:
      return ErrorCode.FEATURE_NOT_AVAILABLE;
    case AuthErrorCode.RATE_LIMIT_EXCEEDED:
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    case AuthErrorCode.TOKEN_LIMIT_EXCEEDED:
      return ErrorCode.TOKEN_LIMIT_EXCEEDED;
    case AuthErrorCode.AUTH_SERVICE_UNAVAILABLE:
      return ErrorCode.AUTH_SERVICE_UNAVAILABLE;
    case AuthErrorCode.PROFILE_FETCH_FAILED:
      return ErrorCode.PROFILE_FETCH_FAILED;
    default:
      return ErrorCode.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Handle authentication errors specifically
 */
export function handleAuthError(authError: AuthError): NextResponse<ApiError> {
  const errorCode = authErrorToErrorCode(authError.code);
  const status = errorStatusMap[errorCode];

  const errorResponse: ApiError = {
    error: authError.message,
    code: errorCode,
    details: authError.details,
    timestamp: authError.timestamp,
    retryAfter: authError.retryable ? 60 : undefined, // Retry after 60 seconds if retryable
    suggestions: authError.suggestedAction ? [authError.suggestedAction] : undefined,
  };

  const res = new Response(JSON.stringify(errorResponse), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return res as unknown as NextResponse<ApiError>;
}
