-- Idempotent where practical

-- pgcrypto is managed in base schema; no extension changes here

-- Create chat_attachments table
CREATE TABLE IF NOT EXISTS public.chat_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id TEXT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    message_id TEXT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('image')),
    mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    storage_bucket TEXT NOT NULL DEFAULT 'attachments-images',
    storage_path TEXT NOT NULL,
    draft_id TEXT NULL,
    width INTEGER NULL,
    height INTEGER NULL,
    checksum TEXT NULL,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_attachments_message_id ON public.chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_session_id ON public.chat_attachments(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_user_time ON public.chat_attachments(user_id, created_at DESC);
-- Draft and status-aware indexes for common operations
CREATE INDEX IF NOT EXISTS idx_chat_attachments_user_session_draft_status
    ON public.chat_attachments(user_id, session_id, draft_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_message_ready
    ON public.chat_attachments(message_id)
    WHERE status = 'ready' AND message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_attachments_status_deleted
    ON public.chat_attachments(status, deleted_at);

-- Enforce uniqueness of storage path within bucket
DO $$
BEGIN
        IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_chat_attachments_bucket_path'
        ) THEN
                ALTER TABLE public.chat_attachments
                ADD CONSTRAINT uq_chat_attachments_bucket_path UNIQUE (storage_bucket, storage_path);
        END IF;
END$$;

-- Enable RLS
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

-- Policies (create if missing)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_attachments' AND policyname = 'Users can view their own attachments'
    ) THEN
        CREATE POLICY "Users can view their own attachments" ON public.chat_attachments
            FOR SELECT USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_attachments' AND policyname = 'Users can insert their own attachments'
    ) THEN
        CREATE POLICY "Users can insert their own attachments" ON public.chat_attachments
            FOR INSERT WITH CHECK (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_attachments' AND policyname = 'Users can update their own attachments'
    ) THEN
        CREATE POLICY "Users can update their own attachments" ON public.chat_attachments
            FOR UPDATE USING (user_id = auth.uid())
            WITH CHECK (
                user_id = auth.uid()
                AND (
                    session_id IS NULL OR session_id IN (
                        SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()
                    )
                )
                AND (
                    message_id IS NULL OR EXISTS (
                        SELECT 1
                        FROM public.chat_messages m
                        JOIN public.chat_sessions s ON s.id = m.session_id
                        WHERE m.id = message_id AND s.user_id = auth.uid()
                    )
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_attachments' AND policyname = 'Users can delete their own attachments'
    ) THEN
        CREATE POLICY "Users can delete their own attachments" ON public.chat_attachments
            FOR DELETE USING (user_id = auth.uid());
    END IF;
END$$;

-- Add columns to chat_messages
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS attachment_count INTEGER NOT NULL DEFAULT 0;

-- Add a check constraint for max 3 attachments per message (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chat_messages_attachment_count_max3'
    ) THEN
        ALTER TABLE public.chat_messages
        ADD CONSTRAINT chat_messages_attachment_count_max3
        CHECK (attachment_count >= 0 AND attachment_count <= 3);
    END IF;
END$$;

-- Note: Retention/orphan cleanup will be implemented as a scheduled job/script outside this patch.

-- Optional: index to accelerate queries filtering for messages with attachments
CREATE INDEX IF NOT EXISTS idx_chat_messages_has_attachments_true
    ON public.chat_messages(has_attachments)
    WHERE has_attachments = true;
