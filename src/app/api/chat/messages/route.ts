// src/app/api/chat/messages/route.ts
import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { coerceReasoningDetailsToArray } from '../../../../../lib/utils/reasoning';
import { ChatMessage } from '../../../../../lib/types/chat';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';

// Shape of chat_messages rows we read from DB
interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string | null;
  total_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  user_message_id?: string | null;
  content_type?: string | null;
  elapsed_ms?: number | null;
  completion_id?: string | null;
  has_websearch?: boolean | null;
  websearch_result_count?: number | null;
  reasoning?: string | null;
  reasoning_details?: Record<string, unknown> | Record<string, unknown>[] | null;
  message_timestamp: string;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
  is_streaming?: boolean | null;
}

async function getMessagesHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { user } = authContext;

    logger.info('Get messages request', { userId: user!.id });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');
  const sinceTs = searchParams.get('since_ts');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user!.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Build base query for messages in this session
    let messages: DbMessage[] | null = null;
    let messagesError: unknown = null;

    if (sinceTs) {
      // Incremental fetch for messages strictly newer than since_ts
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .gt('message_timestamp', sinceTs)
        .order('message_timestamp', { ascending: true });
      messages = (data as unknown as DbMessage[]) || [];
      messagesError = error;
    } else {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('message_timestamp', { ascending: true });
      messages = (data as unknown as DbMessage[]) || [];
      messagesError = error;
    }

  if (messagesError) {
      throw messagesError;
    }

    // Preload attachments and annotations for all message IDs
    const allMessageIds: string[] = (messages || []).map((m: { id: string }) => m.id);
    const attachmentsByMessage: Record<string, string[]> = {};
    const annotationsByMessage: Record<string, Array<{ type: 'url_citation'; url: string; title?: string; content?: string; start_index?: number; end_index?: number }>> = {};

    if (allMessageIds.length > 0) {
      // Attachments (only ready ones)
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

      // Annotations (URL citations)
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

    // Transform to frontend format (filter out system messages)
  const formattedMessages = (messages || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((message: DbMessage) => {
        // Sanitize content type
        const contentType = message.content_type === 'markdown' ? 'markdown' : 'text';
        // Coerce reasoning_details into array when object
  const reasoningDetails = coerceReasoningDetailsToArray(message.reasoning_details);

        // Extract requested_* options from metadata JSONB (if present)
        const md = (message.metadata && typeof message.metadata === 'object') ? message.metadata as Record<string, unknown> : {};
        const requested_web_search = typeof md.requested_web_search === 'boolean' ? md.requested_web_search : undefined;
        const requested_web_max_results = typeof md.requested_web_max_results === 'number' ? md.requested_web_max_results : undefined;
        const requested_reasoning_effort = typeof md.requested_reasoning_effort === 'string' ? md.requested_reasoning_effort : undefined;

        // Attachments & annotations
        const attachment_ids = attachmentsByMessage[message.id] || [];
        const has_attachments = attachment_ids.length > 0;
        const annotations = annotationsByMessage[message.id] || [];

        // For user messages, prefer originalModel field to mirror samples
        const model = message.role === 'assistant' ? message.model : undefined;
        const originalModel = message.role === 'user' ? (message.model ?? undefined) : undefined;

        return {
          id: message.id,
          role: message.role as 'user' | 'assistant',
          content: message.content,
          // Model fields
          ...(model ? { model } : {}),
          ...(originalModel ? { originalModel } : {}),
          // Token usage
          total_tokens: message.total_tokens,
          input_tokens: message.input_tokens || 0,
          output_tokens: message.output_tokens || 0,
          user_message_id: message.user_message_id || undefined,
          // Rendering and tracing
          contentType,
          elapsed_ms: message.elapsed_ms || 0,
          completion_id: message.completion_id || undefined,
          // Web search
          has_websearch: !!message.has_websearch,
          websearch_result_count: typeof message.websearch_result_count === 'number' ? message.websearch_result_count : 0,
          // Reasoning
          reasoning: typeof message.reasoning === 'string' ? message.reasoning : undefined,
          reasoning_details: reasoningDetails,
          // Annotations & Attachments
          annotations,
          has_attachments,
          attachment_ids,
          // Timestamp & error
          timestamp: new Date(message.message_timestamp),
          error: !!message.error_message,
          // Streaming mode used
          was_streaming: message.is_streaming === true,
          // Request-side options
          ...(requested_web_search !== undefined ? { requested_web_search } : {}),
          ...(requested_web_max_results !== undefined ? { requested_web_max_results } : {}),
          ...(requested_reasoning_effort !== undefined ? { requested_reasoning_effort } : {}),
          // Old failures loaded from DB should not surface retry action
          ...(message.role === 'user' && message.error_message ? { retry_available: false } : {})
        };
      });

    // When since_ts is provided, return quick up_to_date signal when no new messages
    if (sinceTs) {
      return NextResponse.json({
        up_to_date: formattedMessages.length === 0,
        messages: formattedMessages,
        count: formattedMessages.length,
      });
    }

    return NextResponse.json({
      messages: formattedMessages,
      count: formattedMessages.length,
    });

  } catch (error) {
    logger.error('Get messages error:', error);
    return handleError(error);
  }
}

