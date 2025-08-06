// src/app/api/chat/session/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

import { logger } from '../../../../../lib/utils/logger';

interface SessionUpdateData {
  title?: string;
  message_count?: number;
  total_tokens?: number;
  last_model?: string;
  last_message_preview?: string;
  last_message_timestamp?: string;
  is_active?: boolean;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    logger.info('[GET] /api/chat/session - Request received', { url: request.url });

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      logger.warn('[GET] Auth error', { error: authError });
    }
    if (!user) {
      logger.warn('[GET] No authenticated user found');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('id');
    logger.info('[GET] Session ID param', { sessionId });

    if (!sessionId) {
      logger.warn('[GET] Missing session ID');
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Get the specific chat session for the authenticated user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError) {
      logger.error('[GET] Session lookup error', { error: sessionError });
    }
    if (!session) {
      logger.warn('[GET] Session not found or access denied', { userId: user.id, sessionId });
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    logger.info('[GET] Session found', { sessionId: session.id });
    return NextResponse.json({
      session: session
    });

  } catch (error) {
    logger.error('[GET] Get session error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    logger.info('[POST] /api/chat/session - Request received');

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      logger.warn('[POST] Auth error', { error: authError });
    }
    if (!user) {
      logger.warn('[POST] No authenticated user found');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const sessionData = await request.json();
    const { id: sessionId, title, is_active, ...otherFields } = sessionData;
    logger.info('[POST] Session update payload', { sessionData });

    if (!sessionId) {
      logger.warn('[POST] Missing session ID');
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Verify session exists and belongs to authenticated user
    const { data: existingSession, error: checkError } = await supabase
      .from('chat_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (checkError) {
      logger.error('[POST] Session lookup error', { error: checkError });
    }
    if (!existingSession) {
      logger.warn('[POST] Session not found or access denied', { userId: user.id, sessionId });
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Check for special active session update (requires atomic operation)
    if (is_active === true) {
      logger.info('[POST] Processing active session update', { sessionId, userId: user.id });
      
      // Use the database function for atomic active session management
      const { error: setActiveError } = await supabase.rpc('set_active_session', {
        target_user_id: user.id,
        target_session_id: sessionId
      });

      if (setActiveError) {
        logger.error('[POST] Set active session error', { error: setActiveError });
        return NextResponse.json(
          { error: 'Failed to set active session' },
          { status: 500 }
        );
      }

      // Get the updated session data
      const { data: updatedSession, error: fetchError } = await supabase
        .from('chat_sessions')
        .select()
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        logger.error('[POST] Failed to fetch updated session', { error: fetchError });
        return NextResponse.json(
          { error: 'Failed to retrieve updated session' },
          { status: 500 }
        );
      }

      logger.info('[POST] Active session updated successfully', { sessionId: updatedSession?.id });
      return NextResponse.json({
        session: updatedSession,
        success: true
      });
    }

    // Regular session update (non-active status changes)
    const updateData: SessionUpdateData = {
      updated_at: new Date().toISOString()
    };

    // Only update title if provided
    if (title !== undefined) {
      updateData.title = title;
    }

    // Handle non-active is_active updates (setting to false)
    if (is_active !== undefined && is_active === false) {
      updateData.is_active = false;
    }

    // Add any other allowed fields for session updates
    // Note: user_id cannot be changed, and id cannot be changed
    if (otherFields.message_count !== undefined) {
      updateData.message_count = otherFields.message_count;
    }
    if (otherFields.total_tokens !== undefined) {
      updateData.total_tokens = otherFields.total_tokens;
    }
    if (otherFields.last_model !== undefined) {
      updateData.last_model = otherFields.last_model;
    }
    if (otherFields.last_message_preview !== undefined) {
      updateData.last_message_preview = otherFields.last_message_preview;
    }
    if (otherFields.last_message_timestamp !== undefined) {
      updateData.last_message_timestamp = otherFields.last_message_timestamp;
    }

    logger.info('[POST] Updating session', { sessionId, updateData });
    const { data: updatedSession, error: updateError } = await supabase
      .from('chat_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', user.id) // Double-check user ownership
      .select()
      .single();

    if (updateError) {
      logger.error('[POST] Session update error', { error: updateError });
      throw updateError;
    }

    logger.info('[POST] Session updated successfully', { sessionId: updatedSession?.id });
    return NextResponse.json({
      session: updatedSession,
      success: true
    });

  } catch (error) {
    logger.error('[POST] Update session error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
