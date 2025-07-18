// src/app/api/chat/clear-all/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE() {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // First, get all session IDs for the user
    const { data: userSessions, error: getSessionsError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', user.id);

    if (getSessionsError) {
      console.error('Error getting user sessions:', getSessionsError);
      throw getSessionsError;
    }

    const sessionIds = userSessions?.map(session => session.id) || [];

    if (sessionIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No conversations to clear',
        deletedCount: 0
      });
    }

    // Delete all messages for the user's sessions
    const { error: messagesError } = await supabase
      .from('chat_messages')
      .delete()
      .in('session_id', sessionIds);

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      throw messagesError;
    }

    // Delete all sessions for the user
    const { error: sessionsError } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('user_id', user.id);

    if (sessionsError) {
      console.error('Error deleting sessions:', sessionsError);
      throw sessionsError;
    }

    return NextResponse.json({
      success: true,
      message: 'All conversations cleared successfully',
      deletedCount: sessionIds.length
    });

  } catch (error) {
    console.error('Clear all conversations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
