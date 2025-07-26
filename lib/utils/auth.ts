// lib/utils/auth.ts

import { NextRequest } from 'next/server';
import { User } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';
import {
  AuthContext,
  UserProfile,
  JWTValidationResult,
  AuthErrorCode,
  FeatureFlags
} from '../types/auth';
import { createAuthError } from './errors';
import { logger } from './logger';

/**
 * Validate JWT token using Supabase
 */
export async function validateJWT(token: string): Promise<JWTValidationResult> {
  try {
    if (!token) {
      return {
        valid: false,
        user: null,
        error: createAuthError(
          AuthErrorCode.TOKEN_MISSING,
          'Authentication token is missing',
          undefined,
          false,
          'Please sign in to continue'
        ),
      };
    }

    const supabase = await createClient();
    
    // Validate the token by getting the user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      logger.warn('JWT validation failed:', error.message);
      
      // Determine specific error type
      let authErrorCode = AuthErrorCode.TOKEN_INVALID;
      let retryable = false;
      let suggestedAction = 'Please sign in again';

      if (error.message.includes('expired')) {
        authErrorCode = AuthErrorCode.TOKEN_EXPIRED;
        retryable = true;
        suggestedAction = 'Please refresh your session or sign in again';
      } else if (error.message.includes('malformed') || error.message.includes('invalid')) {
        authErrorCode = AuthErrorCode.TOKEN_MALFORMED;
      }

      return {
        valid: false,
        user: null,
        error: createAuthError(
          authErrorCode,
          error.message,
          undefined,
          retryable,
          suggestedAction
        ),
      };
    }

    if (!user) {
      return {
        valid: false,
        user: null,
        error: createAuthError(
          AuthErrorCode.USER_NOT_FOUND,
          'User not found',
          undefined,
          false,
          'Please sign in again'
        ),
      };
    }

    logger.debug('JWT validation successful for user:', user.id);
    return {
      valid: true,
      user,
      error: undefined,
    };

  } catch (error) {
    logger.error('JWT validation error:', error);
    return {
      valid: false,
      user: null,
      error: createAuthError(
        AuthErrorCode.AUTH_SERVICE_UNAVAILABLE,
        'Authentication service is temporarily unavailable',
        error instanceof Error ? error.message : 'Unknown error',
        true,
        'Please try again in a few moments'
      ),
    };
  }
}

/**
 * Extract authentication context from request
 */
export async function extractAuthContext(request: NextRequest): Promise<AuthContext> {
  try {
    // First try to get user from Supabase (handles cookies automatically)
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      // If no user from cookies, try Authorization header as fallback
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        logger.debug('No authentication found (cookies or header), creating anonymous context');
        return createAnonymousContext();
      }

      // Validate the JWT token from header
      const validation = await validateJWT(token);
      
      if (!validation.valid || !validation.user) {
        logger.warn('Invalid token from header, creating anonymous context:', validation.error?.message);
        return createAnonymousContext();
      }

      // Fetch user profile
      const profile = await fetchUserProfile(validation.user.id);
      
      return createAuthenticatedContext(validation.user, profile);
    }

    // User found via cookies, fetch profile
    logger.debug('User authenticated via cookies:', user.id);
    const profile = await fetchUserProfile(user.id);
    
    return createAuthenticatedContext(user, profile);

  } catch (error) {
    logger.error('Error extracting auth context:', error);
    return createAnonymousContext();
  }
}

/**
 * Fetch user profile from database
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const supabase = await createClient();
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Profile doesn't exist, create default profile
        logger.info('Creating default profile for user:', userId);
        return await createDefaultUserProfile(userId);
      }
      
      logger.error('Error fetching user profile:', error);
      return null;
    }

    return profile as UserProfile;

  } catch (error) {
    logger.error('Error in fetchUserProfile:', error);
    return null;
  }
}

/**
 * Create default user profile for new users
 */
