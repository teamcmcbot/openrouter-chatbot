// lib/utils/openrouter.ts

import fs from 'fs';
import path from 'path';
import { ApiErrorResponse, ErrorCode } from './errors';
import { getEnvVar, isUserTrackingEnabled } from './env';
import { logger } from './logger';
import {
  OpenRouterResponse,
  OpenRouterModelsResponse,
  OpenRouterModel,
  ModelInfo,
  OpenRouterContentBlock,
} from '../types/openrouter';
import { AuthContext } from '../types/auth';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_MODEL = process.env.OPENROUTER_API_MODEL || 'deepseek/deepseek-r1-0528:free';
const OPENROUTER_MAX_TOKENS = parseInt(process.env.OPENROUTER_MAX_TOKENS || '5000', 10);

// Types local to this module to allow 'system' messages internally
export type OpenRouterMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenRouterContentBlock[];
};
export type OpenRouterRequestWithSystem = {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  plugins?: { id: string; max_results?: number }[];
  user?: string;
};

// ----- Root system prompt helpers -----
let cachedRootPrompt: string | null = null;
function loadRootSystemPrompt(brand: string): string {
  if (cachedRootPrompt) return cachedRootPrompt.replace(/\{\{BRAND\}\}/g, brand);
  const fileEnv = process.env.OPENROUTER_ROOT_PROMPT_FILE?.trim();
  if (fileEnv) {
    const abs = path.isAbsolute(fileEnv) ? fileEnv : path.join(process.cwd(), fileEnv);
    if (fs.existsSync(abs)) {
      try {
        cachedRootPrompt = fs.readFileSync(abs, 'utf8');
      } catch (e) {
        console.warn(`[rootPrompt] Failed to read file '${abs}', falling back to minimal prompt:`, (e as Error).message);
      }
    } else {
      console.warn(`[rootPrompt] File '${abs}' not found. Falling back to minimal prompt.`);
    }
  }
  if (!cachedRootPrompt) {
    cachedRootPrompt = 'You are an AI assistant running inside the {{BRAND}} app.';
  }
  return cachedRootPrompt.replace(/\{\{BRAND\}\}/g, brand).replace(/\$\{brand\}/g, brand);
}
function appendSystemPrompt(messages: OpenRouterMessage[], userSystemPrompt?: string): OpenRouterMessage[] {
  const brand = process.env.BRAND_NAME || 'YourBrand';
  const rootPrompt = loadRootSystemPrompt(brand);
  const systemMessages: OpenRouterMessage[] = [{ role: 'system', content: rootPrompt }];
  if (userSystemPrompt) {
    systemMessages.push({ role: 'system', content: `USER CUSTOM PROMPT START: ${userSystemPrompt}.` });
  }
  return [...systemMessages, ...messages.filter((m) => m.role !== 'system')];
}

// ----- Retry configs and utilities -----
const MODELS_API_RETRY_CONFIG = { maxRetries: 3, baseDelay: 1000, maxDelay: 10000, jitterFactor: 0.1 } as const;
const COMPLETION_RETRY_CONFIG = { maxRetries: 3, baseDelay: 1000, maxDelay: 10000, jitterFactor: 0.1 } as const;

function withJitter(base: number) {
  return base + base * (MODELS_API_RETRY_CONFIG.jitterFactor * Math.random());
}
function calculateRetryDelay(attempt: number): number {
  return Math.min(withJitter(MODELS_API_RETRY_CONFIG.baseDelay * 2 ** attempt), MODELS_API_RETRY_CONFIG.maxDelay);
}
function calculateCompletionRetryDelay(attempt: number): number {
  return Math.min(withJitter(COMPLETION_RETRY_CONFIG.baseDelay * 2 ** attempt), COMPLETION_RETRY_CONFIG.maxDelay);
}
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ----- Helpers -----
function isNoContentGenerated(response: OpenRouterResponse): boolean {
  const content = response.choices?.[0]?.message?.content;
  return !content || content.trim() === '';
}

function getAlternativeModels(currentModel: string): string[] {
  try {
    const modelsList = getEnvVar('OPENROUTER_MODELS_LIST', '');
    if (!modelsList) return [];
    const allModels = modelsList.split(',').map((m) => m.trim());
    return allModels.filter((m) => m !== currentModel && m.includes(':free'));
  } catch {
    return ['google/gemini-2.0-flash-exp:free', 'openrouter/cypher-alpha:free', 'deepseek/deepseek-r1-0528:free'];
  }
}

