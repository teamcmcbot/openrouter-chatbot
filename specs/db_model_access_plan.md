# Database Model Access Implementation Plan

## Executive Summary

This document provides a comprehensive analysis and implementation plan for transitioning from hardcoded model lists to a database-driven model access system integrated with OpenRouter API. The plan includes schema changes, API modifications, and a daily synchronization job.

## Current State Analysis

### Current Database Schema

#### Existing `model_access` Table (from Phase 3)

```sql
CREATE TABLE public.model_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_id VARCHAR(100) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'pro', 'enterprise', 'admin')),
    is_active BOOLEAN DEFAULT true,

    -- Cost per token (for billing)
    input_cost_per_token DECIMAL(10,8) DEFAULT 0.0,
    output_cost_per_token DECIMAL(10,8) DEFAULT 0.0,

    -- Rate limits
    daily_limit INTEGER DEFAULT NULL, -- NULL = unlimited
    monthly_limit INTEGER DEFAULT NULL,

    -- Metadata
    model_name VARCHAR(255),
    model_description TEXT,
    model_tags TEXT[],

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    UNIQUE(model_id, tier)
);
```

#### Current `profiles` Table (relevant fields)

```sql
-- From database/01-complete-user-management.sql and 03-complete-user-enhancements.sql
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    default_model VARCHAR(100) DEFAULT 'deepseek/deepseek-r1-0528:free',
    allowed_models TEXT[] DEFAULT ARRAY['deepseek/deepseek-r1-0528:free'], -- TO BE REMOVED
    -- ... other fields
);
```

### Current API Implementation

#### `/api/models` Endpoint Analysis

- **Location**: `src/app/api/models/route.ts`
- **Current Behavior**:
  - Uses environment variable `OPENROUTER_MODELS_LIST` for allowed models
  - Fetches from OpenRouter API with caching (10 minutes)
  - No database integration
  - No user tier-based filtering
  - No authentication required

#### Current Model Store

- **Location**: `stores/useModelStore.ts`
- **Current Behavior**:
  - Client-side caching with localStorage
  - Enhanced vs basic mode detection
  - No user-specific model filtering

### OpenRouter Models JSON Structure Analysis

Based on `/database/samples/openrouter_models.json`, each model contains:

```json
{
  "id": "qwen/qwen3-coder:free",
  "canonical_slug": "qwen/qwen3-coder-480b-a35b-07-25",
  "hugging_face_id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
  "name": "Qwen: Qwen3 Coder (free)",
  "created": 1753230546,
  "description": "Qwen3-Coder-480B-A35B-Instruct is a Mixture-of-Experts...",
  "context_length": 262144,
  "architecture": {
    "modality": "text->text",
    "input_modalities": ["text"],
    "output_modalities": ["text"],
    "tokenizer": "Qwen3",
    "instruct_type": null
  },
  "pricing": {
    "prompt": "0",
    "completion": "0",
    "request": "0",
    "image": "0",
    "web_search": "0",
    "internal_reasoning": "0"
  },
  "top_provider": {
    "context_length": 262144,
    "max_completion_tokens": null,
    "is_moderated": false
  },
  "per_request_limits": null,
  "supported_parameters": ["max_tokens", "temperature", ...]
}
```

## Proposed Schema Changes

### Enhanced `model_access` Table

