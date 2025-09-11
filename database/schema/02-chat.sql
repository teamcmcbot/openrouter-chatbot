-- =============================================================================
-- FINAL CHAT SCHEMA
-- =============================================================================
-- This file contains the final structure for chat-related tables,
-- functions, triggers, and RLS policies.

-- =============================================================================
-- CHAT TABLES WITH TEXT IDS (CLIENT COMPATIBLE)
-- =============================================================================

-- Chat sessions table (represents conversations)
CREATE TABLE public.chat_sessions (
    -- Primary key and identification (TEXT to support client-generated IDs)
    id TEXT PRIMARY KEY, -- Supports IDs like "conv_1752734987703_j9spjufk8"

    -- User ownership (foreign key to profiles)
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,

    -- Session metadata
    title VARCHAR(255) NOT NULL DEFAULT 'New Chat',

    -- Activity tracking
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Usage statistics
    message_count INTEGER DEFAULT 0 NOT NULL,
    total_tokens INTEGER DEFAULT 0 NOT NULL,
    last_model VARCHAR(100),

    -- Status flags (is_active removed; active selection is client-side only)

    -- Preview information (for sidebar display)
    last_message_preview TEXT,
    last_message_timestamp TIMESTAMPTZ
);

-- Chat messages table (individual messages within conversations)
CREATE TABLE public.chat_messages (
    -- Primary key and identification (TEXT to support client-generated IDs)
    id TEXT PRIMARY KEY, -- Supports IDs like "msg_1752735003369_o159ep4bq"

    -- Session relationship
    session_id TEXT REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,

    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- Model and performance metadata
    model VARCHAR(100),
    total_tokens INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    user_message_id TEXT,

    -- Response metadata (for assistant messages)
    content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'markdown')),
    elapsed_ms INTEGER DEFAULT 0, -- assistant latency ms
    completion_id VARCHAR(255),

    -- Timing information
    message_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Error handling
    error_message TEXT,
    is_streaming BOOLEAN DEFAULT false,

    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Reasoning mode fields (assistant-only write; nullable)
    reasoning TEXT NULL,
    reasoning_details JSONB NULL,

    -- Attachments metadata
    has_attachments BOOLEAN DEFAULT false NOT NULL,
    attachment_count INTEGER DEFAULT 0 NOT NULL CHECK (attachment_count >= 0 AND attachment_count <= 3),

    -- Web search metadata (assistant-only)
    has_websearch BOOLEAN DEFAULT false NOT NULL,
    websearch_result_count INTEGER DEFAULT 0 NOT NULL CHECK (websearch_result_count >= 0 AND websearch_result_count <= 50),

    -- Image generation metadata (assistant-only)
    output_image_tokens INTEGER DEFAULT 0 NOT NULL
);

-- Attachments table (images only for now)
CREATE TABLE public.chat_attachments (
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
    deleted_at TIMESTAMPTZ NULL,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Enforce uniqueness of storage path within a bucket
    UNIQUE (storage_bucket, storage_path)
);

-- =============================================================================
-- CHAT MESSAGE ANNOTATIONS (URL citations)
-- =============================================================================
CREATE TABLE public.chat_message_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    annotation_type TEXT NOT NULL CHECK (annotation_type IN ('url_citation')),
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    start_index INTEGER,
    end_index INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK ((start_index IS NULL AND end_index IS NULL) OR (start_index >= 0 AND end_index >= start_index))
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Chat sessions indexes
CREATE INDEX idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated_at ON public.chat_sessions(updated_at DESC);
CREATE INDEX idx_chat_sessions_user_updated ON public.chat_sessions(user_id, updated_at DESC);

-- Chat messages indexes
CREATE INDEX idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX idx_chat_messages_timestamp ON public.chat_messages(message_timestamp);
CREATE INDEX idx_chat_messages_session_timestamp ON public.chat_messages(session_id, message_timestamp);
CREATE INDEX idx_chat_messages_completion_id ON public.chat_messages(completion_id);
CREATE INDEX idx_chat_messages_user_message_id
    ON public.chat_messages(user_message_id)
    WHERE user_message_id IS NOT NULL;
