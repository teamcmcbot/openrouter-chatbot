// lib/utils/validation.ts

import { ChatRequest } from '../types';

export function validateChatRequest(body: any): { data: ChatRequest | null; error: string | null } {
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return { data: null, error: 'Message is required and must be a non-empty string.' };
  }

  if (body.message.length > 4000) {
    return { data: null, error: 'Message cannot exceed 4000 characters.' };
  }

  return { data: { message: body.message }, error: null };
}
