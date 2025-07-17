-- Phase 5: Fix ID Schema for Client Compatibility
-- Execute this to change UUID to TEXT for chat table IDs

-- Step 1: Drop all RLS policies that reference the id columns
DROP POLICY IF EXISTS "Users can view their own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create their own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update their own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete their own chat sessions" ON public.chat_sessions;

DROP POLICY IF EXISTS "Users can view messages from their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can create messages in their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update messages in their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete messages in their sessions" ON public.chat_messages;

-- Step 2: Drop existing foreign key constraints temporarily
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_session_id_fkey;

-- Step 3: Change column types from UUID to TEXT
ALTER TABLE public.chat_sessions ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.chat_messages ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.chat_messages ALTER COLUMN session_id TYPE TEXT;

-- Step 4: Re-add the foreign key constraint
ALTER TABLE public.chat_messages 
ADD CONSTRAINT chat_messages_session_id_fkey 
FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

-- Step 5: Recreate all RLS policies with TEXT column types

-- Chat Sessions Policies
CREATE POLICY "Users can view their own chat sessions" ON public.chat_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own chat sessions" ON public.chat_sessions
    FOR DELETE USING (user_id = auth.uid());

-- Chat Messages Policies (using session ownership)
CREATE POLICY "Users can view messages from their sessions" ON public.chat_messages
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in their sessions" ON public.chat_messages
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update messages in their sessions" ON public.chat_messages
    FOR UPDATE USING (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages in their sessions" ON public.chat_messages
    FOR DELETE USING (
        session_id IN (
            SELECT id FROM public.chat_sessions 
            WHERE user_id = auth.uid()
        )
    );

-- Note: This allows client-generated IDs like "conv_1752734987703_j9spjufk8"
-- to be stored directly without UUID conversion
