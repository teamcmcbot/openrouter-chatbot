// lib/utils/response.ts
import { NextResponse } from 'next/server';
import { ApiResponse } from '../types';

export function createSuccessResponse<T>(data: T, status: number = 200, headers?: Record<string, string>): NextResponse<ApiResponse<T>> {
  const apiResponse: ApiResponse<T> = {
    data,
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(apiResponse, { status, headers });
}
