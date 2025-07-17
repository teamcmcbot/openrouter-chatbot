// src/app/api/chat/messages/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage } from '../../../../../lib/types/chat';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

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
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Get messages for the session
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('message_timestamp', { ascending: true });

    if (messagesError) {
      throw messagesError;
    }

    // Transform to frontend format
    const formattedMessages = (messages || []).map(message => ({
      id: message.id,
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      model: message.model,
      total_tokens: message.total_tokens,
      timestamp: new Date(message.message_timestamp),
      error: !!message.error_message
    }));

    return NextResponse.json({
      messages: formattedMessages,
      count: formattedMessages.length
    });

  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const messageData = await request.json() as {
      message: ChatMessage;
      sessionId: string;
    };

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', messageData.sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Insert the new message
    const { data: newMessage, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        id: messageData.message.id,
        session_id: messageData.sessionId,
        role: messageData.message.role,
        content: messageData.message.content,
        model: messageData.message.model,
        total_tokens: messageData.message.total_tokens || 0,
        message_timestamp: typeof messageData.message.timestamp === 'string' 
          ? messageData.message.timestamp 
          : messageData.message.timestamp.toISOString(),
        error_message: messageData.message.error ? 'Message failed' : undefined,
        is_streaming: false
      })
      .select()
      .single();

    if (messageError) {
      throw messageError;
    }

    // Update session stats
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        message_count: await getMessageCount(supabase, messageData.sessionId),
        total_tokens: await getTotalTokens(supabase, messageData.sessionId),
        last_model: messageData.message.model,
        last_message_preview: messageData.message.content.length > 100 
          ? messageData.message.content.substring(0, 100) + "..."
          : messageData.message.content,
        last_message_timestamp: typeof messageData.message.timestamp === 'string' 
          ? messageData.message.timestamp 
          : messageData.message.timestamp.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', messageData.sessionId);

    if (updateError) {
      console.error('Error updating session stats:', updateError);
      // Don't fail the request for stats update errors
    }

    return NextResponse.json({
      message: newMessage,
      success: true
    }, { status: 201 });

  } catch (error) {
    console.error('Create message error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
