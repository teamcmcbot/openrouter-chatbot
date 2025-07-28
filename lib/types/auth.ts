// lib/types/auth.ts

import { User } from '@supabase/supabase-js';

/**
 * User profile interface extending Supabase user data
 */
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  default_model: string;
  temperature: number;
  system_prompt: string;
  subscription_tier: "free" | "pro" | "enterprise"; // Note: "enterprise" tier includes admin privileges
  credits: number;
  created_at: string;
  updated_at: string;
}

/**
 * Feature flags interface for tier-based access control
 */
export interface FeatureFlags {
  // Chat capabilities
  canModifySystemPrompt: boolean;
  canAccessAdvancedModels: boolean;
  canUseCustomTemperature: boolean;
  canSaveConversations: boolean;
  canSyncConversations: boolean;

  // Rate limiting
  maxRequestsPerHour: number;
  maxTokensPerRequest: number;
  hasRateLimitBypass: boolean;

  // Model access
  allowedModels: string[];
  canUseProModels: boolean;
  canUseEnterpriseModels: boolean;

  // UI features
  showAdvancedSettings: boolean;
  canExportConversations: boolean;
  hasAnalyticsDashboard: boolean;
}

/**
 * Authentication context interface
 */
export interface AuthContext {
  isAuthenticated: boolean;
  user: User | null;
  profile: UserProfile | null;
  accessLevel: "anonymous" | "authenticated";
  features: FeatureFlags;
}

/**
 * JWT validation result interface
 */
export interface JWTValidationResult {
  valid: boolean;
  user: User | null;
  error?: AuthError;
}

/**
 * Authentication error interface
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: string;
  retryable: boolean;
  suggestedAction?: string;
  timestamp: string;
}

/**
 * JWT-specific error codes
 */
export enum AuthErrorCode {
  // Token errors
  TOKEN_MISSING = "TOKEN_MISSING",
  TOKEN_INVALID = "TOKEN_INVALID",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_MALFORMED = "TOKEN_MALFORMED",

  // Authentication errors
  AUTH_REQUIRED = "AUTH_REQUIRED",
  AUTH_FAILED = "AUTH_FAILED",
  USER_NOT_FOUND = "USER_NOT_FOUND",

  // Authorization errors
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  TIER_UPGRADE_REQUIRED = "TIER_UPGRADE_REQUIRED",
  FEATURE_NOT_AVAILABLE = "FEATURE_NOT_AVAILABLE",

  // Rate limiting
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  TOKEN_LIMIT_EXCEEDED = "TOKEN_LIMIT_EXCEEDED",

  // Server errors
  AUTH_SERVICE_UNAVAILABLE = "AUTH_SERVICE_UNAVAILABLE",
  PROFILE_FETCH_FAILED = "PROFILE_FETCH_FAILED",
}

/**
 * Model access validation result
 */
export interface ModelAccessValidation {
  allowed: boolean;
  fallbackModel?: string;
  reason?: string;
}

/**
 * Request limits validation result
 */
export interface RequestLimitsValidation {
  allowed: boolean;
  reason?: string;
  maxTokens?: number;
  currentTokens?: number;
}

/**
 * Authentication middleware options
 */
export interface AuthMiddlewareOptions {
  required: boolean;
  allowAnonymous?: boolean;
  requireProfile?: boolean;
  minimumTier?: UserProfile['subscription_tier'];
}