CREATE INDEX idx_chat_messages_tokens_role
    ON public.chat_messages(role, input_tokens, output_tokens)
    WHERE input_tokens > 0 OR output_tokens > 0;
-- Messages with attachments (optional index)
CREATE INDEX idx_chat_messages_has_attachments_true
    ON public.chat_messages(has_attachments)
    WHERE has_attachments = true;
-- Messages with web search (optional indexes)
CREATE INDEX idx_chat_messages_has_websearch_true
    ON public.chat_messages(has_websearch)
    WHERE has_websearch = true;
CREATE INDEX idx_chat_messages_websearch_count
    ON public.chat_messages(websearch_result_count);

-- Chat attachments indexes
CREATE INDEX idx_chat_attachments_message_id ON public.chat_attachments(message_id);
CREATE INDEX idx_chat_attachments_session_id ON public.chat_attachments(session_id);
CREATE INDEX idx_chat_attachments_user_time ON public.chat_attachments(user_id, created_at DESC);
CREATE INDEX idx_chat_attachments_user_session_draft_status
    ON public.chat_attachments(user_id, session_id, draft_id, status);
CREATE INDEX idx_chat_attachments_message_ready
    ON public.chat_attachments(message_id)
    WHERE status = 'ready' AND message_id IS NOT NULL;
CREATE INDEX idx_chat_attachments_status_deleted
    ON public.chat_attachments(status, deleted_at);