async function postMessagesHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { user } = authContext;

    logger.info('Create messages request', { userId: user!.id });

    const requestData = await request.json() as {
      message?: ChatMessage; // Single message (backward compatibility)
      messages?: ChatMessage[]; // Array of messages (new functionality)
      sessionId: string;
      sessionTitle?: string; // NEW: Optional title update for session
      attachmentIds?: string[]; // NEW: image attachments to link to the triggering user message
    };

    // Check if session already exists first
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('id, title, message_count')
      .eq('id', requestData.sessionId)
      .eq('user_id', user!.id)
      .single();

    if (!existingSession) {
      // Session doesn't exist, create new one with title based on first message
      let newTitle = 'New Chat'; // Default fallback
      
      // Prioritize explicit sessionTitle from request
      if (requestData.sessionTitle) {
        newTitle = requestData.sessionTitle;
      } else {
        // Generate title from first user message if available
        const firstUserMessage = (requestData.messages || [requestData.message])
          .find(m => m?.role === 'user');
        if (firstUserMessage && firstUserMessage.content) {
          newTitle = firstUserMessage.content.length > 50 
            ? firstUserMessage.content.substring(0, 50) + "..."
            : firstUserMessage.content;
        }
      }

      const { data: newSession, error: createError } = await supabase
        .from('chat_sessions')
        .insert({
          id: requestData.sessionId,
          user_id: user!.id,
          title: newTitle,
          updated_at: new Date().toISOString()
        })
        .select('id, title, message_count')
        .single();

      if (createError || !newSession) {
        return NextResponse.json(
          { error: 'Session creation failed' },
          { status: 500 }
        );
      }
    } else if (requestData.sessionTitle && existingSession.title !== requestData.sessionTitle) {
      // Session exists but title needs updating
      const { error: titleUpdateError } = await supabase
        .from('chat_sessions')
        .update({
          title: requestData.sessionTitle,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestData.sessionId)
        .eq('user_id', user!.id);

      if (titleUpdateError) {
        logger.error('Error updating session title:', titleUpdateError);
        // Don't fail the request for title update errors
      }
    }

    const insertedMessages = [];

    // Handle both single message and message arrays
  if (requestData.messages && Array.isArray(requestData.messages)) {
      // Process multiple messages atomically
      for (const message of requestData.messages) {
  type MessageWithReasoning = ChatMessage & { reasoning?: string; reasoning_details?: Record<string, unknown>[] };
    const mwr = message as MessageWithReasoning;
    const { data: newMessage, error: messageError } = await supabase
          .from('chat_messages')
          .upsert({
            id: message.id,
            session_id: requestData.sessionId,
            role: message.role,
            content: message.content,
            model: message.model,
            input_tokens: message.input_tokens || 0,
            output_tokens: message.output_tokens || 0,
            total_tokens: message.total_tokens || 0,
            content_type: message.contentType || 'text',
            elapsed_ms: message.elapsed_ms || 0,
            completion_id: message.completion_id || null,
            user_message_id: message.user_message_id || null,
      reasoning: mwr.reasoning || null,
  reasoning_details: mwr.reasoning_details || null,
      has_websearch: message.has_websearch ?? false,
      websearch_result_count: message.websearch_result_count ?? 0,
            metadata: {
              // Prefer upstream-specific fields if provided by client
              ...(message.upstream_error_code !== undefined && message.upstream_error_code !== null
                ? { upstream_error_code: message.upstream_error_code }
                : (message.error_code ? { upstream_error_code: message.error_code } : {})),
              ...(message.upstream_error_message
                ? { upstream_error_message: message.upstream_error_message }
                : (message.error_message ? { upstream_error_message: message.error_message } : {})),
              ...(message.retry_after ? { upstream_retry_after: message.retry_after } : {}),
              ...(Array.isArray(message.suggestions) ? { upstream_suggestions: message.suggestions } : {}),
            },
            message_timestamp: typeof message.timestamp === 'string' 
              ? message.timestamp 
              : message.timestamp.toISOString(),
            error_message: message.error_message || (message.error ? 'Message failed' : null),
            // Persist original streaming mode used when this message was sent
            is_streaming: message.was_streaming === true
          }, { onConflict: 'id' })
          .select()
          .single();

        if (messageError) {
          throw messageError;
        }
        
        insertedMessages.push(newMessage);
      }
  } else if (requestData.message) {
      // Process single message (existing logic)
      const message = requestData.message;
  type MessageWithReasoning = ChatMessage & { reasoning?: string; reasoning_details?: Record<string, unknown>[] };
    const mwr = message as MessageWithReasoning;
    const { data: newMessage, error: messageError } = await supabase
        .from('chat_messages')
        .upsert({
          id: message.id,
          session_id: requestData.sessionId,
          role: message.role,
          content: message.content,
          model: message.model,
          input_tokens: message.input_tokens || 0,
          output_tokens: message.output_tokens || 0,
          total_tokens: message.total_tokens || 0,
          content_type: message.contentType || 'text',
          elapsed_ms: message.elapsed_ms || 0,
          completion_id: message.completion_id || null,
          user_message_id: message.user_message_id || null,
      reasoning: mwr.reasoning || null,
      reasoning_details: mwr.reasoning_details || null,
      has_websearch: message.has_websearch ?? false,
      websearch_result_count: message.websearch_result_count ?? 0,
          metadata: {
            ...(message.upstream_error_code !== undefined && message.upstream_error_code !== null
              ? { upstream_error_code: message.upstream_error_code }
              : (message.error_code ? { upstream_error_code: message.error_code } : {})),
            ...(message.upstream_error_message
              ? { upstream_error_message: message.upstream_error_message }
              : (message.error_message ? { upstream_error_message: message.error_message } : {})),
            ...(message.retry_after ? { upstream_retry_after: message.retry_after } : {}),
            ...(Array.isArray(message.suggestions) ? { upstream_suggestions: message.suggestions } : {}),
          },
          message_timestamp: typeof message.timestamp === 'string' 
            ? message.timestamp 
            : message.timestamp.toISOString(),
          error_message: message.error_message || (message.error ? 'Message failed' : null),
          // Persist original streaming mode used when this message was sent
          is_streaming: message.was_streaming === true
        }, { onConflict: 'id' })
        .select()
        .single();

      if (messageError) {
        throw messageError;
      }
      
      insertedMessages.push(newMessage);
    } else {
      return NextResponse.json(
        { error: 'Either message or messages array is required' },
        { status: 400 }
      );
    }

    // If attachmentIds provided and a user message exists among inserted, link them to that user message
    if (Array.isArray(requestData.attachmentIds) && requestData.attachmentIds.length > 0) {
      // Find the triggering user message ID (prefer explicit in requestData.message/messages)
      const userMsg = (insertedMessages as Array<{ id: string; role: string }>).find((m) => m.role === 'user');
      const userMsgId = userMsg?.id || requestData.messages?.find(m => m?.role === 'user')?.id || requestData.message?.id;

      if (userMsgId) {
        // First, verify which attachments are eligible (owned by user, ready, and not already linked)
        const { data: eligible, error: eligibleErr } = await supabase
          .from('chat_attachments')
          .select('id')
          .in('id', requestData.attachmentIds)
          .eq('user_id', user!.id)
          .eq('status', 'ready')
          .is('message_id', null);

        if (eligibleErr) {
          logger.error('Error fetching eligible attachments for linking', eligibleErr);
        } else if ((eligible?.length || 0) > 0) {
          const eligibleIds = eligible!.map((a: { id: string }) => a.id);
          // Link attachments: set message_id and session_id where owned by user and not already linked
          const { data: linkedRows, error: linkErr } = await supabase
            .from('chat_attachments')
            .update({ message_id: userMsgId, session_id: requestData.sessionId })
            .in('id', eligibleIds)
            .eq('user_id', user!.id)
            .is('message_id', null)
            .eq('status', 'ready')
            .select('id');

          if (linkErr) {
            logger.error('Failed to link attachments', linkErr);
            // Do not fail entire request; continue
          }

          const linkedCount = Math.min(linkedRows?.length || 0, 3);

          // Update user message flags based on actually linked attachments
          if (linkedCount >= 0) {
            const { error: msgUpdateErr } = await supabase
              .from('chat_messages')
              .update({ has_attachments: linkedCount > 0, attachment_count: linkedCount })
              .eq('id', userMsgId)
              .eq('session_id', requestData.sessionId);
            if (msgUpdateErr) {
              logger.error('Failed to update message attachment flags', msgUpdateErr);
            }

            logger.info('Attachment linkage result', {
              userId: user!.id,
              sessionId: requestData.sessionId,
              userMessageId: userMsgId,
              requestedCount: requestData.attachmentIds.length,
              eligibleCount: eligible?.length || 0,
              linkedCount,
            });
          }
        } else {
          logger.warn('No eligible attachments to link', {
            userId: user!.id,
            sessionId: requestData.sessionId,
            userMessageId: userMsgId,
            requestedIds: requestData.attachmentIds,
          });
        }
      }
    }

    // Get current message count for session stats update  
    const messageCount = await getMessageCount(supabase, requestData.sessionId);

    // Update session stats (excluding title - title set during session creation)
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        message_count: messageCount,
        total_tokens: await getTotalTokens(supabase, requestData.sessionId),
        last_model: insertedMessages[insertedMessages.length - 1]?.model,
        last_message_preview: insertedMessages[insertedMessages.length - 1]?.content?.length > 100 
          ? insertedMessages[insertedMessages.length - 1].content.substring(0, 100) + "..."
          : insertedMessages[insertedMessages.length - 1]?.content,
        last_message_timestamp: insertedMessages[insertedMessages.length - 1]?.message_timestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', requestData.sessionId);

    if (updateError) {
      console.error('Error updating session stats:', updateError);
      // Don't fail the request for stats update errors
    }

    // Persist URL citations for assistant messages if provided
    try {
      const assistantMessages = (requestData.messages || (requestData.message ? [requestData.message] : []))
        .filter((m) => m && m.role === 'assistant' && Array.isArray(m.annotations) && m.annotations.length > 0);
      if (assistantMessages.length > 0) {
        // Fetch user_id once
        const { data: sessionRow, error: sessionErr } = await supabase
          .from('chat_sessions')
          .select('user_id')
          .eq('id', requestData.sessionId)
          .single();
        if (!sessionErr && sessionRow?.user_id) {
          const rows = assistantMessages.flatMap((m) =>
            (m.annotations || []).map((a) => ({
              user_id: sessionRow.user_id,
              session_id: requestData.sessionId,
              message_id: m.id,
              annotation_type: 'url_citation',
              url: a.url,
              title: a.title || null,
              content: a.content || null,
              start_index: a.start_index ?? null,
              end_index: a.end_index ?? null,
            }))
          );
          if (rows.length > 0) {
            const { error: annErr } = await supabase
              .from('chat_message_annotations')
              .insert(rows);
            if (annErr) {
              logger.warn('Failed to persist chat_message_annotations', annErr);
            }
          }
        }
      }
    } catch (annEx) {
      logger.warn('Annotations insert skipped due to error', annEx);
    }

    return NextResponse.json({
      messages: insertedMessages,
      count: insertedMessages.length,
      success: true
    }, { status: 201 });

  } catch (error) {
    logger.error('Create message error:', error);
    return handleError(error);
  }
}

// Apply middleware to handlers with TierC rate limiting
export const GET = withProtectedAuth(
  withTieredRateLimit(getMessagesHandler, { tier: 'tierC' })
);
export const POST = withProtectedAuth(
  withTieredRateLimit(postMessagesHandler, { tier: 'tierC' })
);

// Helper functions
async function getMessageCount(supabase: Awaited<ReturnType<typeof createClient>>, sessionId: string): Promise<number> {
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact' })
    .eq('session_id', sessionId);
  return count || 0;
}

async function getTotalTokens(supabase: Awaited<ReturnType<typeof createClient>>, sessionId: string): Promise<number> {
  const { data } = await supabase
    .from('chat_messages')
    .select('total_tokens')
    .eq('session_id', sessionId);
  
  return (data || []).reduce((sum: number, msg: { total_tokens?: number }) => sum + (msg.total_tokens || 0), 0);
}
