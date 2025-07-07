// lib/utils/errors.ts
import { NextResponse } from 'next/server';
import { ApiError } from '../types';

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

  // Server Errors
  INTERNAL_SERVER_ERROR = 'internal_server_error',
  NOT_IMPLEMENTED = 'not_implemented',
  BAD_GATEWAY = 'bad_gateway',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  GATEWAY_TIMEOUT = 'gateway_timeout',
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
  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.BAD_GATEWAY]: 502,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.GATEWAY_TIMEOUT]: 504,
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

export function handleError(error: unknown): NextResponse<ApiError> {
  console.error('[API_ERROR]', error);

  let errorResponse: ApiError;
  let status: number;

  if (error instanceof ApiErrorResponse) {
    errorResponse = {
      error: error.message,
      code: error.code,
      details: error.details,
      timestamp: new Date().toISOString(),
      retryAfter: error.retryAfter,
      suggestions: error.suggestions,
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

  return NextResponse.json(errorResponse, { status });
}
