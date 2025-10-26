// src/app/api/chat/search/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { logger } from '../../../../../lib/utils/logger';
import { handleError } from '../../../../../lib/utils/errors';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

interface SearchResult {
  id: string;
  title: string;
  lastMessagePreview: string | null;
  messageCount: number;
  lastMessageTimestamp: string;
  matchType: 'title' | 'preview' | 'content';
}

interface SearchResponse {
  results: SearchResult[];
  totalMatches: number;
  executionTimeMs: number;
  query: string;
}

/**
 * GET /api/chat/search
 * 
 * Server-side conversation search endpoint (Phase 2)
 * Searches across conversation titles, previews, and full message content
 * Uses optimized indexes for ILIKE pattern matching
 * 
 * Query parameters:
 * - q: Search query string (required, min 2 chars)
 * - limit: Max results to return (optional, default 50, max 100)
 * 
 * Returns: SearchResponse with matching conversations
 */
async function searchHandler(
  request: NextRequest,
  authContext: AuthContext
): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders(
    (request as unknown as { headers?: unknown })?.headers
  );
  const t0 = Date.now();

  try {
    const { user } = authContext;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const limitParam = searchParams.get('limit');
    const limit = Math.min(
      parseInt(limitParam || '50', 10),
      100
    );

    // Validate query
    if (!query) {
      return NextResponse.json(
        {
          error: 'Search query is required',
          code: 'MISSING_QUERY',
        },
        { status: 400, headers: { 'x-request-id': requestId } }
      );
    }

    if (query.length < 2) {
      return NextResponse.json(
        {
          error: 'Search query must be at least 2 characters',
          code: 'QUERY_TOO_SHORT',
        },
        { status: 400, headers: { 'x-request-id': requestId } }
      );
    }

    logger.debug('chat.search.start', {
      requestId,
      ctx: { query, limit, userId: user!.id },
    });

    const supabase = await createClient();

    // Build ILIKE pattern for case-insensitive search
    const searchPattern = `%${query}%`;

    // Query: Search across title, preview, and message content
    // Uses the optimized indexes we created:
    // - idx_chat_sessions_user_title_pattern (title search)
    // - idx_chat_messages_content_pattern (message content search)
    // - idx_chat_sessions_user_search (composite for metadata)
    // - idx_chat_messages_session_content (join optimization)
    const { data: results, error: searchError } = await supabase
      .rpc('search_conversations', {
        p_user_id: user!.id,
        p_query: searchPattern,
        p_limit: limit,
      });

    if (searchError) {
      // If RPC function doesn't exist, fall back to direct SQL query
      // PGRST202 = PostgREST function not found
      // 42883 = PostgreSQL function not found
      if (searchError.code === 'PGRST202' || searchError.code === '42883') {
        logger.warn('chat.search.rpc_missing', {
          requestId,
          ctx: { message: 'search_conversations function not found, using fallback query' },
        });

        // Fallback query using direct SQL
        const { data: fallbackResults, error: fallbackError } = await supabase
          .from('chat_sessions')
          .select('id, title, last_message_preview, message_count, last_message_timestamp')
          .eq('user_id', user!.id)
          .or(
            `title.ilike.${searchPattern},last_message_preview.ilike.${searchPattern}`
          )
          .order('last_message_timestamp', { ascending: false })
          .limit(limit);

        if (fallbackError) {
          throw fallbackError;
        }

        // Search in message content using a simpler approach
        // Get distinct session IDs that have matching content
        const { data: contentMatches, error: contentError } = await supabase
          .from('chat_messages')
          .select('session_id')
          .ilike('content', searchPattern)
          .in('role', ['user', 'assistant'])
          .limit(limit);

        if (contentError) {
          throw contentError;
        }

        // Get unique session IDs from content matches
        const contentSessionIds = [
          ...new Set(contentMatches?.map((m) => m.session_id) || []),
        ];

        // Fetch full session details for content matches
        let contentSessions: typeof fallbackResults = [];
        if (contentSessionIds.length > 0) {
          const { data: sessions, error: sessionsError } = await supabase
            .from('chat_sessions')
            .select('id, title, last_message_preview, message_count, last_message_timestamp')
            .eq('user_id', user!.id)
            .in('id', contentSessionIds);

          if (sessionsError) {
            throw sessionsError;
          }
          contentSessions = sessions || [];
        }

        // Combine and deduplicate results
        const sessionMap = new Map<string, SearchResult>();

        // Add title/preview matches
        fallbackResults?.forEach((session) => {
          const matchType = session.title?.toLowerCase().includes(query.toLowerCase())
            ? 'title'
            : 'preview';
          sessionMap.set(session.id, {
            id: session.id,
            title: session.title,
            lastMessagePreview: session.last_message_preview,
            messageCount: session.message_count,
            lastMessageTimestamp: session.last_message_timestamp,
            matchType,
          });
        });

        // Add message content matches
        contentSessions.forEach((session) => {
          if (!sessionMap.has(session.id)) {
            sessionMap.set(session.id, {
              id: session.id,
              title: session.title,
              lastMessagePreview: session.last_message_preview,
              messageCount: session.message_count,
              lastMessageTimestamp: session.last_message_timestamp,
              matchType: 'content',
            });
          }
        });

        const combinedResults = Array.from(sessionMap.values())
          .sort(
            (a, b) =>
              new Date(b.lastMessageTimestamp).getTime() -
              new Date(a.lastMessageTimestamp).getTime()
          )
          .slice(0, limit);

        const durationMs = Date.now() - t0;
        logger.info('chat.search.complete', {
          requestId,
          route: '/api/chat/search',
          ctx: {
            query,
            totalMatches: combinedResults.length,
            executionTimeMs: durationMs,
            fallback: true,
          },
        });

        const response: SearchResponse = {
          results: combinedResults,
          totalMatches: combinedResults.length,
          executionTimeMs: durationMs,
          query,
        };

        return NextResponse.json(response, {
          headers: { 'x-request-id': requestId },
        });
      }

      throw searchError;
    }

    const durationMs = Date.now() - t0;
    logger.info('chat.search.complete', {
      requestId,
      route: '/api/chat/search',
      ctx: {
        query,
        totalMatches: results?.length || 0,
        executionTimeMs: durationMs,
      },
    });

    const response: SearchResponse = {
      results: results || [],
      totalMatches: results?.length || 0,
      executionTimeMs: durationMs,
      query,
    };

    return NextResponse.json(response, {
      headers: { 'x-request-id': requestId },
    });
  } catch (error) {
    const durationMs = Date.now() - t0;
    logger.error('chat.search.error', error, {
      requestId,
      route: '/api/chat/search',
      ctx: { durationMs },
    });
    return handleError(error, requestId, '/api/chat/search');
  }
}

// Apply authentication and rate limiting middleware
// Use TierB (storage/DB operations) rate limiting: 20/50/500/1000 requests/hour
export const GET = withProtectedAuth(
  withTieredRateLimit(searchHandler, { tier: 'tierB' }),
  { enforceBan: false }
);
