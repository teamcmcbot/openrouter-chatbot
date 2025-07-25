// src/app/api/chat/sync/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage } from '../../../../../lib/types/chat';

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
  elapsed_time?: number; // New: elapsed time field
  completion_id?: string; // New: completion ID field
  message_timestamp: string;
  error_message?: string;
  is_streaming: boolean;
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

    const { conversations }: { conversations: ConversationSync[] } = await request.json();

    if (!Array.isArray(conversations)) {
      return NextResponse.json(
        { error: 'Invalid conversations data' },
        { status: 400 }
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
        // Validate conversation belongs to user
        if (conversation.userId !== user.id) {
          syncResults.errors++;
          syncResults.details.push({
            conversationId: conversation.id,
            error: 'Conversation does not belong to user'
          });
          continue;
        }

        // Use original conversation ID directly (database should accept TEXT)
        const databaseId = conversation.id;

        // Upsert chat session with original client ID
        const { error: sessionError } = await supabase
          .from('chat_sessions')
          .upsert({
            id: databaseId,
            user_id: user.id,
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
            elapsed_time: message.elapsed_time || 0, // New: elapsed time
            completion_id: message.completion_id || null, // New: completion ID
            message_timestamp: typeof message.timestamp === 'string'
              ? message.timestamp
              : message.timestamp?.toISOString() || new Date().toISOString(),
            error_message: message.error ? 'Message failed' : undefined,
            is_streaming: false // Default to false since streaming is complete when syncing
          }));

          const { error: messagesError } = await supabase
            .from('chat_messages')
            .upsert(messagesData);

          if (messagesError) {
            throw messagesError;
          }
        }

        syncResults.synced++;
        syncResults.details.push({
          conversationId: conversation.id,
          status: 'synced',
          messageCount: conversation.messages?.length || 0
        });

      } catch (error) {
        console.error('Error syncing conversation:', conversation.id, error);
        syncResults.errors++;
        syncResults.details.push({
          conversationId: conversation.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      results: syncResults,
      syncTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sync endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
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

    // Get user's chat sessions with messages
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        chat_messages (*)
      `)
      .eq('user_id', user.id)
      .order('last_message_timestamp', { ascending: false })
      .limit(10); // Latest 10 conversations

    if (sessionsError) {
      throw sessionsError;
    }

    // Transform to frontend format
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
          elapsed_time: message.elapsed_time || 0, // New: elapsed time
          completion_id: message.completion_id || undefined, // New: completion ID
          timestamp: new Date(message.message_timestamp),
          error: !!message.error_message
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

    return NextResponse.json({
      conversations,
      syncTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
