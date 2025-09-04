// src/app/api/chat/sync/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { coerceReasoningDetailsToArray } from '../../../../../lib/utils/reasoning';
import { ChatMessage } from '../../../../../lib/types/chat';
import type { OpenRouterUrlCitation } from '../../../../../lib/types/openrouter';
import { withConversationOwnership } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { logger } from '../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';

interface SyncResult {
  conversationId: string;
  status?: string;
  messageCount?: number;
  error?: string;
}

interface ConversationSync {
  id: string;
  title: string;
  userId: string;
  messages: ChatMessage[];
  messageCount?: number;
  totalTokens?: number;
  lastModel?: string;
  lastMessagePreview?: string;
  lastMessageTimestamp?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DatabaseMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  model?: string;
  total_tokens: number;
  input_tokens: number; // NEW: input token tracking
  output_tokens: number; // NEW: output token tracking
  user_message_id?: string; // NEW: links assistant messages to user messages
  content_type?: string; // New: content type field
  elapsed_ms?: number; // New: elapsed time field (ms)
  completion_id?: string; // New: completion ID field
  message_timestamp: string;
  error_message?: string;
  is_streaming: boolean;
  // Web search metadata (assistant messages)
  has_websearch?: boolean;
  websearch_result_count?: number;
  // Reasoning fields (assistant messages)
  reasoning?: string | null;
  reasoning_details?: Record<string, unknown> | null;
}

interface DatabaseSession {
  id: string;
  user_id: string;
  title: string;
  message_count: number;
  total_tokens: number;
  last_model?: string;
  last_message_preview?: string;
  last_message_timestamp?: string;
  created_at: string;
  updated_at: string;
  chat_messages: DatabaseMessage[];
}

