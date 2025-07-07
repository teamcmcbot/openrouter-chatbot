// lib/utils/validation.ts

import { ChatRequest } from '../types';

function isChatRequestBody(body: unknown): body is { message: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof (body as { message?: unknown }).message === 'string'
  );
}

export function validateChatRequest(body: unknown): { data: ChatRequest | null; error: string | null } {
  if (!isChatRequestBody(body) || body.message.trim().length === 0) {
    return { data: null, error: 'Message is required and must be a non-empty string.' };
  }

  if (body.message.length > 4000) {
    return { data: null, error: 'Message cannot exceed 4000 characters.' };
  }

  return { data: { message: body.message }, error: null };
}