```sql
-- Drop existing table and recreate with enhanced schema
DROP TABLE IF EXISTS public.model_access CASCADE;

CREATE TABLE public.model_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- OpenRouter model identification
    model_id VARCHAR(100) NOT NULL UNIQUE,
    canonical_slug VARCHAR(255),
    hugging_face_id VARCHAR(255),

    -- Model metadata from OpenRouter
    model_name VARCHAR(255) NOT NULL,
    model_description TEXT,
    context_length INTEGER DEFAULT 8192,
    created_timestamp BIGINT, -- OpenRouter's created field

    -- Architecture information
    modality VARCHAR(50), -- e.g., "text->text", "text+image->text"
    input_modalities JSONB DEFAULT '[]'::jsonb,
    output_modalities JSONB DEFAULT '[]'::jsonb,
    tokenizer VARCHAR(100),

    -- Pricing information (stored as strings to match OpenRouter format)
    prompt_price VARCHAR(20) DEFAULT '0',
    completion_price VARCHAR(20) DEFAULT '0',
    request_price VARCHAR(20) DEFAULT '0',
    image_price VARCHAR(20) DEFAULT '0',
    web_search_price VARCHAR(20) DEFAULT '0',
    internal_reasoning_price VARCHAR(20) DEFAULT '0',
    input_cache_read_price VARCHAR(20),
    input_cache_write_price VARCHAR(20),

    -- Provider information
    max_completion_tokens INTEGER,
    is_moderated BOOLEAN DEFAULT false,
    supported_parameters JSONB DEFAULT '[]'::jsonb,

    -- Status tracking (NEW REQUIREMENT)
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('active', 'inactive', 'disabled', 'new')),

    -- Tier access control (NEW REQUIREMENT)
    is_free BOOLEAN DEFAULT false,
    is_pro BOOLEAN DEFAULT false,
    is_enterprise BOOLEAN DEFAULT false,

    -- Rate limits (existing)
    daily_limit INTEGER DEFAULT NULL,
    monthly_limit INTEGER DEFAULT NULL,

    -- Sync tracking
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    openrouter_last_seen TIMESTAMPTZ DEFAULT NOW(),

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_model_access_status ON public.model_access(status);
CREATE INDEX idx_model_access_tier_access ON public.model_access(is_free, is_pro, is_enterprise);
CREATE INDEX idx_model_access_last_synced ON public.model_access(last_synced_at);
CREATE INDEX idx_model_access_openrouter_seen ON public.model_access(openrouter_last_seen);
```

### Remove `allowed_models` from `profiles` Table

```sql
-- Remove the allowed_models column as it will be replaced by model_access table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS allowed_models;

-- Update the update_user_preferences function to remove allowed_models handling
-- (This will be handled in the function updates section)
```

### New Sync Log Table

```sql
-- Track sync operations for monitoring and debugging
CREATE TABLE public.model_sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sync_started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    sync_completed_at TIMESTAMPTZ,

    -- Sync statistics
    total_openrouter_models INTEGER DEFAULT 0,
    models_added INTEGER DEFAULT 0,
    models_updated INTEGER DEFAULT 0,
    models_marked_inactive INTEGER DEFAULT 0,

    -- Status and error tracking
    sync_status VARCHAR(20) DEFAULT 'running' CHECK (sync_status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    error_details JSONB,

    -- Performance metrics
    duration_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_model_sync_log_status ON public.model_sync_log(sync_status, sync_started_at DESC);
```

## Database Functions

### Enhanced Model Access Functions