-- Chat message annotations indexes
CREATE INDEX idx_msg_annotations_message ON public.chat_message_annotations(message_id);
CREATE INDEX idx_msg_annotations_user_time ON public.chat_message_annotations(user_id, created_at DESC);
CREATE INDEX idx_msg_annotations_session ON public.chat_message_annotations(session_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_annotations ENABLE ROW LEVEL SECURITY;

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

-- Chat Attachments Policies
CREATE POLICY "Users can view their own attachments" ON public.chat_attachments
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own attachments" ON public.chat_attachments
    FOR INSERT WITH CHECK (user_id = auth.uid());

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

CREATE POLICY "Users can delete their own attachments" ON public.chat_attachments
    FOR DELETE USING (user_id = auth.uid());

-- Chat Message Annotations Policies
CREATE POLICY "Users can view their own message annotations" ON public.chat_message_annotations
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own message annotations" ON public.chat_message_annotations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own message annotations" ON public.chat_message_annotations
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to update session statistics when messages change
CREATE OR REPLACE FUNCTION public.update_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_stats RECORD;
    total_input_tokens INTEGER := 0;
    total_output_tokens INTEGER := 0;
BEGIN
    -- Determine which session to update
    IF TG_OP = 'DELETE' THEN
        -- Use OLD record for DELETE operations
        -- ENHANCEMENT: Exclude error messages from statistics
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = OLD.session_id
        AND (error_message IS NULL OR error_message = ''); -- EXCLUDE ERROR MESSAGES

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = OLD.session_id;
    ELSE
        -- Use NEW record for INSERT/UPDATE operations
        -- ENHANCEMENT: Exclude error messages from statistics
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '') -- Exclude error messages
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = NEW.session_id
        AND (error_message IS NULL OR error_message = ''); -- EXCLUDE ERROR MESSAGES

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = NEW.session_id;

    -- ENHANCEMENT: Only track usage for successful messages on INSERT (avoid UPDATE double-counting)
    IF TG_OP = 'INSERT'
       AND NEW.role IN ('user', 'assistant')
       AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
            PERFORM public.track_user_usage(
                (SELECT user_id FROM public.chat_sessions WHERE id = NEW.session_id),
                CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END, -- messages_sent
                CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END, -- messages_received
                CASE WHEN NEW.role = 'user' THEN COALESCE(NEW.input_tokens, 0) ELSE 0 END, -- input_tokens
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.output_tokens, 0) ELSE 0 END, -- output_tokens
                NEW.model, -- model_used
                false, -- session_created
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_ms, 0) ELSE 0 END -- generation_ms (ms)
            );
        END IF;
    END IF;

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update session timestamp on updates
CREATE OR REPLACE FUNCTION public.update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's recent chat sessions (for API)
CREATE OR REPLACE FUNCTION public.get_user_recent_sessions(
    user_uuid UUID,
    session_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id TEXT,
    title VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ,
    message_count INTEGER,
    total_tokens INTEGER,
    last_model VARCHAR(100),
    last_message_preview TEXT,
    last_message_timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.title,
        s.created_at,
        s.updated_at,
        s.last_activity,
        s.message_count,
        s.total_tokens,
        s.last_model,
        s.last_message_preview,
        s.last_message_timestamp
    FROM public.chat_sessions s
    WHERE s.user_id = user_uuid
    ORDER BY s.updated_at DESC
    LIMIT session_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_session_with_messages and sync_user_conversations removed: not used by code or triggers.

-- Function to track session creation
CREATE OR REPLACE FUNCTION public.track_session_creation()
RETURNS TRIGGER AS $$
BEGIN
    -- Call track_user_usage with session_created = true
    -- All other parameters are set to 0/default since this is just session creation
    PERFORM public.track_user_usage(
        NEW.user_id,           -- p_user_id
        0,                     -- p_messages_sent (0 for new session)
        0,                     -- p_messages_received (0 for new session)
        0,                     -- p_input_tokens (0 for new session)
    0,                     -- p_output_tokens (0 for new session)
    NULL,                  -- p_model_used (NULL for new session)
    true,                  -- p_session_created (TRUE - this is the key parameter)
    0                      -- p_generation_ms (0 for new session)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger to update session stats when messages change
CREATE TRIGGER on_message_change
    AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_session_stats();

-- Trigger to update session timestamp on updates
CREATE TRIGGER on_session_updated
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_session_timestamp();

-- Trigger to track session creation for usage analytics
CREATE TRIGGER on_session_created
    AFTER INSERT ON public.chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.track_session_creation();

-- =============================================================================
-- TOKEN COST TRACKING (Per-token pricing basis)
-- =============================================================================

-- Table storing per-assistant-message cost snapshot
CREATE TABLE public.message_token_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id), -- no cascade: preserve costs if user content deleted
    session_id TEXT NOT NULL, -- denormalized reference (FK dropped intentionally to preserve costs)
    assistant_message_id TEXT NOT NULL UNIQUE, -- denormalized reference (FK dropped)
    user_message_id TEXT NULL,
    completion_id VARCHAR(255),
    model_id VARCHAR(100),
    message_timestamp TIMESTAMPTZ NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    output_image_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens + COALESCE(output_image_tokens, 0)) STORED,
    elapsed_ms INTEGER DEFAULT 0, -- assistant generation latency (ms) copied from chat_messages
    prompt_unit_price DECIMAL(12,8), -- per token
    completion_unit_price DECIMAL(12,8), -- per token
    image_units INTEGER NOT NULL DEFAULT 0,
    image_unit_price DECIMAL(12,8), -- per image unit (future)
    output_image_units_price DECIMAL(12,8) DEFAULT 0,
    prompt_cost DECIMAL(12,6),
    completion_cost DECIMAL(12,6),
    image_cost DECIMAL(12,6),
    output_image_cost DECIMAL(12,6),
    websearch_cost DECIMAL(12,6),
    total_cost DECIMAL(12,6),
    pricing_source JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for cost table
CREATE INDEX idx_message_token_costs_user_time ON public.message_token_costs(user_id, message_timestamp DESC);
CREATE INDEX idx_message_token_costs_session_time ON public.message_token_costs(session_id, message_timestamp);
CREATE INDEX idx_message_token_costs_model ON public.message_token_costs(model_id);
CREATE INDEX idx_message_token_costs_websearch_cost ON public.message_token_costs(websearch_cost);
-- Fallback join performance: lookup by user_message_id for enriched error analytics
CREATE INDEX idx_message_token_costs_user_message_id ON public.message_token_costs(user_message_id);