async function createDefaultUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const supabase = await createClient();
    
    // Get user email from auth
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      logger.error('Cannot create profile - user not found:', userError);
      return null;
    }

    const defaultProfile: Omit<UserProfile, 'created_at' | 'updated_at'> = {
      id: userId,
      email: user.email || '',
      full_name: user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
      default_model: 'deepseek/deepseek-r1-0528:free',
      temperature: 0.7,
      system_prompt: 'You are a helpful AI assistant.',
      subscription_tier: 'free',
      credits: 0,
    };

    const { data: profile, error } = await supabase
      .from('profiles')
      .insert(defaultProfile)
      .select()
      .single();

    if (error) {
      logger.error('Error creating default profile:', error);
      return null;
    }

    return profile as UserProfile;

  } catch (error) {
    logger.error('Error in createDefaultUserProfile:', error);
    return null;
  }
}

/**
 * Create anonymous authentication context
 */
export function createAnonymousContext(): AuthContext {
  return {
    isAuthenticated: false,
    user: null,
    profile: null,
    accessLevel: 'anonymous',
    features: createFeatureFlags(false),
  };
}

/**
 * Create authenticated authentication context
 */
export function createAuthenticatedContext(
  user: User,
  profile: UserProfile | null
): AuthContext {
  return {
    isAuthenticated: true,
    user,
    profile,
    accessLevel: 'authenticated',
    features: createFeatureFlags(true, profile),
  };
}

/**
 * Create feature flags based on authentication status and user profile
 */
export function createFeatureFlags(
  isAuthenticated: boolean,
  profile?: UserProfile | null
): FeatureFlags {
  if (!isAuthenticated) {
    // Anonymous user feature flags
    return {
      canModifySystemPrompt: false,
      canAccessAdvancedModels: false,
      canUseCustomTemperature: false,
      canSaveConversations: false,
      canSyncConversations: false,
      maxRequestsPerHour: 10,
      maxTokensPerRequest: 1000,
      hasRateLimitBypass: false,
      allowedModels: [
        'deepseek/deepseek-r1-0528:free',
        'google/gemini-2.5-flash-lite',
      ],
      canUseProModels: false,
      canUseEnterpriseModels: false,
      showAdvancedSettings: false,
      canExportConversations: false,
      hasAnalyticsDashboard: false,
    };
  }

  const tier = profile?.subscription_tier || 'free';

  // Base authenticated user features
  const baseFeatures: FeatureFlags = {
    canModifySystemPrompt: true,
    canAccessAdvancedModels: false,
    canUseCustomTemperature: true,
    canSaveConversations: true,
    canSyncConversations: true,
    maxRequestsPerHour: 100,
    maxTokensPerRequest: 2000,
    hasRateLimitBypass: false,
    allowedModels: [
      'deepseek/deepseek-r1-0528:free',
      'google/gemini-2.5-flash-lite',
      'meta-llama/llama-3.2-3b-instruct:free',
    ],
    canUseProModels: false,
    canUseEnterpriseModels: false,
    showAdvancedSettings: true,
    canExportConversations: true,
    hasAnalyticsDashboard: false,
  };

  // Tier-specific enhancements
  switch (tier) {
    case 'pro':
      return {
        ...baseFeatures,
        canAccessAdvancedModels: true,
        maxRequestsPerHour: 500,
        maxTokensPerRequest: 4000,
        allowedModels: [
          ...baseFeatures.allowedModels,
          'anthropic/claude-3-haiku',
          'openai/gpt-4o-mini',
          'google/gemini-pro',
        ],
        canUseProModels: true,
        hasAnalyticsDashboard: true,
      };

    case 'enterprise':
      return {
        ...baseFeatures,
        canAccessAdvancedModels: true,
        maxRequestsPerHour: 2000,
        maxTokensPerRequest: 8000,
        hasRateLimitBypass: true,
        allowedModels: ['*'], // All models
        canUseProModels: true,
        canUseEnterpriseModels: true,
        hasAnalyticsDashboard: true,
      };

    default: // 'free'
      return baseFeatures;
  }
}

/**
 * Check if user has required permissions for an operation
 */
export function hasPermission(
  context: AuthContext,
  requiredTier?: UserProfile['subscription_tier']
): boolean {
  if (!context.isAuthenticated) {
    return false;
  }

  if (!requiredTier) {
    return true;
  }

  const userTier = context.profile?.subscription_tier || 'free';
  const tierHierarchy = { free: 0, pro: 1, enterprise: 2 };
  
  return tierHierarchy[userTier] >= tierHierarchy[requiredTier];
}