// ----- Non-streaming completion -----
export async function getOpenRouterCompletion(
  messages: OpenRouterMessage[],
  model?: string,
  maxTokens?: number,
  temperature?: number,
  systemPrompt?: string,
  authContext?: AuthContext | null,
  options?: { webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' } }
): Promise<OpenRouterResponse> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');
  const selectedModel = model ?? OPENROUTER_API_MODEL;
  const dynamicMaxTokens = maxTokens ?? OPENROUTER_MAX_TOKENS;

  // Resolve temperature/system prompt from authContext
  let finalTemperature = 0.7;
  let finalSystemPrompt: string | undefined = undefined;
  if (authContext?.profile) {
    finalTemperature = typeof authContext.profile.temperature === 'number' ? authContext.profile.temperature : (typeof temperature === 'number' ? temperature : finalTemperature);
    finalSystemPrompt = authContext.profile.system_prompt || systemPrompt;
  } else {
    finalTemperature = typeof temperature === 'number' ? temperature : finalTemperature;
    finalSystemPrompt = systemPrompt;
  }

  const finalMessages = appendSystemPrompt(messages, finalSystemPrompt);

  type ReasoningOption = { effort?: 'low' | 'medium' | 'high' };
  type OpenRouterRequestWithReasoning = OpenRouterRequestWithSystem & { reasoning?: ReasoningOption };
  const requestBody: OpenRouterRequestWithReasoning = {
    model: selectedModel,
    messages: finalMessages,
    max_tokens: dynamicMaxTokens,
    temperature: finalTemperature,
  };

  try {
    if (isUserTrackingEnabled() && authContext?.isAuthenticated && authContext.user?.id) {
      requestBody.user = authContext.user.id;
    }
  } catch (e) {
    logger.warn('Failed to attach user tracking to OpenRouter request:', e);
  }

  if (options?.webSearch) {
    const maxResults = Number.isFinite(options.webMaxResults as number) ? Math.max(1, Math.min(10, Math.trunc(options.webMaxResults as number))) : 3;
    requestBody.plugins = [{ id: 'web', max_results: maxResults }];
  }
  if (options?.reasoning) requestBody.reasoning = options.reasoning;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= COMPLETION_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}` },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new ApiErrorResponse(
          `OpenRouter API error: ${response.status} ${response.statusText}`,
          response.status >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST,
          errorBody
        );
      }
      const json: unknown = await response.json();
      const j = json as { error?: { message?: string; code?: number } };
      if (j && j.error) {
        const e = j.error;
        throw new ApiErrorResponse(e.message || 'Unknown error from OpenRouter', (e.code || 500) >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST, JSON.stringify(json));
      }
      if (isNoContentGenerated(json as OpenRouterResponse)) {
        lastError = new Error(`No content generated by model ${selectedModel} (attempt ${attempt + 1})`);
        if (attempt >= COMPLETION_RETRY_CONFIG.maxRetries) break;
        await sleep(calculateCompletionRetryDelay(attempt));
        continue;
      }
      return json as OpenRouterResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ApiErrorResponse) {
        if ([ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.TOO_MANY_REQUESTS].includes(error.code)) throw error;
      }
      if (attempt < COMPLETION_RETRY_CONFIG.maxRetries) {
        await sleep(calculateCompletionRetryDelay(attempt));
      }
    }
  }

  if (lastError && lastError.message.includes('No content generated')) {
    const alternatives = getAlternativeModels(selectedModel);
    const suggestions = [
      'The model may be warming up from a cold start',
      'Try again in a few moments',
      alternatives.length > 0 ? `Try one of these alternative models: ${alternatives.slice(0, 3).join(', ')}` : 'Switch to a different model from the dropdown',
    ];
    throw new ApiErrorResponse(
      `Model ${selectedModel} failed to generate content after ${COMPLETION_RETRY_CONFIG.maxRetries + 1} attempts. This typically occurs when the model is warming up from a cold start.`,
      ErrorCode.SERVICE_UNAVAILABLE,
      lastError.message,
      60,
      suggestions
    );
  }
  throw new ApiErrorResponse(
    `Failed to get completion after ${COMPLETION_RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`,
    ErrorCode.BAD_GATEWAY,
    lastError?.message
  );
}

// ----- Models API -----
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const apiUrl = getEnvVar('OPENROUTER_MODELS_API_URL', 'https://openrouter.ai/api/v1/models');
  if (!OPENROUTER_API_KEY) throw new ApiErrorResponse('OPENROUTER_API_KEY is not configured', ErrorCode.UNAUTHORIZED);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MODELS_API_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'OpenRouter Chatbot',
          'User-Agent': 'OpenRouter-Chatbot/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const rateLimitReset = response.headers.get('X-RateLimit-Reset');
          const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : rateLimitReset ? Math.max(0, parseInt(rateLimitReset) * 1000 - Date.now()) : calculateRetryDelay(attempt);
          if (attempt < MODELS_API_RETRY_CONFIG.maxRetries) {
            await sleep(delayMs);
            continue;
          }
        }
        if (response.status >= 500 && attempt < MODELS_API_RETRY_CONFIG.maxRetries) {
          const delay = calculateRetryDelay(attempt);
          await sleep(delay);
          continue;
        }
        throw new ApiErrorResponse(
          `OpenRouter API responded with ${response.status}: ${response.statusText}`,
          response.status >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST,
          errorText
        );
      }

      const data: OpenRouterModelsResponse = await response.json();
      if (!data.data || !Array.isArray(data.data)) {
        throw new ApiErrorResponse('Invalid response format from OpenRouter API', ErrorCode.BAD_GATEWAY, JSON.stringify(data));
      }
      return data.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ApiErrorResponse && [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN].includes(error.code)) throw error;
      if (attempt < MODELS_API_RETRY_CONFIG.maxRetries) {
        await sleep(calculateRetryDelay(attempt));
      }
    }
  }
  throw new ApiErrorResponse(
    `Failed to fetch models after ${MODELS_API_RETRY_CONFIG.maxRetries + 1} attempts: ${lastError?.message}`,
    ErrorCode.BAD_GATEWAY,
    lastError?.message
  );
}

// ----- Transforms for frontend -----
export function transformOpenRouterModel(model: OpenRouterModel): ModelInfo {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    context_length: model.context_length,
    pricing: {
      prompt: model.pricing.prompt,
      completion: model.pricing.completion,
      request: model.pricing.request,
      image: model.pricing.image,
      web_search: model.pricing.web_search,
      internal_reasoning: model.pricing.internal_reasoning,
      input_cache_read: model.pricing.input_cache_read,
      input_cache_write: model.pricing.input_cache_write,
    },
    input_modalities: model.architecture.input_modalities,
    output_modalities: model.architecture.output_modalities,
    supported_parameters: model.supported_parameters,
    created: model.created,
  };
}

export function transformDatabaseModel(row: {
  model_id: string;
  canonical_slug?: string;
  hugging_face_id?: string;
  model_name?: string;
  model_description?: string;
  context_length?: number;
  created_timestamp?: number;
  modality?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  tokenizer?: string;
  prompt_price?: string;
  completion_price?: string;
  request_price?: string;
  image_price?: string;
  web_search_price?: string;
  internal_reasoning_price?: string;
  input_cache_read_price?: string;
  input_cache_write_price?: string;
  max_completion_tokens?: number;
  is_moderated?: boolean;
  supported_parameters?: string[];
  status: string;
  is_free: boolean;
  is_pro: boolean;
  is_enterprise: boolean;
  daily_limit?: number;
  monthly_limit?: number;
  last_synced_at?: string;
  openrouter_last_seen?: string;
  created_at?: string;
  updated_at?: string;
}): ModelInfo {
  return {
    id: row.model_id,
    name: row.model_name || row.model_id,
    description: row.model_description || '',
    context_length: row.context_length || 8192,
    pricing: {
      prompt: row.prompt_price || '0',
      completion: row.completion_price || '0',
      request: row.request_price || '0',
      image: row.image_price || '0',
      web_search: row.web_search_price || '0',
      internal_reasoning: row.internal_reasoning_price || '0',
      input_cache_read: row.input_cache_read_price,
      input_cache_write: row.input_cache_write_price,
    },
    input_modalities: row.input_modalities || [],
    output_modalities: row.output_modalities || [],
    supported_parameters: row.supported_parameters || [],
    created: row.created_timestamp || Math.floor(Date.now() / 1000),
  };
}

export function filterAllowedModels(models: OpenRouterModel[], allowedModels: string[]): OpenRouterModel[] {
  if (allowedModels.length === 0) {
    logger.warn('No allowed models configured, returning all models');
    return models;
  }
  const filtered = models.filter((m) => allowedModels.includes(m.id));
  if (filtered.length === 0) logger.warn('No models match the allowed list');
  return filtered;
}

// ----- Streaming completion (Phase 1 SSE, annotations accumulation, reasoning gate) -----
export async function getOpenRouterCompletionStream(
  messages: OpenRouterMessage[],
  model?: string,
  maxTokens?: number,
  temperature?: number,
  systemPrompt?: string,
  authContext?: AuthContext | null,
  options?: { webSearch?: boolean; webMaxResults?: number; reasoning?: { effort?: 'low' | 'medium' | 'high' } }
): Promise<ReadableStream> {
  // STREAM_DEBUG toggle
  const STREAM_DEBUG = process.env.STREAM_DEBUG === '1';
  // Rollout flags (Phase 6)
  const STREAM_MARKERS_ENABLED = (process.env.STREAM_MARKERS_ENABLED || '1') === '1';
  const STREAM_REASONING_ENABLED = (process.env.STREAM_REASONING_ENABLED || '1') === '1';
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');
  const selectedModel = model ?? OPENROUTER_API_MODEL;
  const dynamicMaxTokens = maxTokens ?? OPENROUTER_MAX_TOKENS;

  let finalTemperature = 0.7;
  let finalSystemPrompt: string | undefined = undefined;
  if (authContext?.profile) {
    finalTemperature = typeof authContext.profile.temperature === 'number' ? authContext.profile.temperature : (typeof temperature === 'number' ? temperature : finalTemperature);
    finalSystemPrompt = authContext.profile.system_prompt || systemPrompt;
  } else {
    finalTemperature = typeof temperature === 'number' ? temperature : finalTemperature;
    finalSystemPrompt = systemPrompt;
  }

  const finalMessages = appendSystemPrompt(messages, finalSystemPrompt);
  type ReasoningOption = { effort?: 'low' | 'medium' | 'high' };
  type OpenRouterRequestWithReasoning = OpenRouterRequestWithSystem & { reasoning?: ReasoningOption };
  const requestBody: OpenRouterRequestWithReasoning = {
    model: selectedModel,
    messages: finalMessages,
    max_tokens: dynamicMaxTokens,
    temperature: finalTemperature,
    stream: true,
  };

  try {
    if (isUserTrackingEnabled() && authContext?.isAuthenticated && authContext.user?.id) {
      requestBody.user = authContext.user.id;
    }
  } catch (e) {
    logger.warn('Failed to attach user tracking to OpenRouter stream request:', e);
  }

  if (options?.webSearch) {
    const maxResults = Number.isFinite(options.webMaxResults as number) ? Math.max(1, Math.min(10, Math.trunc(options.webMaxResults as number))) : 3;
    requestBody.plugins = [{ id: 'web', max_results: maxResults }];
  }
  if (options?.reasoning) requestBody.reasoning = options.reasoning;

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify(requestBody),
  });
  if (STREAM_DEBUG) {
    logger.info('STREAM_DEBUG OpenRouter request', {
      model: requestBody.model,
      webSearch: !!options?.webSearch,
      reasoning: !!options?.reasoning,
      max_tokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
    });
  }
  if (!response.ok) {
    const errorBody = await response.text();
    throw new ApiErrorResponse(
      `OpenRouter streaming API error: ${response.status} ${response.statusText}`,
      response.status >= 500 ? ErrorCode.BAD_GATEWAY : ErrorCode.BAD_REQUEST,
      errorBody
    );
  }
  if (!response.body) throw new ApiErrorResponse('No response body received from OpenRouter streaming API', ErrorCode.BAD_GATEWAY);

  const streamMetadata: {
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    id?: string;
    reasoning?: string;
    reasoning_details?: Record<string, unknown>[];
    annotations?: { type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }[];
  } = {};

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  // allowReasoning: requested + reasoning flag
  const allowReasoning = !!options?.reasoning && STREAM_REASONING_ENABLED;
  if (STREAM_DEBUG) logger.info('STREAM_DEBUG streaming start');

  type UrlCitation = { type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number };
  function isObject(x: unknown): x is Record<string, unknown> {
    return typeof x === 'object' && x !== null;
  }
  function isUrlCitationShape(x: unknown): x is { url: string; title?: string; content?: string; start_index?: number; end_index?: number } {
    if (!isObject(x)) return false;
    const url = x['url'];
    return typeof url === 'string' && url.length > 0;
  }
  function normalizeAnnotation(ann: unknown): UrlCitation | null {
    if (!isObject(ann)) return null;
    const a = ann as Record<string, unknown>;
    const typeVal = a['type'];
    if (typeVal === 'url_citation' && isUrlCitationShape(a)) {
      const url = a['url'] as string;
      const title = typeof a['title'] === 'string' ? (a['title'] as string) : undefined;
      const content = typeof a['content'] === 'string' ? (a['content'] as string) : undefined;
      const start_index = typeof a['start_index'] === 'number' ? (a['start_index'] as number) : undefined;
      const end_index = typeof a['end_index'] === 'number' ? (a['end_index'] as number) : undefined;
      return { type: 'url_citation', url, title, content, start_index, end_index };
    }
    const nested = a['url_citation'];
    if (isUrlCitationShape(nested)) {
      const url = nested.url;
      const title = typeof nested.title === 'string' ? nested.title : undefined;
      const content = typeof nested.content === 'string' ? nested.content : undefined;
      const start_index = typeof nested.start_index === 'number' ? nested.start_index : undefined;
      const end_index = typeof nested.end_index === 'number' ? nested.end_index : undefined;
      return { type: 'url_citation', url, title, content, start_index, end_index };
    }
    if (isUrlCitationShape(a)) {
      const url = a['url'] as string;
      const title = typeof a['title'] === 'string' ? (a['title'] as string) : undefined;
      const content = typeof a['content'] === 'string' ? (a['content'] as string) : undefined;
      const start_index = typeof a['start_index'] === 'number' ? (a['start_index'] as number) : undefined;
      const end_index = typeof a['end_index'] === 'number' ? (a['end_index'] as number) : undefined;
      return { type: 'url_citation', url, title, content, start_index, end_index };
    }
    return null;
  }

  const aggregatedAnnotations: UrlCitation[] = [];
  const seenAnnUrls = new Set<string>();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sseBuffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (STREAM_DEBUG) logger.info('STREAM_DEBUG upstream done; flushing metadata');
            const metadataChunk = JSON.stringify({ type: 'metadata', data: streamMetadata });
            controller.enqueue(encoder.encode(`\n\n__METADATA__${metadataChunk}__END__\n\n`));
            controller.close();
            break;
          }

          const decoded = decoder.decode(value, { stream: true });
          if (STREAM_DEBUG) logger.info('STREAM_DEBUG chunk', { bytes: value?.byteLength, preview: decoded.slice(0, 120) });
          sseBuffer += decoded;
          const normalized = sseBuffer.replace(/\r\n/g, '\n');
          const events = normalized.split('\n\n');
          sseBuffer = events.pop() || '';

          for (const evt of events) {
            // Extract data lines per SSE
            const dataLines = evt
              .split('\n')
              .map((l) => l.match(/^data:\s?(.*)$/))
              .filter((m): m is RegExpMatchArray => !!m)
              .map((m) => m[1]);
            const payload = dataLines.join('\n').trim();
            if (!payload || payload === '[DONE]') continue;
            if (STREAM_DEBUG) logger.info('STREAM_DEBUG event payload', { size: payload.length, head: payload.slice(0, 100) });

            try {
              const data: unknown = JSON.parse(payload);
              type Delta = { content?: string; reasoning?: string; annotations?: unknown[] };
              type Msg = { content?: string; reasoning?: string; annotations?: unknown[] };
              type Choice = { delta?: Delta; message?: Msg };
              type SSEChunk = {
                id?: string;
                usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
                choices?: Choice[];
                annotations?: unknown[];
                reasoning?: unknown;
              };
              const d = data as SSEChunk;

              if (d.usage) streamMetadata.usage = d.usage;
              if (d.id) streamMetadata.id = d.id;

              if (allowReasoning && d.choices?.[0]?.delta?.reasoning) {
                if (!streamMetadata.reasoning) streamMetadata.reasoning = '';
                streamMetadata.reasoning += d.choices[0].delta.reasoning;
                const text = String(d.choices[0].delta.reasoning || '').trim();
                if (text && STREAM_MARKERS_ENABLED) {
                  const out = `__REASONING_CHUNK__${JSON.stringify({ type: 'reasoning', data: d.choices[0].delta.reasoning })}\n`;
                  if (STREAM_DEBUG) logger.info('STREAM_DEBUG emit reasoning chunk', { len: text.length });
                  controller.enqueue(encoder.encode(out));
                }
              }
              if (allowReasoning && d.choices?.[0]?.message?.reasoning) {
                streamMetadata.reasoning = d.choices[0].message.reasoning;
              }
              if (allowReasoning && Array.isArray(d.reasoning) && d.reasoning.every(isObject)) {
                streamMetadata.reasoning_details = d.reasoning as Record<string, unknown>[];
              }

              const candidates: unknown[] = [];
              if (Array.isArray(d.choices?.[0]?.message?.annotations)) candidates.push(...d.choices[0].message.annotations);
              if (Array.isArray(d.choices?.[0]?.delta?.annotations)) candidates.push(...d.choices[0].delta.annotations);
              if (Array.isArray(d.annotations)) candidates.push(...d.annotations);
              if (candidates.length) {
                let added = 0;
                for (const c of candidates) {
                  const n = normalizeAnnotation(c);
                  if (!n) continue;
                  const key = n.url.toLowerCase();
                  if (!seenAnnUrls.has(key)) {
                    seenAnnUrls.add(key);
                    aggregatedAnnotations.push(n);
                    added++;
                  }
                }
                if (added > 0) {
                  streamMetadata.annotations = aggregatedAnnotations;
                  if (STREAM_MARKERS_ENABLED) {
                    const out = `__ANNOTATIONS_CHUNK__${JSON.stringify({ type: 'annotations', data: aggregatedAnnotations })}\n`;
                    if (STREAM_DEBUG) logger.info('STREAM_DEBUG emit annotations', { total: aggregatedAnnotations.length, added });
                    controller.enqueue(encoder.encode(out));
                  }
                }
              }

              if (d.choices?.[0]?.delta?.content) {
                let contentChunk: string = d.choices[0].delta.content;
                const reasoningDetailsRegex = /__REASONING_DETAILS_CHUNK__\{[^}]*\}/g;
                const reasoningChunkRegex = /__REASONING_CHUNK__\{[^}]*\}/g;

                // extract and forward embedded markers
                let m: RegExpExecArray | null;
                while ((m = reasoningDetailsRegex.exec(contentChunk)) !== null) {
                  try {
                    const embedded = JSON.parse(m[0].replace('__REASONING_DETAILS_CHUNK__', '')) as { type?: string; data?: unknown[] };
                    if (embedded?.type === 'reasoning_details' && Array.isArray(embedded.data) && embedded.data.length > 0) {
                      const out = `__REASONING_DETAILS_CHUNK__${JSON.stringify({ type: 'reasoning_details', data: embedded.data })}\n`;
                      controller.enqueue(encoder.encode(out));
                    }
                  } catch {}
                }
                reasoningChunkRegex.lastIndex = 0;
                while ((m = reasoningChunkRegex.exec(contentChunk)) !== null) {
                  try {
                    const embedded = JSON.parse(m[0].replace('__REASONING_CHUNK__', '')) as { type?: string; data?: string };
                    if (embedded?.type === 'reasoning' && typeof embedded.data === 'string' && embedded.data.trim()) {
                      const out = `__REASONING_CHUNK__${JSON.stringify(embedded)}\n`;
                      controller.enqueue(encoder.encode(out));
                    }
                  } catch {}
                }

                contentChunk = contentChunk.replace(reasoningDetailsRegex, '').replace(reasoningChunkRegex, '');
                if (contentChunk) {
                  if (STREAM_DEBUG) logger.info('STREAM_DEBUG emit content', { len: contentChunk.length, head: contentChunk.slice(0, 60) });
                  controller.enqueue(encoder.encode(contentChunk));
                }
              }
            } catch (e) {
              if (STREAM_DEBUG) logger.warn('STREAM_DEBUG JSON parse error; skipping event', e);
              // ignore partial/invalid JSON events
            }
          }
        }
      } catch (err) {
        if (STREAM_DEBUG) logger.error('STREAM_DEBUG stream error', err);
        controller.error(err);
      }
    },
  });
}
