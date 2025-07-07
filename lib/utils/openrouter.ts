// lib/utils/openrouter.ts
import { OpenRouterRequest, OpenRouterResponse } from '../types/openrouter';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_MODEL = process.env.OPENROUTER_API_MODEL || 'deepseek/deepseek-r1-0528:free';

export async function getOpenRouterCompletion(
  messages: OpenRouterRequest['messages'],
  model?: string
): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const selectedModel = model ?? OPENROUTER_API_MODEL;

  const requestBody: OpenRouterRequest = {
    model: selectedModel,
    messages,
    max_tokens: 1000,
    temperature: 0.7,
  };

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}