async function syncHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
  logger.debug('Chat sync request received', { userId: authContext.user?.id, requestId });
    
    const supabase = await createClient();
    const { user } = authContext;

    // Validate sync access
    if (!authContext.features.canSyncConversations) {
      throw new ApiErrorResponse(
        'Conversation sync not available for your subscription tier',
        ErrorCode.FEATURE_NOT_AVAILABLE
      );
    }

    const { conversations }: { conversations: ConversationSync[] } = await request.json();

    if (!Array.isArray(conversations)) {
      throw new ApiErrorResponse(
        'Invalid conversations data',
        ErrorCode.BAD_REQUEST
      );
    }

    // Sync conversations to database
    const syncResults = {
      synced: 0,
      errors: 0,
      details: [] as SyncResult[]
    };

    for (const conversation of conversations) {
      try {
        // Conversation ownership is already validated by middleware
        // Use original conversation ID directly (database should accept TEXT)
        const databaseId = conversation.id;

        // Upsert chat session with original client ID
        const { error: sessionError } = await supabase
          .from('chat_sessions')
          .upsert({
            id: databaseId,
            user_id: user!.id,
            title: conversation.title,
            message_count: conversation.messageCount || 0,
            total_tokens: conversation.totalTokens || 0,
            last_model: conversation.lastModel,
            last_message_preview: conversation.lastMessagePreview,
            last_message_timestamp: conversation.lastMessageTimestamp,
            updated_at: conversation.updatedAt || new Date().toISOString()
          })
          .select()
          .single();

        if (sessionError) {
          throw sessionError;
        }

        // Sync messages for this conversation
        if (conversation.messages && conversation.messages.length > 0) {
          const messagesData = conversation.messages.map((message: ChatMessage) => {
            // Prefer originalModel for user messages when present (aligns with /api/chat/messages payloads)
            const resolvedModel = message.model ?? (message.role === 'user' ? message.originalModel : undefined);

            // Strictly sanitize content type
            const contentType = message.contentType === 'markdown' ? 'markdown' : 'text';

            // Websearch fields: assistant-only; never null
            const hasWeb = message.role === 'assistant' ? Boolean(message.has_websearch) : false;
            const webCount = message.role === 'assistant' && typeof message.websearch_result_count === 'number'
              ? message.websearch_result_count
              : 0;

            // Attachment flags derived from attachment_ids or explicit has_attachments
            const attCount = Array.isArray(message.attachment_ids) ? Math.min(Math.max(message.attachment_ids.length, 0), 3) : 0;
            const hasAtts = typeof message.has_attachments === 'boolean'
              ? message.has_attachments
              : attCount > 0;

            // Metadata parity with messages route
            const metadata: Record<string, unknown> = {};
            if (typeof message.requested_web_search === 'boolean') metadata.requested_web_search = message.requested_web_search;
            if (typeof message.requested_web_max_results === 'number') metadata.requested_web_max_results = message.requested_web_max_results;
            if (typeof message.requested_reasoning_effort === 'string') metadata.requested_reasoning_effort = message.requested_reasoning_effort;
            if (message.upstream_error_code !== undefined) metadata.upstream_error_code = message.upstream_error_code;
            if (typeof message.upstream_error_message === 'string' && message.upstream_error_message.length > 0) metadata.upstream_error_message = message.upstream_error_message;
            if (typeof message.retry_after === 'number') metadata.upstream_retry_after = message.retry_after;
            if (Array.isArray(message.suggestions)) metadata.upstream_suggestions = message.suggestions;

            return {
              id: message.id, // Use original message ID
              session_id: databaseId, // This is now the original conversation ID
              role: message.role,
              content: message.content,
              model: resolvedModel,
              total_tokens: message.total_tokens || 0,
              input_tokens: message.input_tokens || 0, // NEW: input token tracking
              output_tokens: message.output_tokens || 0, // NEW: output token tracking
              user_message_id: message.user_message_id || null, // NEW: user message linking
              content_type: contentType, // New: content type (sanitized)
              elapsed_ms: message.elapsed_ms || 0, // New: elapsed time (ms)
              completion_id: message.completion_id || null, // New: completion ID
              // Reasoning fields
              reasoning: message.reasoning ?? null,
              reasoning_details: message.reasoning_details ?? null,
              // Web search fields (NOT NULL safe)
              has_websearch: hasWeb,
              websearch_result_count: webCount,
              // Attachment flags (NOT NULL safe)
              has_attachments: hasAtts,
              attachment_count: attCount,
              // Optional metadata JSONB (omit when empty to let default apply)
              ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
              message_timestamp: typeof message.timestamp === 'string'
                ? message.timestamp
                : message.timestamp?.toISOString() || new Date().toISOString(),
              error_message: message.error ? 'Message failed' : undefined,
              // Preserve original streaming mode used on client for this message
              is_streaming: (message as ChatMessage).was_streaming === true
            };
          });

          const { error: messagesError } = await supabase
            .from('chat_messages')
            .upsert(messagesData);

          if (messagesError) {
            throw messagesError;
          }

          // Persist annotations for assistant messages, if provided
          const annotated = conversation.messages.filter(m => m.role === 'assistant' && Array.isArray(m.annotations) && m.annotations.length > 0);
          if (annotated.length > 0) {
            const annotatedIds = annotated.map(m => m.id);
            // Remove existing annotations for these messages to avoid duplicates, then insert fresh
            const { error: delErr } = await supabase
              .from('chat_message_annotations')
              .delete()
              .in('message_id', annotatedIds);
            if (delErr) {
              logger.warn('Failed to delete existing annotations during sync', { error: delErr.message });
            }
            const rows = annotated.flatMap(m => (m.annotations || []).map(a => ({
              user_id: user!.id,
              session_id: databaseId,
              message_id: m.id,
              annotation_type: 'url_citation',
              url: a.url,
              title: a.title ?? null,
              content: a.content ?? null,
              start_index: typeof a.start_index === 'number' ? a.start_index : null,
              end_index: typeof a.end_index === 'number' ? a.end_index : null,
            })));
            if (rows.length > 0) {
              const { error: insErr } = await supabase
                .from('chat_message_annotations')
                .insert(rows);
              if (insErr) {
                logger.warn('Failed to insert annotations during sync', { error: insErr.message });
              }
            }
          }
        }

        syncResults.synced++;
        syncResults.details.push({
          conversationId: conversation.id,
          status: 'synced',
          messageCount: conversation.messages?.length || 0
        });

      } catch (error) {
        logger.error('Error syncing conversation:', { conversationId: conversation.id, error });
        syncResults.errors++;
        syncResults.details.push({
          conversationId: conversation.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const durationMs = Date.now() - t0;
    logger.info('Chat sync completed', {
      synced: syncResults.synced,
      errors: syncResults.errors,
      requestId,
      durationMs,
    });

    // Return sync results directly (not wrapped in data object) to match frontend expectations
    return NextResponse.json({
      success: true,
      results: syncResults,
      syncTime: new Date().toISOString()
    }, { headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('Sync endpoint error:', error);
  return handleError(error, requestId, '/api/chat/sync');
  }
}

async function getConversationsHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((request as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
  logger.debug('Get conversations request received', { userId: authContext.user?.id, requestId });
    
    const supabase = await createClient();
    const { user } = authContext;

    // Validate sync access
    if (!authContext.features.canSyncConversations) {
      throw new ApiErrorResponse(
        'Conversation sync not available for your subscription tier',
        ErrorCode.FEATURE_NOT_AVAILABLE
      );
    }

    // Parse query params (support both NextRequest and plain Request in tests)
    const rawUrl = (request as unknown as { nextUrl?: { toString?: () => string }; url?: string })?.nextUrl?.toString?.()
      || (request as unknown as { url?: string })?.url
      || 'http://localhost/api/chat/sync';
    const params = new URL(rawUrl, 'http://localhost').searchParams;
    const limitParam = parseInt(params.get('limit') || '', 10);
    // Cap page size at 20 as per product decision
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 20;
    const cursorTs = params.get('cursor_ts');
    const cursorId = params.get('cursor_id');
    const direction = (params.get('direction') || 'before').toLowerCase();
    const withTotal = params.get('with_total') === 'true';
    // Default summary_only to true (lean payloads for sidebar)
    const summaryOnly = params.get('summary_only') === 'false' ? false : true;

    type ConversationOut = {
      id: string;
      title: string;
      userId: string;
      messages: ChatMessage[];
      createdAt: string;
      updatedAt: string;
      messageCount: number;
      totalTokens: number;
      lastModel?: string;
      lastMessagePreview?: string;
      lastMessageTimestamp?: string;
      isActive: boolean;
    };

    let conversations: ConversationOut[] = [];
    let hasMore = false;
    let totalCount: number | null = null;

    if (summaryOnly) {
      // SUMMARY MODE
      let query = supabase
        .from('chat_sessions')
        .select('*', { count: withTotal ? 'exact' : undefined })
        .eq('user_id', user!.id)
        .order('last_message_timestamp', { ascending: false })
        .order('id', { ascending: false });

      if (cursorTs && direction === 'before') {
        if (cursorId) {
          const orExpr: string = `last_message_timestamp.lt."${cursorTs}",and(last_message_timestamp.eq."${cursorTs}",id.lt."${cursorId}")`;
          query = query.or(orExpr);
        } else {
          query = query.lt('last_message_timestamp', cursorTs);
        }
      }

      const { data: rows, error: qErr, count } = await query.limit(limit + 1);
      if (qErr) throw qErr;
      totalCount = typeof count === 'number' ? count : null;

      const pageRows: DatabaseSession[] = (rows || []) as unknown as DatabaseSession[];
      if (pageRows.length > limit) {
        hasMore = true;
        pageRows.length = limit;
      }

      conversations = pageRows.map(session => ({
        id: session.id,
        title: session.title,
        userId: session.user_id,
        messages: [],
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        messageCount: session.message_count,
        totalTokens: session.total_tokens,
        lastModel: session.last_model,
        lastMessagePreview: session.last_message_preview,
        lastMessageTimestamp: session.last_message_timestamp,
        isActive: false,
      }));
    } else {
      // FULL MODE
      let query = supabase
        .from('chat_sessions')
        .select('*, chat_messages (*)', { count: withTotal ? 'exact' : undefined })
        .eq('user_id', user!.id)
        .order('last_message_timestamp', { ascending: false })
        .order('id', { ascending: false });

      if (cursorTs && direction === 'before') {
        if (cursorId) {
          const orExpr: string = `last_message_timestamp.lt."${cursorTs}",and(last_message_timestamp.eq."${cursorTs}",id.lt."${cursorId}")`;
          query = query.or(orExpr);
        } else {
          query = query.lt('last_message_timestamp', cursorTs);
        }
      }

      const { data: rows, error: qErr, count } = await query.limit(limit + 1);
      if (qErr) throw qErr;
      totalCount = typeof count === 'number' ? count : null;

      const pageRows: DatabaseSession[] = (rows || []) as unknown as DatabaseSession[];
      if (pageRows.length > limit) {
        hasMore = true;
        pageRows.length = limit;
      }

      const allMessageIds: string[] = [];
      pageRows.forEach(session => {
        session.chat_messages?.forEach((m: DatabaseMessage) => {
          if (m.id) allMessageIds.push(m.id);
        });
      });

      const attachmentsByMessage: Record<string, string[]> = {};
      const annotationsByMessage: Record<string, OpenRouterUrlCitation[]> = {};
      if (allMessageIds.length > 0) {
        const { data: atts, error: attErr } = await supabase
          .from('chat_attachments')
          .select('id, message_id, status')
          .in('message_id', allMessageIds)
          .eq('status', 'ready');
        if (attErr) throw attErr;
        if (Array.isArray(atts)) {
          for (const row of atts as { id: string; message_id: string }[]) {
            const list = attachmentsByMessage[row.message_id] || (attachmentsByMessage[row.message_id] = []);
            list.push(row.id);
          }
        }

        const { data: anns, error: annErr } = await supabase
          .from('chat_message_annotations')
          .select('message_id, annotation_type, url, title, content, start_index, end_index')
          .in('message_id', allMessageIds);
        if (annErr) throw annErr;
        if (Array.isArray(anns)) {
          for (const row of anns as { message_id: string; annotation_type: string; url: string; title?: string | null; content?: string | null; start_index?: number | null; end_index?: number | null }[]) {
            if (row.annotation_type !== 'url_citation' || typeof row.url !== 'string') continue;
            const list = annotationsByMessage[row.message_id] || (annotationsByMessage[row.message_id] = []);
            list.push({
              type: 'url_citation',
              url: row.url,
              title: row.title ?? undefined,
              content: row.content ?? undefined,
              start_index: typeof row.start_index === 'number' ? row.start_index : undefined,
              end_index: typeof row.end_index === 'number' ? row.end_index : undefined,
            });
          }
        }
      }

      conversations = pageRows.map(session => ({
        id: session.id,
        title: session.title,
        userId: session.user_id,
        messages: session.chat_messages
          .filter((m: DatabaseMessage) => m.role === 'user' || m.role === 'assistant')
          .sort((a: DatabaseMessage, b: DatabaseMessage) =>
            new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
          )
          .map((message: DatabaseMessage) => ({
            id: message.id,
            role: message.role as 'user' | 'assistant',
            content: message.content,
            model: message.model,
            total_tokens: message.total_tokens,
            input_tokens: message.input_tokens || 0,
            output_tokens: message.output_tokens || 0,
            user_message_id: message.user_message_id || undefined,
            contentType: message.content_type === 'markdown' ? 'markdown' : 'text',
            elapsed_ms: message.elapsed_ms || 0,
            completion_id: message.completion_id || undefined,
            has_websearch: !!message.has_websearch,
            websearch_result_count: typeof message.websearch_result_count === 'number' ? message.websearch_result_count : 0,
            reasoning: typeof message.reasoning === 'string' ? message.reasoning : undefined,
            // Accept array or object; coerce object to single-element array to match ChatMessage type
            reasoning_details: coerceReasoningDetailsToArray(message.reasoning_details),
            annotations: annotationsByMessage[message.id] || [],
            has_attachments: Array.isArray(attachmentsByMessage[message.id]) && attachmentsByMessage[message.id].length > 0,
            attachment_ids: attachmentsByMessage[message.id] || [],
            timestamp: new Date(message.message_timestamp),
            error: !!message.error_message,
            ...(message.role === 'user' && message.error_message ? { retry_available: false } : {})
          })),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        messageCount: session.message_count,
        totalTokens: session.total_tokens,
        lastModel: session.last_model,
        lastMessagePreview: session.last_message_preview,
        lastMessageTimestamp: session.last_message_timestamp,
        isActive: false,
      }));
    }

    const last = conversations.length > 0 ? conversations[conversations.length - 1] : null;
    const meta: { pageSize: number; hasMore: boolean; nextCursor: { ts: string; id: string } | null; totalCount?: number } = {
      pageSize: limit,
      hasMore,
      nextCursor: hasMore && last ? { ts: last.lastMessageTimestamp || last.updatedAt || last.createdAt, id: last.id } : null,
      ...(withTotal && totalCount !== null ? { totalCount: totalCount } : {}),
    };

    const durationMs = Date.now() - t0;
    logger.info('Get conversations completed', {
      conversationCount: conversations.length,
      hasMore,
      requestId,
      durationMs,
    });

    return NextResponse.json({
      conversations,
      meta,
      syncTime: new Date().toISOString()
    }, { headers: { 'x-request-id': requestId } });

  } catch (error) {
  logger.error('Get conversations error:', error);
  return handleError(error, requestId, '/api/chat/sync');
  }
}

// Apply authentication middleware with conversation ownership validation and tiered rate limiting
export const POST = withConversationOwnership(
  withTieredRateLimit(syncHandler, { tier: 'tierC' })
);
export const GET = withConversationOwnership(
  withTieredRateLimit(getConversationsHandler, { tier: 'tierC' })
);