-- RLS for cost table
ALTER TABLE public.message_token_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own message costs" ON public.message_token_costs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all message costs" ON public.message_token_costs
    FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can insert their own message costs" ON public.message_token_costs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can insert any message costs" ON public.message_token_costs
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- Function to calculate and record message cost (per token pricing)
CREATE OR REPLACE FUNCTION public.calculate_and_record_message_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- Delegate cost handling to recompute path for successful assistant messages
    IF NEW.role = 'assistant' AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
        PERFORM public.recompute_image_cost_for_user_message(NEW.user_message_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for assistant message cost insertion
DROP TRIGGER IF EXISTS after_assistant_message_cost ON public.chat_messages;
CREATE TRIGGER after_assistant_message_cost
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.calculate_and_record_message_cost();

-- Recompute helper: when attachments link after assistant insert
CREATE OR REPLACE FUNCTION public.recompute_image_cost_for_user_message(
    p_user_message_id TEXT -- Can be a user_message_id (legacy path) OR an assistant message id
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_msg_id TEXT := NULL;          -- Actual user message id (if present)
    v_assistant_id TEXT := NULL;         -- Assistant message id
    v_session_id TEXT;
    v_user_id UUID;
    v_model VARCHAR(100);
    v_message_timestamp TIMESTAMPTZ;
    v_elapsed_ms INTEGER;
    v_prompt_tokens INTEGER := 0;
    v_completion_tokens INTEGER := 0;
    v_output_image_tokens INTEGER := 0;  -- From assistant row
    v_text_completion_tokens INTEGER := 0;
    v_completion_id VARCHAR(255);
    v_has_websearch BOOLEAN := false;
    v_websearch_results INTEGER := 0;

    -- Pricing
    v_prompt_price DECIMAL(12,8) := 0;
    v_completion_price DECIMAL(12,8) := 0;
    v_input_image_price DECIMAL(12,8) := 0; -- existing input image unit pricing
    v_output_image_price DECIMAL(12,8) := 0; -- new output image pricing
    v_websearch_price DECIMAL(12,8) := 0;

    -- Units (counts)
    v_input_image_units INTEGER := 0;    -- attachments on user message (cap 3)
    v_output_image_units_price DECIMAL(12,8) := 0;   -- output image unit price from model_access

    -- Costs
    v_prompt_cost DECIMAL(12,6) := 0;
    v_text_completion_cost DECIMAL(12,6) := 0;
    v_input_image_cost DECIMAL(12,6) := 0;
    v_output_image_cost DECIMAL(12,6) := 0;
    v_websearch_cost DECIMAL(12,6) := 0;
    v_total_cost DECIMAL(12,6) := 0;

    v_existing_total DECIMAL(12,6) := 0;
    v_delta DECIMAL(12,6) := 0;
BEGIN
    -- Resolve assistant message + user message using flexible parameter
    -- First try treating input as user_message_id
    SELECT m2.id, m2.user_message_id, m2.session_id, s.user_id, m2.model, m2.message_timestamp, m2.elapsed_ms,
           COALESCE(m2.input_tokens,0), COALESCE(m2.output_tokens,0), m2.completion_id,
           COALESCE(m2.has_websearch,false), COALESCE(m2.websearch_result_count,0),
           COALESCE(m2.output_image_tokens,0)
    INTO v_assistant_id, v_user_msg_id, v_session_id, v_user_id, v_model, v_message_timestamp, v_elapsed_ms,
         v_prompt_tokens, v_completion_tokens, v_completion_id,
         v_has_websearch, v_websearch_results, v_output_image_tokens
    FROM public.chat_messages m2
    JOIN public.chat_sessions s ON s.id = m2.session_id
    WHERE (
            m2.user_message_id = p_user_message_id -- legacy path (given user msg id)
            OR m2.id = p_user_message_id           -- direct assistant id path
          )
      AND m2.role = 'assistant'
      AND (m2.error_message IS NULL OR m2.error_message = '')
    ORDER BY m2.message_timestamp DESC
    LIMIT 1;

    IF v_assistant_id IS NULL THEN
        RETURN; -- nothing to do yet
    END IF;

    -- If parameter WAS the assistant id, ensure v_user_msg_id holds original user message id
    IF p_user_message_id = v_assistant_id THEN
        -- already correct (v_user_msg_id may be null if system-created assistant message)
    ELSE
        -- p_message_id was user message id; v_user_msg_id already assigned through select
    END IF;

    -- Pricing snapshot
    SELECT 
        COALESCE(prompt_price,'0'),
        COALESCE(completion_price,'0'),
        COALESCE(image_price,'0'),
        COALESCE(output_image_price,'0'),
        COALESCE(web_search_price,'0')
    INTO v_prompt_price, v_completion_price, v_input_image_price, v_output_image_units_price, v_websearch_price
    FROM public.model_access
    WHERE model_id = v_model;

    -- Fallback for known model override
    IF (v_output_image_units_price = 0 OR v_output_image_units_price IS NULL) AND v_model = 'google/gemini-2.5-flash-image-preview' THEN
        v_output_image_units_price := 0.00003; -- override until model sync includes it
    END IF;

    -- Web search fallback price
    v_websearch_price := COALESCE(v_websearch_price,0);
    IF v_websearch_price = 0 THEN
        v_websearch_price := 0.004; -- default per result pricing baseline
    END IF;

    -- Input images (user message attachments, cap 3)
    IF v_user_msg_id IS NOT NULL THEN
        SELECT LEAST(COALESCE(COUNT(*),0), 3)
        INTO v_input_image_units
        FROM public.chat_attachments
        WHERE message_id = v_user_msg_id
          AND status = 'ready';
    END IF;

    -- FIXED: completion_tokens and output_image_tokens are separate, not overlapping
    -- completion_tokens = text output tokens (from OpenRouter)
    -- output_image_tokens = image output tokens (from completion_tokens_details.image_tokens)
    v_text_completion_tokens := COALESCE(v_completion_tokens, 0);

    -- Cost components
    v_prompt_cost := ROUND( (v_prompt_tokens * v_prompt_price)::numeric, 6 );
    v_text_completion_cost := ROUND( (v_text_completion_tokens * v_completion_price)::numeric, 6 );
    v_input_image_cost := ROUND( (v_input_image_units * v_input_image_price)::numeric, 6 );
    v_output_image_cost := ROUND( (v_output_image_tokens * v_output_image_units_price)::numeric, 6 );

    IF v_has_websearch THEN
        v_websearch_cost := ROUND( (LEAST(COALESCE(v_websearch_results,0), 50) * v_websearch_price)::numeric, 6 );
    ELSE
        v_websearch_cost := 0;
    END IF;

    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_text_completion_cost,0) + COALESCE(v_input_image_cost,0) + COALESCE(v_output_image_cost,0) + COALESCE(v_websearch_cost,0);

    SELECT total_cost INTO v_existing_total
    FROM public.message_token_costs
    WHERE assistant_message_id = v_assistant_id;

    INSERT INTO public.message_token_costs (
        user_id, session_id, assistant_message_id, user_message_id, completion_id,
        model_id, message_timestamp, prompt_tokens, completion_tokens, elapsed_ms,
        prompt_unit_price, completion_unit_price, image_units, image_unit_price,
        prompt_cost, completion_cost, image_cost, websearch_cost,
        output_image_tokens, output_image_units_price, output_image_cost, total_cost, pricing_source
    ) VALUES (
        v_user_id, v_session_id, v_assistant_id, v_user_msg_id, v_completion_id,
        v_model, v_message_timestamp, v_prompt_tokens, v_completion_tokens, COALESCE(v_elapsed_ms,0),
        v_prompt_price, v_completion_price, v_input_image_units, v_input_image_price,
        v_prompt_cost, v_text_completion_cost, v_input_image_cost, v_websearch_cost,
        v_output_image_tokens, v_output_image_units_price, v_output_image_cost, v_total_cost,
        jsonb_build_object(
            'model_id', v_model,
            'pricing_basis', 'unified_per_token_plus_input_output_images_plus_websearch',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'input_image_price', v_input_image_price,
            'image_units', v_input_image_units,
            'output_image_price', v_output_image_units_price,
            'output_image_tokens', v_output_image_tokens,
            'output_image_basis', 'per_output_token',
            'text_completion_tokens', v_text_completion_tokens,
            'web_search_price', v_websearch_price,
            'websearch_results', v_websearch_results,
            'websearch_unit_basis', 'per_result'
        )
    ) ON CONFLICT (assistant_message_id) DO UPDATE SET
        prompt_tokens = EXCLUDED.prompt_tokens,
        completion_tokens = EXCLUDED.completion_tokens,
        prompt_unit_price = EXCLUDED.prompt_unit_price,
        completion_unit_price = EXCLUDED.completion_unit_price,
        image_units = EXCLUDED.image_units,
        image_unit_price = EXCLUDED.image_unit_price,
        prompt_cost = EXCLUDED.prompt_cost,
        completion_cost = EXCLUDED.completion_cost,
        image_cost = EXCLUDED.image_cost,
        websearch_cost = EXCLUDED.websearch_cost,
        output_image_tokens = EXCLUDED.output_image_tokens,
        output_image_units_price = EXCLUDED.output_image_units_price,
        output_image_cost = EXCLUDED.output_image_cost,
        total_cost = EXCLUDED.total_cost,
        pricing_source = EXCLUDED.pricing_source;

    v_delta := COALESCE(v_total_cost,0) - COALESCE(v_existing_total,0);
    IF v_delta <> 0 THEN
        UPDATE public.user_usage_daily
        SET estimated_cost = COALESCE(estimated_cost,0) + v_delta,
            updated_at = NOW()
        WHERE user_id = v_user_id AND usage_date = CURRENT_DATE;

        IF NOT FOUND THEN
            INSERT INTO public.user_usage_daily (user_id, usage_date, estimated_cost)
            VALUES (v_user_id, CURRENT_DATE, v_delta)
            ON CONFLICT (user_id, usage_date) DO UPDATE SET
                estimated_cost = public.user_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
                updated_at = NOW();
        END IF;
    END IF;
END;
$$;

-- Trigger: when an attachment is linked to a message, recompute costs
CREATE OR REPLACE FUNCTION public.on_chat_attachment_link_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.message_id IS NOT NULL
       AND (OLD.message_id IS NULL OR NEW.message_id <> OLD.message_id)
       AND NEW.status = 'ready' THEN
        -- Only recompute for user message (input images). Skip assistant output image linking.
        -- This avoids double recompute when assistant images arrive after initial assistant row insert.
        PERFORM 1 FROM public.chat_messages cm WHERE cm.id = NEW.message_id AND cm.role = 'user';
        IF FOUND THEN
            PERFORM public.recompute_image_cost_for_user_message(NEW.message_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_attachment_link_recompute_cost ON public.chat_attachments;
CREATE TRIGGER after_attachment_link_recompute_cost
    AFTER UPDATE OF message_id ON public.chat_attachments
    FOR EACH ROW
    EXECUTE FUNCTION public.on_chat_attachment_link_recompute();

-- Per-user per-model daily aggregated view
CREATE OR REPLACE VIEW public.user_model_costs_daily AS
SELECT
    user_id,
    (message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
    model_id,
    SUM(prompt_tokens) AS prompt_tokens,
    SUM(completion_tokens) AS completion_tokens,
    SUM(total_tokens) AS total_tokens,
    ROUND(SUM(total_cost), 6) AS total_cost,
    COUNT(*) AS assistant_messages
FROM public.message_token_costs
GROUP BY user_id, (message_timestamp AT TIME ZONE 'UTC')::date, model_id;

-- Harden view semantics and privileges, and expose RPCs for user/admin access

-- Explicitly set invoker semantics (prevents SECURITY DEFINER behavior)
DO $$
BEGIN
        IF EXISTS (
                SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='user_model_costs_daily'
        ) THEN
                EXECUTE 'ALTER VIEW public.user_model_costs_daily SET (security_invoker = true)';
        END IF;
END$$;

-- Restrict direct SELECT on the view: service_role only (app uses RPCs)
REVOKE ALL ON TABLE public.user_model_costs_daily FROM PUBLIC;
GRANT SELECT ON TABLE public.user_model_costs_daily TO service_role;

-- Per-user RPC: current-user daily model costs between dates (optional model filter)
-- SECURITY INVOKER; respects RLS on message_token_costs
CREATE OR REPLACE FUNCTION public.get_user_model_costs_daily(
    p_start DATE,
    p_end   DATE,
    p_model_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    usage_date DATE,
    model_id   VARCHAR(100),
    total_tokens BIGINT,
    total_cost  DECIMAL(18,6)
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        (mtc.message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
        COALESCE(mtc.model_id, 'unknown') AS model_id,
        SUM(mtc.total_tokens)::bigint       AS total_tokens,
        ROUND(SUM(mtc.total_cost), 6)       AS total_cost
    FROM public.message_token_costs mtc
    WHERE mtc.user_id = auth.uid()
        AND mtc.message_timestamp >= p_start
        AND mtc.message_timestamp < (p_end + 1)
        AND (p_model_id IS NULL OR mtc.model_id = p_model_id)
    GROUP BY 1, 2
    ORDER BY 1 ASC;
$$;

COMMENT ON FUNCTION public.get_user_model_costs_daily(DATE, DATE, TEXT)
    IS 'Per-user RPC: daily model costs between dates inclusive; SECURITY INVOKER and respects RLS.';

-- Admin RPC: all users daily messages/tokens between dates
-- SECURITY DEFINER; enforces admin check explicitly
CREATE OR REPLACE FUNCTION public.get_admin_user_model_costs_daily(
    p_start DATE,
    p_end   DATE
)
RETURNS TABLE (
    usage_date DATE,
    user_id UUID,
    assistant_messages BIGINT,
    total_tokens BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT
        (mtc.message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
        mtc.user_id,
        COUNT(*)::bigint         AS assistant_messages,
        SUM(mtc.total_tokens)::bigint AS total_tokens
    FROM public.message_token_costs mtc
    WHERE mtc.message_timestamp >= p_start
        AND mtc.message_timestamp < (p_end + 1)
    GROUP BY 1, 2
    ORDER BY 1 ASC;
END;
$$;

COMMENT ON FUNCTION public.get_admin_user_model_costs_daily(DATE, DATE)
    IS 'Admin RPC: per-user daily messages/tokens between dates inclusive; requires admin and uses SECURITY DEFINER.';

-- Grants for RPCs
DO $$ BEGIN
    BEGIN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_model_costs_daily(DATE, DATE, TEXT) TO authenticated';
    EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_model_costs_daily(DATE, DATE, TEXT) TO service_role';
    EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_admin_user_model_costs_daily(DATE, DATE) TO authenticated';
    EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_admin_user_model_costs_daily(DATE, DATE) TO service_role';
    EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

-- Admin-only global aggregation function
CREATE OR REPLACE FUNCTION public.get_global_model_costs(
    p_start_date DATE,
    p_end_date DATE,
    p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (
    usage_period DATE,
    model_id VARCHAR(100),
    prompt_tokens BIGINT,
    completion_tokens BIGINT,
    total_tokens BIGINT,
    total_cost DECIMAL(18,6),
    assistant_messages BIGINT,
    distinct_users BIGINT
) AS $$
DECLARE
    v_trunc TEXT := 'day';
BEGIN
    -- Validate granularity
    IF lower(p_granularity) IN ('day','week','month') THEN
        v_trunc := lower(p_granularity);
    END IF;
    -- Admin check
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;
    RETURN QUERY
    SELECT
        (date_trunc(v_trunc, mtc.message_timestamp))::date AS usage_period,
        mtc.model_id,
        SUM(mtc.prompt_tokens) AS prompt_tokens,
        SUM(mtc.completion_tokens) AS completion_tokens,
        SUM(mtc.total_tokens) AS total_tokens,
        ROUND(SUM(mtc.total_cost),6) AS total_cost,
        COUNT(*) AS assistant_messages,
        COUNT(DISTINCT mtc.user_id) AS distinct_users
    FROM public.message_token_costs AS mtc
    WHERE mtc.message_timestamp >= p_start_date
      AND mtc.message_timestamp < (p_end_date + 1)
    GROUP BY 1, 2
    ORDER BY usage_period ASC, total_cost DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_global_model_costs IS 'Admin-only: aggregate model costs by day/week/month between dates inclusive.';

-- =============================================================================
-- ADMIN ANALYTICS: ERROR COUNT
-- =============================================================================

-- Admin-only count of error messages between dates inclusive
CREATE OR REPLACE FUNCTION public.get_error_count(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS BIGINT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_count BIGINT := 0;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.chat_messages m
    WHERE m.message_timestamp >= p_start_date
      AND m.message_timestamp < (p_end_date + 1)
      AND m.error_message IS NOT NULL
      AND m.error_message <> '';

    RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.get_error_count(DATE, DATE) IS 'Admin-only: count of error messages between dates inclusive.';

-- =============================================================================
-- ADMIN ANALYTICS: RECENT ERRORS (ENRICHED MODEL)
-- =============================================================================

-- Admin-only function to fetch recent error messages with enriched model inference
CREATE OR REPLACE FUNCTION public.get_recent_errors(
    p_start_date DATE,
    p_end_date DATE,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    message_id TEXT,
    session_id TEXT,
    user_id UUID,
    model VARCHAR(100),
    message_timestamp TIMESTAMPTZ,
    error_message TEXT,
    completion_id VARCHAR(255),
    user_message_id TEXT,
    elapsed_ms INTEGER
)
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;

    RETURN QUERY
    SELECT
        m.id AS message_id,
        m.session_id,
        s.user_id,
        COALESCE(
            m.model,
            -- If this row is an assistant message with a cost snapshot, trust cost snapshot model
            (SELECT mtc.model_id FROM public.message_token_costs mtc WHERE mtc.assistant_message_id = m.id LIMIT 1),
            -- If this row is a user message with a later assistant cost snapshot, use that model
            (SELECT mtc2.model_id FROM public.message_token_costs mtc2 WHERE mtc2.user_message_id = m.id ORDER BY mtc2.message_timestamp DESC LIMIT 1),
            -- If an assistant message exists linked by user_message_id, use its model
            (SELECT m2.model FROM public.chat_messages m2 WHERE m2.user_message_id = m.id ORDER BY m2.message_timestamp DESC LIMIT 1),
            -- Fall back to session's last known model
            s.last_model
        ) AS model,
        m.message_timestamp,
        m.error_message,
        m.completion_id,
        m.user_message_id,
        m.elapsed_ms
    FROM public.chat_messages m
    JOIN public.chat_sessions s ON s.id = m.session_id
    WHERE m.message_timestamp >= p_start_date
      AND m.message_timestamp < (p_end_date + 1)
      AND m.error_message IS NOT NULL
      AND m.error_message <> ''
    ORDER BY m.message_timestamp DESC
    LIMIT COALESCE(p_limit, 100);
END;
$fn$
LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_recent_errors(DATE, DATE, INTEGER)
    IS 'Admin-only: most recent error messages (default 100) with enriched model fallback from costs / assistant / session.';

