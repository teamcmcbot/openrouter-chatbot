// src/app/api/user/data/route.ts

import { createClient } from '../../../../../lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { 
  UserDataResponse, 
  UserPreferencesUpdate, 
  UserDataError 
} from '../../../../../lib/types/user-data';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { logger } from '../../../../../lib/utils/logger';
import { validateSystemPrompt } from '../../../../../lib/utils/validation/systemPrompt';

/**
 * GET /api/user/data
 * Retrieves comprehensive user data including analytics, profile, and preferences
 */
async function getUserDataHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse<UserDataResponse | UserDataError>> {
  try {
    const supabase = await createClient();
    const { user } = authContext;

    logger.info('Get user data request', { userId: user!.id });

    // Call the enhanced database function to get complete user profile
    const { data: profileData, error: profileError } = await supabase
      .rpc('get_user_complete_profile', { user_uuid: user!.id });

    if (profileError) {
      logger.error('Database error fetching user profile:', profileError);
      return NextResponse.json(
        { error: 'Internal server error', message: 'Database connection failed' },
        { status: 500 }
      );
    }

    if (!profileData || profileData.error) {
      return NextResponse.json(
        { error: 'User not found', message: 'User profile does not exist' },
        { status: 404 }
      );
    }

    // Transform database response to match API specification
    const response: UserDataResponse = {
      today: {
        messages_sent: profileData.usage_stats?.today?.messages_sent || 0,
        messages_received: profileData.usage_stats?.today?.messages_received || 0,
        total_tokens: profileData.usage_stats?.today?.total_tokens || 0,
        input_tokens: profileData.usage_stats?.today?.input_tokens || 0,
        output_tokens: profileData.usage_stats?.today?.output_tokens || 0,
        models_used: profileData.usage_stats?.today?.models_used || {},
        sessions_created: profileData.usage_stats?.today?.sessions_created || 0,
        generation_ms: profileData.usage_stats?.today?.generation_ms || 0
      },
      allTime: {
        total_messages: profileData.usage_stats?.all_time?.total_messages || 0,
        total_tokens: profileData.usage_stats?.all_time?.total_tokens || 0,
        sessions_created: profileData.usage_stats?.all_time?.sessions_created || 0,
        last_reset: profileData.usage_stats?.all_time?.last_reset || new Date().toISOString()
      },
      profile: {
        email: profileData.email || '',
        full_name: profileData.full_name || '',
        avatar_url: profileData.avatar_url || '',
        subscription_tier: profileData.subscription_tier || 'free',
        account_type: profileData.account_type || 'user',
        credits: profileData.credits || 0
      },
      preferences: {
        ui: profileData.preferences?.ui || {},
        session: profileData.preferences?.session || {},
        model: {
          default_model: profileData.preferences?.model?.default_model || '',
          temperature: profileData.preferences?.model?.temperature || 0.7,
          system_prompt: profileData.preferences?.model?.system_prompt || 'You are a helpful assistant'
        }
      },
      availableModels: profileData.available_models || [],
      timestamps: {
        created_at: profileData.timestamps?.created_at || new Date().toISOString(),
        updated_at: profileData.timestamps?.updated_at || new Date().toISOString(),
        last_active: profileData.timestamps?.last_active || new Date().toISOString()
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Get user data error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Unexpected server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/data
 * Updates user preferences (UI, session, model settings)
 */
async function putUserDataHandler(request: NextRequest, authContext: AuthContext): Promise<NextResponse<UserDataResponse | UserDataError>> {
  try {
    const supabase = await createClient();
    const { user } = authContext;

    logger.info('Update user preferences request', { userId: user!.id });

    // Parse request body
    let preferencesUpdate: UserPreferencesUpdate;
    try {
      preferencesUpdate = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate temperature if provided
    if (preferencesUpdate.model?.temperature !== undefined) {
      const temp = preferencesUpdate.model.temperature;
      if (typeof temp !== 'number' || temp < 0 || temp > 2) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'Temperature must be a number between 0 and 2' },
          { status: 400 }
        );
      }
    }

    // Validate default_model if provided (allow null/empty for "None" selection)
    if (preferencesUpdate.model?.default_model !== undefined) {
      const model = preferencesUpdate.model.default_model;
      // Allow null, empty string, or valid non-empty string
      if (model !== null && model !== '' && (typeof model !== 'string' || model.trim().length === 0)) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'Default model must be a valid string, empty string, or null' },
          { status: 400 }
        );
      }
    }

    // Validate system_prompt if provided with enhanced security validation
    if (preferencesUpdate.model?.system_prompt !== undefined) {
      const systemPrompt = preferencesUpdate.model.system_prompt;
      
      // Only validate if it's a string (allow null to skip validation)
      if (systemPrompt !== null && typeof systemPrompt === 'string') {
        const validation = validateSystemPrompt(systemPrompt);
        
        if (!validation.isValid) {
          return NextResponse.json(
            { 
              error: 'Validation failed', 
              message: validation.error || 'System prompt validation failed'
            },
            { status: 400 }
          );
        }
        
        // Use the trimmed value for storage
        preferencesUpdate.model.system_prompt = validation.trimmedValue;
      } else if (systemPrompt !== null) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'System prompt must be a string or null' },
          { status: 400 }
        );
      }
    }

    // Build update object for profiles table
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    // Update UI preferences
    if (preferencesUpdate.ui) {
      updateData.ui_preferences = preferencesUpdate.ui;
    }

    // Update session preferences
    if (preferencesUpdate.session) {
      updateData.session_preferences = preferencesUpdate.session;
    }

    // Update model preferences
    if (preferencesUpdate.model?.default_model !== undefined) {
      updateData.default_model = preferencesUpdate.model.default_model;
    }
    if (preferencesUpdate.model?.temperature !== undefined) {
      updateData.temperature = preferencesUpdate.model.temperature;
    }
    if (preferencesUpdate.model?.system_prompt !== undefined) {
      updateData.system_prompt = preferencesUpdate.model.system_prompt;
    }

    // Update the user's profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user!.id);

    if (updateError) {
      logger.error('Database error updating preferences:', updateError);
      return NextResponse.json(
        { error: 'Internal server error', message: 'Failed to update preferences' },
        { status: 500 }
      );
    }

    // Get updated profile data
    const { data: updatedProfileData, error: profileError } = await supabase
      .rpc('get_user_complete_profile', { user_uuid: user!.id });

    if (profileError || !updatedProfileData) {
      logger.error('Database error fetching updated profile:', profileError);
      return NextResponse.json(
        { error: 'Internal server error', message: 'Failed to fetch updated profile' },
        { status: 500 }
      );
    }

    // Transform updated data to response format
    const response: UserDataResponse = {
      today: {
        messages_sent: updatedProfileData.usage_stats?.today?.messages_sent || 0,
        messages_received: updatedProfileData.usage_stats?.today?.messages_received || 0,
        total_tokens: updatedProfileData.usage_stats?.today?.total_tokens || 0,
        input_tokens: updatedProfileData.usage_stats?.today?.input_tokens || 0,
        output_tokens: updatedProfileData.usage_stats?.today?.output_tokens || 0,
        models_used: updatedProfileData.usage_stats?.today?.models_used || {},
        sessions_created: updatedProfileData.usage_stats?.today?.sessions_created || 0,
        generation_ms: updatedProfileData.usage_stats?.today?.generation_ms || 0
      },
      allTime: {
        total_messages: updatedProfileData.usage_stats?.all_time?.total_messages || 0,
        total_tokens: updatedProfileData.usage_stats?.all_time?.total_tokens || 0,
        sessions_created: updatedProfileData.usage_stats?.all_time?.sessions_created || 0,
        last_reset: updatedProfileData.usage_stats?.all_time?.last_reset || new Date().toISOString()
      },
      profile: {
        email: updatedProfileData.email || '',
        full_name: updatedProfileData.full_name || '',
        avatar_url: updatedProfileData.avatar_url || '',
        subscription_tier: updatedProfileData.subscription_tier || 'free',
        account_type: updatedProfileData.account_type || 'user',
        credits: updatedProfileData.credits || 0
      },
      preferences: {
        ui: updatedProfileData.preferences?.ui || {},
        session: updatedProfileData.preferences?.session || {},
        model: {
          default_model: updatedProfileData.preferences?.model?.default_model || '',
          temperature: updatedProfileData.preferences?.model?.temperature || 0.7,
          system_prompt: updatedProfileData.preferences?.model?.system_prompt || 'You are a helpful assistant'
        }
      },
      availableModels: updatedProfileData.available_models || [],
      timestamps: {
        created_at: updatedProfileData.timestamps?.created_at || new Date().toISOString(),
        updated_at: updatedProfileData.timestamps?.updated_at || new Date().toISOString(),
        last_active: updatedProfileData.timestamps?.last_active || new Date().toISOString()
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Update user preferences error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Unexpected server error' },
      { status: 500 }
    );
  }
}

// Apply middleware to handlers with TierB rate limiting (medium-cost database operations)
export const GET = withProtectedAuth(
  withTieredRateLimit(getUserDataHandler, { tier: 'tierB' })
);
export const PUT = withProtectedAuth(
  withTieredRateLimit(putUserDataHandler, { tier: 'tierB' })
);
