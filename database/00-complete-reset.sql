-- ========================================
-- COMPLETE DATABASE RESET SCRIPT
-- ========================================
-- This script will completely reset your database to a clean state
-- WARNING: This will DELETE ALL DATA - use with caution!

-- =============================================================================
-- 1. DROP ALL TABLES AND THEIR DEPENDENCIES
-- =============================================================================

-- Drop all chat-related tables
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;

-- Drop all user-related tables
DROP TABLE IF EXISTS public.user_activity_log CASCADE;
DROP TABLE IF EXISTS public.user_usage_daily CASCADE;
DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.user_saved_prompts CASCADE;
DROP TABLE IF EXISTS public.user_model_access CASCADE;
DROP TABLE IF EXISTS public.user_model_preferences CASCADE;
DROP TABLE IF EXISTS public.model_access CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.usage_tracking CASCADE;
DROP TABLE IF EXISTS public.user_custom_themes CASCADE;

-- Drop system tables
DROP TABLE IF EXISTS public.system_cache CASCADE;
DROP TABLE IF EXISTS public.system_stats CASCADE;

-- =============================================================================
-- 2. DROP ALL FUNCTIONS
-- =============================================================================

-- Chat and sync functions
DROP FUNCTION IF EXISTS public.sync_user_conversations(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.get_session_messages(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_recent_sessions(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.update_session_stats() CASCADE;
DROP FUNCTION IF EXISTS public.update_session_timestamp() CASCADE;

-- Profile functions
DROP FUNCTION IF EXISTS public.get_user_complete_profile(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_user_profile_sync() CASCADE;
DROP FUNCTION IF EXISTS public.sync_profile_from_auth(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_user_profile_on_auth() CASCADE;
DROP FUNCTION IF EXISTS public.create_profile_on_signup() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

-- Model and access functions
DROP FUNCTION IF EXISTS public.get_user_allowed_models(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_user_access_model(uuid, character varying) CASCADE;
DROP FUNCTION IF EXISTS public.get_available_prompts(uuid) CASCADE;

-- Usage and analytics functions
DROP FUNCTION IF EXISTS public.track_user_usage(uuid, text, integer, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_dashboard_data(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_preferences(uuid) CASCADE;

-- Utility functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- =============================================================================
-- 3. DROP ALL CUSTOM TYPES
-- =============================================================================

DROP TYPE IF EXISTS subscription_tier CASCADE;
DROP TYPE IF EXISTS user_tier CASCADE;
DROP TYPE IF EXISTS activity_type CASCADE;

-- =============================================================================
-- 4. DROP ALL TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_profile_sync ON auth.users;
DROP TRIGGER IF EXISTS on_message_change ON public.chat_messages;
DROP TRIGGER IF EXISTS on_session_updated ON public.chat_sessions;
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;

-- =============================================================================
-- 5. DROP ALL INDEXES (explicit cleanup)
-- =============================================================================

-- Profiles indexes
DROP INDEX IF EXISTS public.idx_profiles_email CASCADE;
DROP INDEX IF EXISTS public.idx_profiles_last_active CASCADE;
DROP INDEX IF EXISTS public.idx_profiles_subscription_tier CASCADE;
DROP INDEX IF EXISTS public.idx_profiles_account_status CASCADE;

-- Chat sessions indexes
DROP INDEX IF EXISTS public.idx_chat_sessions_user_id CASCADE;
DROP INDEX IF EXISTS public.idx_chat_sessions_user_activity CASCADE;
DROP INDEX IF EXISTS public.idx_chat_sessions_user_created CASCADE;
DROP INDEX IF EXISTS public.idx_chat_sessions_active CASCADE;

-- Chat messages indexes
DROP INDEX IF EXISTS public.idx_chat_messages_session_id CASCADE;
DROP INDEX IF EXISTS public.idx_chat_messages_session_timestamp CASCADE;
DROP INDEX IF EXISTS public.idx_chat_messages_timestamp CASCADE;
DROP INDEX IF EXISTS public.idx_chat_messages_role CASCADE;

-- User sessions indexes
DROP INDEX IF EXISTS public.idx_user_sessions_user_id CASCADE;
DROP INDEX IF EXISTS public.idx_user_sessions_active CASCADE;
DROP INDEX IF EXISTS public.idx_user_sessions_last_activity CASCADE;

-- User activity log indexes
DROP INDEX IF EXISTS public.idx_user_activity_user_id CASCADE;
DROP INDEX IF EXISTS public.idx_user_activity_timestamp CASCADE;
DROP INDEX IF EXISTS public.idx_user_activity_action CASCADE;
DROP INDEX IF EXISTS public.idx_user_activity_user_timestamp CASCADE;

-- Model access indexes
DROP INDEX IF EXISTS public.idx_user_model_access_user_id CASCADE;
DROP INDEX IF EXISTS public.idx_user_model_access_model CASCADE;
DROP INDEX IF EXISTS public.idx_user_model_access_active CASCADE;

-- Usage tracking indexes
DROP INDEX IF EXISTS public.idx_usage_tracking_model CASCADE;
DROP INDEX IF EXISTS public.idx_usage_tracking_timestamp CASCADE;
DROP INDEX IF EXISTS public.idx_usage_tracking_user_date CASCADE;
DROP INDEX IF EXISTS public.idx_usage_tracking_user_id CASCADE;

-- User custom themes indexes
DROP INDEX IF EXISTS public.idx_user_custom_themes_active CASCADE;
DROP INDEX IF EXISTS public.idx_user_custom_themes_public CASCADE;
DROP INDEX IF EXISTS public.idx_user_custom_themes_user_id CASCADE;

-- User model preferences indexes
DROP INDEX IF EXISTS public.idx_user_model_preferences_favorites CASCADE;
DROP INDEX IF EXISTS public.idx_user_model_preferences_model CASCADE;
DROP INDEX IF EXISTS public.idx_user_model_preferences_sort CASCADE;
DROP INDEX IF EXISTS public.idx_user_model_preferences_user_id CASCADE;

-- User saved prompts indexes
DROP INDEX IF EXISTS public.idx_user_saved_prompts_user_id CASCADE;
DROP INDEX IF EXISTS public.idx_user_saved_prompts_category CASCADE;
DROP INDEX IF EXISTS public.idx_user_saved_prompts_public CASCADE;
DROP INDEX IF EXISTS public.idx_user_saved_prompts_favorite CASCADE;

-- Primary key indexes
DROP INDEX IF EXISTS public.usage_tracking_pkey CASCADE;
DROP INDEX IF EXISTS public.user_custom_themes_pkey CASCADE;
DROP INDEX IF EXISTS public.user_model_preferences_pkey CASCADE;
DROP INDEX IF EXISTS public.user_model_preferences_user_id_model_id_key CASCADE;
DROP INDEX IF EXISTS public.user_saved_prompts_pkey CASCADE;

-- =============================================================================
-- 6. DROP ALL POLICIES (explicit cleanup)
-- =============================================================================

-- Profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

-- Chat sessions policies
DROP POLICY IF EXISTS "Users can view their own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can create their own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update their own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete their own chat sessions" ON public.chat_sessions;

-- Chat messages policies
DROP POLICY IF EXISTS "Users can view messages from their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can create messages in their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can update messages in their sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete messages in their sessions" ON public.chat_messages;

-- User sessions policies
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.user_sessions;

-- User activity log policies
DROP POLICY IF EXISTS "Users can view their own activity" ON public.user_activity_log;
DROP POLICY IF EXISTS "System can log user activity" ON public.user_activity_log;

-- Model access policies
DROP POLICY IF EXISTS "Users can view their model access" ON public.user_model_access;
DROP POLICY IF EXISTS "System can manage model access" ON public.user_model_access;

-- Usage tracking policies
DROP POLICY IF EXISTS "System can track usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users can view their usage" ON public.usage_tracking;

-- User custom themes policies
DROP POLICY IF EXISTS "Users can manage their own custom themes" ON public.user_custom_themes;
DROP POLICY IF EXISTS "Users can view public themes" ON public.user_custom_themes;

-- User model preferences policies
DROP POLICY IF EXISTS "Users can manage their own model preferences" ON public.user_model_preferences;

-- User saved prompts policies
DROP POLICY IF EXISTS "Users can manage their own prompts" ON public.user_saved_prompts;
DROP POLICY IF EXISTS "Users can view public prompts" ON public.user_saved_prompts;

-- Success message
SELECT 'Database completely reset! All tables, functions, types, triggers, indexes, and policies removed.' as status;