```sql
-- Function to get user's allowed models based on tier and model_access table
CREATE OR REPLACE FUNCTION public.get_user_allowed_models_v2(user_uuid UUID)
RETURNS TABLE (
    model_id VARCHAR(100),
    model_name VARCHAR(255),
    model_description TEXT,
    context_length INTEGER,
    prompt_price VARCHAR(20),
    completion_price VARCHAR(20),
    modality VARCHAR(50),
    input_modalities JSONB,
    output_modalities JSONB,
    supported_parameters JSONB,
    daily_limit INTEGER,
    monthly_limit INTEGER
) AS $$
DECLARE
    user_tier VARCHAR(20);
BEGIN
    -- Get user's subscription tier
    SELECT subscription_tier INTO user_tier
    FROM public.profiles
    WHERE id = user_uuid;

    -- If user not found, return free tier models
    IF user_tier IS NULL THEN
        user_tier := 'free';
    END IF;

    -- Return models available for user's tier
    RETURN QUERY
    SELECT
        ma.model_id,
        ma.model_name,
        ma.model_description,
        ma.context_length,
        ma.prompt_price,
        ma.completion_price,
        ma.modality,
        ma.input_modalities,
        ma.output_modalities,
        ma.supported_parameters,
        ma.daily_limit,
        ma.monthly_limit
    FROM public.model_access ma
    WHERE ma.status = 'active'
    AND (
        (user_tier = 'free' AND ma.is_free = true) OR
        (user_tier = 'pro' AND (ma.is_free = true OR ma.is_pro = true)) OR
        (user_tier = 'enterprise' AND (ma.is_free = true OR ma.is_pro = true OR ma.is_enterprise = true))
    )
    ORDER BY
        CASE
            WHEN ma.is_free THEN 1
            WHEN ma.is_pro THEN 2
            WHEN ma.is_enterprise THEN 3
            ELSE 4
        END,
        ma.model_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync models from OpenRouter API
CREATE OR REPLACE FUNCTION public.sync_openrouter_models(
    models_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    model_record JSONB;
    sync_log_id UUID;
    models_added INTEGER := 0;
    models_updated INTEGER := 0;
    models_marked_inactive INTEGER := 0;
    total_models INTEGER;
    start_time TIMESTAMPTZ := NOW();
    current_model_ids TEXT[];
BEGIN
    -- Start sync log
    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models)
    VALUES ('running', jsonb_array_length(models_data))
    RETURNING id INTO sync_log_id;

    -- Get total count
    total_models := jsonb_array_length(models_data);

    -- Collect all current model IDs from OpenRouter
    SELECT array_agg(model_record->>'id') INTO current_model_ids
    FROM jsonb_array_elements(models_data) AS model_record;

    -- Process each model from OpenRouter
    FOR model_record IN SELECT * FROM jsonb_array_elements(models_data)
    LOOP
        -- Insert or update model
        INSERT INTO public.model_access (
            model_id,
            canonical_slug,
            hugging_face_id,
            model_name,
            model_description,
            context_length,
            created_timestamp,
            modality,
            input_modalities,
            output_modalities,
            tokenizer,
            prompt_price,
            completion_price,
            request_price,
            image_price,
            web_search_price,
            internal_reasoning_price,
            input_cache_read_price,
            input_cache_write_price,
            max_completion_tokens,
            is_moderated,
            supported_parameters,
            openrouter_last_seen,
            last_synced_at
        ) VALUES (
            model_record->>'id',
            model_record->>'canonical_slug',
            model_record->>'hugging_face_id',
            model_record->>'name',
            model_record->>'description',
            COALESCE((model_record->>'context_length')::integer, 8192),
            COALESCE((model_record->>'created')::bigint, extract(epoch from now())::bigint),
            model_record->'architecture'->>'modality',
            COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
            COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
            model_record->'architecture'->>'tokenizer',
            COALESCE(model_record->'pricing'->>'prompt', '0'),
            COALESCE(model_record->'pricing'->>'completion', '0'),
            COALESCE(model_record->'pricing'->>'request', '0'),
            COALESCE(model_record->'pricing'->>'image', '0'),
            COALESCE(model_record->'pricing'->>'web_search', '0'),
            COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
            model_record->'pricing'->>'input_cache_read',
            model_record->'pricing'->>'input_cache_write',
            (model_record->'top_provider'->>'max_completion_tokens')::integer,
            COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
            COALESCE(model_record->'supported_parameters', '[]'::jsonb),
            NOW(),
            NOW()
        )
        ON CONFLICT (model_id) DO UPDATE SET
            canonical_slug = EXCLUDED.canonical_slug,
            hugging_face_id = EXCLUDED.hugging_face_id,
            model_name = EXCLUDED.model_name,
            model_description = EXCLUDED.model_description,
            context_length = EXCLUDED.context_length,
            modality = EXCLUDED.modality,
            input_modalities = EXCLUDED.input_modalities,
            output_modalities = EXCLUDED.output_modalities,
            tokenizer = EXCLUDED.tokenizer,
            prompt_price = EXCLUDED.prompt_price,
            completion_price = EXCLUDED.completion_price,
            request_price = EXCLUDED.request_price,
            image_price = EXCLUDED.image_price,
            web_search_price = EXCLUDED.web_search_price,
            internal_reasoning_price = EXCLUDED.internal_reasoning_price,
            input_cache_read_price = EXCLUDED.input_cache_read_price,
            input_cache_write_price = EXCLUDED.input_cache_write_price,
            max_completion_tokens = EXCLUDED.max_completion_tokens,
            is_moderated = EXCLUDED.is_moderated,
            supported_parameters = EXCLUDED.supported_parameters,
            openrouter_last_seen = EXCLUDED.openrouter_last_seen,
            last_synced_at = EXCLUDED.last_synced_at,
            updated_at = NOW();

        -- Count if this was an insert or update
        IF FOUND THEN
            models_updated := models_updated + 1;
        ELSE
            models_added := models_added + 1;
        END IF;
    END LOOP;

    -- Mark models as inactive if they're no longer in OpenRouter
    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
    AND status != 'inactive';

    GET DIAGNOSTICS models_marked_inactive = ROW_COUNT;

    -- Complete sync log
    UPDATE public.model_sync_log
    SET
        sync_status = 'completed',
        sync_completed_at = NOW(),
        models_added = sync_openrouter_models.models_added,
        models_updated = sync_openrouter_models.models_updated,
        models_marked_inactive = sync_openrouter_models.models_marked_inactive,
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'sync_log_id', sync_log_id,
        'total_processed', total_models,
        'models_added', models_added,
        'models_updated', models_updated,
        'models_marked_inactive', models_marked_inactive,
        'duration_ms', EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    );

EXCEPTION WHEN OTHERS THEN
    -- Log error
    UPDATE public.model_sync_log
    SET
        sync_status = 'failed',
        sync_completed_at = NOW(),
        error_message = SQLERRM,
        error_details = jsonb_build_object('sqlstate', SQLSTATE),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sync_log_id', sync_log_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update model tier access (for admin use)
CREATE OR REPLACE FUNCTION public.update_model_tier_access(
    p_model_id VARCHAR(100),
    p_is_free BOOLEAN DEFAULT NULL,
    p_is_pro BOOLEAN DEFAULT NULL,
    p_is_enterprise BOOLEAN DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- Validate status if provided
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'inactive', 'disabled', 'new') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid status. Must be: active, inactive, disabled, or new'
        );
    END IF;

    -- Update model access
    UPDATE public.model_access
    SET
        is_free = COALESCE(p_is_free, is_free),
        is_pro = COALESCE(p_is_pro, is_pro),
        is_enterprise = COALESCE(p_is_enterprise, is_enterprise),
        status = COALESCE(p_status, status),
        updated_at = NOW()
    WHERE model_id = p_model_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Model not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'model_id', p_model_id,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Update Existing Functions

```sql
-- Update the existing update_user_preferences function to remove allowed_models handling
CREATE OR REPLACE FUNCTION public.update_user_preferences(
    user_uuid UUID,
    preference_type VARCHAR(50), -- 'ui', 'session', 'model'
    preferences JSONB
)
RETURNS JSONB AS $$
DECLARE
    updated_count INTEGER;
    current_prefs JSONB;
