// src/app/api/chat/sync/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage } from '../../../../../lib/types/chat';
import type { OpenRouterUrlCitation } from '../../../../../lib/types/openrouter';
import { withConversationOwnership } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { logger } from '../../../../../lib/utils/logger';
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
  try {
    logger.info('Chat sync request received', { userId: authContext.user?.id });
    
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
          const messagesData = conversation.messages.map((message: ChatMessage) => ({
            id: message.id, // Use original message ID
            session_id: databaseId, // This is now the original conversation ID
            role: message.role,
            content: message.content,
            model: message.model,
            total_tokens: message.total_tokens || 0,
            input_tokens: message.input_tokens || 0, // NEW: input token tracking
            output_tokens: message.output_tokens || 0, // NEW: output token tracking
            user_message_id: message.user_message_id || null, // NEW: user message linking
            content_type: message.contentType || 'text', // New: content type
            elapsed_ms: message.elapsed_ms || 0, // New: elapsed time (ms)
            completion_id: message.completion_id || null, // New: completion ID
            has_websearch: message.has_websearch ?? null,
            websearch_result_count: message.websearch_result_count ?? null,
            // Reasoning fields
            reasoning: message.reasoning ?? null,
            reasoning_details: message.reasoning_details ?? null,
            message_timestamp: typeof message.timestamp === 'string'
              ? message.timestamp
              : message.timestamp?.toISOString() || new Date().toISOString(),
            error_message: message.error ? 'Message failed' : undefined,
            // Preserve original streaming mode used on client for this message
            is_streaming: (message as ChatMessage).was_streaming === true
          }));

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

    logger.info('Chat sync completed', {
      synced: syncResults.synced,
      errors: syncResults.errors,
      userId: user?.id
    });

    // Return sync results directly (not wrapped in data object) to match frontend expectations
    return NextResponse.json({
      success: true,
      results: syncResults,
      syncTime: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Sync endpoint error:', error);
    return handleError(error);
  }
}

async function getConversationsHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  try {
    logger.info('Get conversations request received', { userId: authContext.user?.id });
    
    const supabase = await createClient();
    const { user } = authContext;

    // Validate sync access
    if (!authContext.features.canSyncConversations) {
      throw new ApiErrorResponse(
        'Conversation sync not available for your subscription tier',
        ErrorCode.FEATURE_NOT_AVAILABLE
      );
    }

    // Get user's chat sessions with messages
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        chat_messages (*)
      `)
      .eq('user_id', user!.id)
      .order('last_message_timestamp', { ascending: false })
      .limit(20); // Latest 20 conversations

    if (sessionsError) {
      throw sessionsError;
    }

    // Collect all message IDs across sessions to fetch their attachments and annotations in one query
    const allMessageIds: string[] = [];
    (sessions as DatabaseSession[]).forEach(session => {
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

      // Fetch URL citations for these messages
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

    // Transform to frontend format (including attachments)
    const conversations = (sessions as DatabaseSession[]).map(session => ({
      id: session.id,
      title: session.title,
      userId: session.user_id,
      messages: session.chat_messages
        .sort((a: DatabaseMessage, b: DatabaseMessage) =>
          new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
        )
        .map((message: DatabaseMessage) => ({
          id: message.id,
          role: message.role as 'user' | 'assistant' | 'system',
          content: message.content,
          model: message.model,
          total_tokens: message.total_tokens,
          input_tokens: message.input_tokens || 0, // NEW: input token tracking
          output_tokens: message.output_tokens || 0, // NEW: output token tracking
          user_message_id: message.user_message_id || undefined, // NEW: user message linking
          contentType: message.content_type || 'text', // New: content type
          elapsed_ms: message.elapsed_ms || 0, // New: elapsed time (ms)
          completion_id: message.completion_id || undefined, // New: completion ID
          has_websearch: !!message.has_websearch,
          websearch_result_count: typeof message.websearch_result_count === 'number' ? message.websearch_result_count : 0,
          // Reasoning fields
          reasoning: typeof message.reasoning === 'string' ? message.reasoning : undefined,
          reasoning_details: message.reasoning_details && typeof message.reasoning_details === 'object' ? message.reasoning_details : undefined,
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
      isActive: false
    }));

    logger.info('Get conversations completed', {
      conversationCount: conversations.length,
      userId: user?.id
    });

    // Return conversations directly (not wrapped in data object) to match frontend expectations
    return NextResponse.json({
      conversations,
      syncTime: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get conversations error:', error);
    return handleError(error);
  }
}

// Apply authentication middleware with conversation ownership validation and tiered rate limiting
export const POST = withConversationOwnership(
  withTieredRateLimit(syncHandler, { tier: 'tierC' })
);
export const GET = withConversationOwnership(
  withTieredRateLimit(getConversationsHandler, { tier: 'tierC' })
);