BEGIN
    -- Validate preference type
    IF preference_type NOT IN ('ui', 'session', 'model') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid preference type. Must be: ui, session, or model'
        );
    END IF;

    -- Update based on preference type
    CASE preference_type
        WHEN 'ui' THEN
            UPDATE public.profiles
            SET ui_preferences = jsonb_deep_merge(COALESCE(ui_preferences, '{}'::jsonb), preferences),
                updated_at = NOW()
            WHERE id = user_uuid;

        WHEN 'session' THEN
            UPDATE public.profiles
            SET session_preferences = jsonb_deep_merge(COALESCE(session_preferences, '{}'::jsonb), preferences),
                updated_at = NOW()
            WHERE id = user_uuid;

        WHEN 'model' THEN
            UPDATE public.profiles
            SET default_model = COALESCE(preferences->>'default_model', default_model),
                temperature = COALESCE((preferences->>'temperature')::decimal, temperature),
                system_prompt = COALESCE(preferences->>'system_prompt', system_prompt),
                -- REMOVED: allowed_models handling
                updated_at = NOW()
            WHERE id = user_uuid;
    END CASE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Log the preference update
    PERFORM public.log_user_activity(
        user_uuid,
        'preferences_updated',
        'profile',
        user_uuid::text,
        jsonb_build_object(
            'preference_type', preference_type,
            'updated_fields', preferences
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'preference_type', preference_type,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## API Endpoint Changes

### Enhanced `/api/models` Endpoint

**New Requirements:**

1. Require authentication
2. Filter models based on user tier
3. Use database instead of environment variables
4. Maintain backward compatibility

**Proposed Implementation:**

```typescript
// src/app/api/models/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "../../../../lib/supabase/server";
import { logger } from "../../../../lib/utils/logger";
import { handleError } from "../../../../lib/utils/errors";
import {
  ModelInfo,
  ModelsResponse,
  LegacyModelsResponse,
} from "../../../../lib/types/openrouter";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get authenticated user
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if enhanced mode is requested
    const { searchParams } = new URL(request.url);
    const enhancedParam = searchParams.get("enhanced");
    const isEnhancedRequested = enhancedParam === "true";

    logger.info(
      `Models API called - Enhanced mode: ${isEnhancedRequested}, User: ${user.id}`
    );

    // Get user's allowed models from database
    const { data: allowedModels, error: modelsError } = await supabase.rpc(
      "get_user_allowed_models_v2",
      { user_uuid: user.id }
    );

    if (modelsError) {
      logger.error("Error fetching user allowed models:", modelsError);
      throw new Error("Failed to fetch allowed models");
    }

    if (isEnhancedRequested) {
      // Transform to ModelInfo format for enhanced mode
      const transformedModels: ModelInfo[] = allowedModels.map((model) => ({
        id: model.model_id,
        name: model.model_name,
        description: model.model_description,
        context_length: model.context_length,
        pricing: {
          prompt: model.prompt_price,
          completion: model.completion_price,
        },
        input_modalities: model.input_modalities || [],
        output_modalities: model.output_modalities || [],
        supported_parameters: model.supported_parameters || [],
        created: 0, // Will be populated from database if needed
      }));

      const enhancedResponse: ModelsResponse = {
        models: transformedModels,
      };

      const responseTime = Date.now() - startTime;
      logger.info(
        `Enhanced Models API response - Models: ${transformedModels.length}, Time: ${responseTime}ms`
      );

      const headers = new Headers();
      headers.set("X-Enhanced-Mode", "true");
      headers.set("X-Response-Time", responseTime.toString());
      headers.set("X-Models-Count", transformedModels.length.toString());
      headers.set("X-User-Tier", "database-driven");

      return NextResponse.json(enhancedResponse, { headers });
    } else {
      // Legacy mode - return simple string array
      const legacyModels = allowedModels.map((model) => model.model_id);

      const legacyResponse: LegacyModelsResponse = { models: legacyModels };

      const responseTime = Date.now() - startTime;
      logger.info(
        `Legacy Models API response - Models: ${legacyModels.length}, Time: ${responseTime}ms`
      );

      const headers = new Headers();
      headers.set("X-Enhanced-Mode", "false");
      headers.set("X-Response-Time", responseTime.toString());
      headers.set("X-Models-Count", legacyModels.length.toString());

      return NextResponse.json(legacyResponse, { headers });
    }
  } catch (error) {
    logger.error("Critical error in models API:", error);
    return handleError(error);
  }
}
```

### New Admin API Endpoints

```typescript
// src/app/api/admin/models/sync/route.ts
export async function POST(request: NextRequest) {
  // Trigger manual sync with OpenRouter
  // Call sync_openrouter_models function
}

// src/app/api/admin/models/[modelId]/route.ts
export async function PATCH(request: NextRequest) {
  // Update model tier access and status
  // Call update_model_tier_access function
}

// src/app/api/admin/models/route.ts
export async function GET(request: NextRequest) {
  // Get all models with admin view (including status, tier access)
}
```

## Daily Sync Job Architecture

### Option 1: Next.js API Route with Cron (Recommended)

```typescript
// src/app/api/cron/sync-models/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "../../../../lib/supabase/server";
import { fetchOpenRouterModels } from "../../../../lib/utils/openrouter";
import { logger } from "../../../../lib/utils/logger";

export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logger.info("Starting daily model sync job");

    // Fetch models from OpenRouter
    const openRouterModels = await fetchOpenRouterModels();

    // Sync with database
    const supabase = createServerClient();
    const { data: syncResult, error } = await supabase.rpc(
      "sync_openrouter_models",
      {
        models_data: JSON.stringify(openRouterModels),
      }
    );

    if (error) {
      throw error;
    }

    logger.info("Daily model sync completed successfully", syncResult);

    return NextResponse.json({
      success: true,
      ...syncResult,
    });
  } catch (error) {
    logger.error("Daily model sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
```

### Vercel Cron Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync-models",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### Option 2: Supabase Edge Function (Alternative)

```sql
-- Create a Supabase Edge Function that runs daily
-- This would be deployed separately to Supabase
```

## Migration Scripts

### Complete Migration SQL

```sql
-- /database/05-model-access-migration.sql

-- =============================================================================
-- MODEL ACCESS MIGRATION - PHASE 5
-- =============================================================================
-- Migrates from hardcoded model lists to database-driven model access

BEGIN;

-- 1. Backup existing model_access table
CREATE TABLE IF NOT EXISTS public.model_access_backup AS
SELECT * FROM public.model_access;

-- 2. Drop and recreate model_access table with new schema
DROP TABLE IF EXISTS public.model_access CASCADE;

CREATE TABLE public.model_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- OpenRouter model identification
    model_id VARCHAR(100) NOT NULL UNIQUE,
    canonical_slug VARCHAR(255),
    hugging_face_id VARCHAR(255),

    -- Model metadata from OpenRouter
    model_name VARCHAR(255) NOT NULL,
    model_description TEXT,
    context_length INTEGER DEFAULT 8192,
    created_timestamp BIGINT,

    -- Architecture information
    modality VARCHAR(50),
    input_modalities JSONB DEFAULT '[]'::jsonb,
    output_modalities JSONB DEFAULT '[]'::jsonb,
    tokenizer VARCHAR(100),

    -- Pricing information
    prompt_price VARCHAR(20) DEFAULT '0',
    completion_price VARCHAR(20) DEFAULT '0',
    request_price VARCHAR(20) DEFAULT '0',
    image_price VARCHAR(20) DEFAULT '0',
    web_search_price VARCHAR(20) DEFAULT '0',
    internal_reasoning_price VARCHAR(20) DEFAULT '0',
    input_cache_read_price VARCHAR(20),
    input_cache_write_price VARCHAR(20),

    -- Provider information
    max_completion_tokens INTEGER,
    is_moderated BOOLEAN DEFAULT false,
    supported_parameters JSONB DEFAULT '[]'::jsonb,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('active', 'inactive', 'disabled', 'new')),

    -- Tier access control
    is_free BOOLEAN DEFAULT false,
    is_pro BOOLEAN DEFAULT false,
    is_enterprise BOOLEAN DEFAULT false,

    -- Rate limits
    daily_limit INTEGER DEFAULT NULL,
    monthly_limit INTEGER DEFAULT NULL,

    -- Sync tracking
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    openrouter_last_seen TIMESTAMPTZ DEFAULT NOW(),

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Create indexes
CREATE INDEX idx_model_access_status ON public.model_access(status);
CREATE INDEX idx_model_access_tier_access ON public.model_access(is_free, is_pro, is_enterprise);
CREATE INDEX idx_model_access_last_synced ON public.model_access(last_synced_at);


CREATE INDEX idx_model_access_last_synced ON public.model_access(last_synced_at);
CREATE INDEX idx_model_access_openrouter_seen ON public.model_access(openrouter_last_seen);

-- 4. Create sync log table
CREATE TABLE public.model_sync_log (
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
sync_started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
sync_completed_at TIMESTAMPTZ,

    -- Sync statistics
    total_openrouter_models INTEGER DEFAULT 0,
    models_added INTEGER DEFAULT 0,
    models_updated INTEGER DEFAULT 0,
    models_marked_inactive INTEGER DEFAULT 0,

    -- Status and error tracking
    sync_status VARCHAR(20) DEFAULT 'running' CHECK (sync_status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    error_details JSONB,

    -- Performance metrics
    duration_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL

);

CREATE INDEX idx_model_sync_log_status ON public.model_sync_log(sync_status, sync_started_at DESC);

-- 5. Remove allowed_models column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS allowed_models;

-- 6. Enable RLS on new tables
ALTER TABLE public.model_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_sync_log ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
CREATE POLICY "All authenticated users can view model access" ON public.model_access
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can view sync logs" ON public.model_sync_log
FOR SELECT USING (
EXISTS (
SELECT 1 FROM public.profiles
WHERE id = auth.uid()
AND subscription_tier = 'admin'
)
);

-- 8. Insert seed data for common free models
INSERT INTO public.model_access (
model_id, model_name, model_description, status, is_free, is_pro, is_enterprise,
prompt_price, completion_price, context_length
) VALUES
('deepseek/deepseek-r1-0528:free', 'DeepSeek R1 Free', 'Advanced reasoning model - free tier', 'active', true, true, true, '0', '0', 32768),
('google/gemini-2.0-flash-exp:free', 'Gemini 2.0 Flash Free', 'Fast multimodal model - free tier', 'active', true, true, true, '0', '0', 1048576),
('qwen/qwen3-coder:free', 'Qwen3 Coder Free', 'Code generation model - free tier', 'active', true, true, true, '0', '0', 262144)
ON CONFLICT (model_id) DO NOTHING;

COMMIT;
```

### Initial Data Population Script

```sql
-- /database/06-initial-model-population.sql

-- =============================================================================
-- INITIAL MODEL POPULATION
-- =============================================================================
-- Populates the model_access table with initial data from OpenRouter

-- This script should be run after the migration to populate initial model data
-- It can be executed manually or as part of the first sync job

DO $$
DECLARE
    sync_result JSONB;
BEGIN
    -- Note: This would typically be called from the sync job
    -- For initial setup, admin should run the sync job manually
    -- or populate with a known set of models

    RAISE NOTICE 'Model access migration completed successfully';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Run initial sync job: POST /api/cron/sync-models';
    RAISE NOTICE '2. Configure model tier access via admin interface';
    RAISE NOTICE '3. Test /api/models endpoint with authenticated users';
END $$;
```

## Implementation Differences Summary

### Current Implementation vs Proposed

| Aspect              | Current                                       | Proposed                                   |
| ------------------- | --------------------------------------------- | ------------------------------------------ |
| **Model Source**    | Environment variable `OPENROUTER_MODELS_LIST` | Database `model_access` table              |
| **Authentication**  | Not required                                  | Required for all requests                  |
| **User Filtering**  | None - same models for all users              | Tier-based filtering (free/pro/enterprise) |
| **Model Metadata**  | Basic (ID only)                               | Rich metadata from OpenRouter API          |
| **Sync Mechanism**  | Manual environment variable updates           | Automated daily sync job                   |
| **Admin Control**   | Environment variable changes                  | Database-driven admin interface            |
| **Status Tracking** | None                                          | Active/inactive/disabled/new status        |
| **Caching**         | Client-side only (10 min server cache)        | Database + client-side caching             |
| **Pricing Info**    | Not available                                 | Full pricing information stored            |
| **Model Discovery** | Manual addition to env var                    | Automatic discovery from OpenRouter        |

### Breaking Changes

1. **Authentication Required**: The `/api/models` endpoint will now require authentication
2. **Response Format**: Enhanced mode will include additional metadata fields
3. **User-Specific Results**: Different users will see different models based on their tier
4. **Environment Variable**: `OPENROUTER_MODELS_LIST` will no longer be used

### Backward Compatibility

- Legacy mode (non-enhanced) will continue to return simple string arrays
- Existing client code will work with authentication added
- Model store will adapt to new response format automatically

## Implementation Timeline

### Phase 1: Database Migration (Week 1)

- [ ] Execute migration scripts
- [ ] Create new database functions
- [ ] Update existing functions
- [ ] Test database changes

### Phase 2: API Updates (Week 1-2)

- [ ] Update `/api/models` endpoint
- [ ] Add authentication middleware
- [ ] Create admin API endpoints
- [ ] Test API changes

### Phase 3: Sync Job Implementation (Week 2)

- [ ] Create sync job endpoint
- [ ] Implement OpenRouter integration
- [ ] Set up cron scheduling
- [ ] Test sync functionality

### Phase 4: Admin Interface (Week 3)

- [ ] Create admin dashboard for model management
- [ ] Implement tier access controls
- [ ] Add sync monitoring
- [ ] Test admin functionality

### Phase 5: Testing & Deployment (Week 3-4)

- [ ] End-to-end testing
- [ ] Performance testing
- [ ] Security review
- [ ] Production deployment

## Testing Strategy

### Database Testing

```sql
-- Test user tier filtering
SELECT * FROM public.get_user_allowed_models_v2('test-user-uuid');

-- Test sync function with sample data
SELECT * FROM public.sync_openrouter_models('[{"id": "test-model", "name": "Test Model", ...}]'::jsonb);

-- Test admin functions
SELECT * FROM public.update_model_tier_access('test-model', true, false, false, 'active');
```

### API Testing

```bash
# Test authenticated models endpoint
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/models

# Test enhanced mode
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/models?enhanced=true

# Test sync job
curl -H "Authorization: Bearer <cron-secret>" -X POST http://localhost:3000/api/cron/sync-models
```

### Integration Testing

- Test model dropdown population with different user tiers
- Test model selection persistence
- Test sync job error handling
- Test admin model management

## Security Considerations

### Authentication & Authorization

- All model endpoints require authentication
- Admin endpoints require admin tier verification
- Sync job endpoint requires cron secret
- RLS policies protect sensitive data

### Data Validation

- Input validation for all API endpoints
- SQL injection protection via parameterized queries
- Rate limiting on sync endpoints
- Error message sanitization

### Monitoring & Logging

- Sync job execution logging
- API access logging
- Error tracking and alerting
- Performance monitoring

## Rollback Plan

### Emergency Rollback

1. Revert API endpoint to use environment variables
2. Restore `allowed_models` column in profiles table
3. Disable authentication requirement temporarily
4. Switch back to hardcoded model list

### Rollback Scripts

```sql
-- Emergency rollback script
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_models TEXT[] DEFAULT ARRAY['deepseek/deepseek-r1-0528:free'];

-- Restore old model access function
-- (Keep backup of old functions for this purpose)
```

## Monitoring & Maintenance

### Key Metrics to Monitor

- Sync job success rate and duration
- API response times
- Model availability per tier
- User authentication success rate
- Database query performance

### Regular Maintenance Tasks

- Review sync logs weekly
- Monitor model status changes
- Update tier access as needed
- Performance optimization
- Security updates

## Conclusion

This implementation plan provides a comprehensive transition from hardcoded model lists to a dynamic, database-driven model access system. The plan ensures:

1. **Scalability**: Automatic model discovery and management
2. **Flexibility**: Tier-based access control
3. **Reliability**: Robust sync mechanism with error handling
4. **Security**: Authentication and authorization controls
5. **Maintainability**: Admin interface and monitoring tools

The phased approach minimizes risk while delivering incremental value. The backward compatibility measures ensure existing functionality continues to work during the transition.
