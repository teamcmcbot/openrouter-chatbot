// lib/middleware/auth.ts

import { NextRequest, NextResponse } from 'next/server';
import { 
  AuthContext, 
  AuthMiddlewareOptions, 
  AuthErrorCode 
} from '../types/auth';
import { 
  extractAuthContext, 
  hasPermission 
} from '../utils/auth';
import { getAuthSnapshot, setAuthSnapshot } from '../utils/authSnapshot';
import { 
  createAuthError, 
  handleAuthError 
} from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Authentication middleware for API routes
 */
export function withAuth<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>,
  options: AuthMiddlewareOptions = { required: true }
) {
  return async (req: T): Promise<NextResponse> => {
    try {
      logger.debug('Auth middleware processing request:', req.url);

      // Extract authentication context from request
      const authContext = await extractAuthContext(req);

      // Check if authentication is required
      if (options.required && !authContext.isAuthenticated) {
        logger.warn('Authentication required but user not authenticated');
        
        const authError = createAuthError(
          AuthErrorCode.AUTH_REQUIRED,
          'Authentication is required for this operation',
          undefined,
          false,
          'Please sign in to continue'
        );
        
        return handleAuthError(authError);
      }

      // Check if profile is required
      if (options.requireProfile && authContext.isAuthenticated && !authContext.profile) {
        logger.warn('Profile required but not found for authenticated user');
        
        const authError = createAuthError(
          AuthErrorCode.PROFILE_FETCH_FAILED,
          'User profile is required for this operation',
          undefined,
          true,
          'Please try refreshing the page or contact support'
        );
        
        return handleAuthError(authError);
      }

  // Ban enforcement (after profile fetch). If authenticated with profile, block banned users.
  // Allow per-route override via options.enforceBan (default false)
  const enforceBan = options.enforceBan !== undefined ? options.enforceBan : false;
  if (enforceBan && authContext.isAuthenticated && authContext.profile) {
        const userId = authContext.user!.id;
        const profile = authContext.profile;

        // Try Redis auth snapshot
        try {
          const snap = await getAuthSnapshot(userId);
          const nowMs = Date.now();
          if (snap) {
            const banned = snap.isBanned || (!!snap.bannedUntil && new Date(snap.bannedUntil).getTime() > nowMs);
            if (banned) {
              const authError = createAuthError(
                AuthErrorCode.ACCOUNT_BANNED,
                undefined,
                undefined,
                false,
                'Contact support to appeal the ban'
              );
              return handleAuthError(authError);
            }
          } else {
            // Cache miss: set snapshot from profile minimal fields
            const tier = (profile.subscription_tier === 'pro' || profile.subscription_tier === 'enterprise') ? profile.subscription_tier : 'free';
            const acct: 'user' | 'admin' | null = profile.account_type === 'admin' ? 'admin' : (profile.account_type === 'user' ? 'user' : null);
            await setAuthSnapshot(userId, {
              v: 1,
              isBanned: !!profile.is_banned,
              bannedUntil: profile.banned_until || null,
              tier,
              accountType: acct,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch {}

        // Fallback check from profile itself (authoritative)
        const isTempBanned = !!profile.banned_until && new Date(profile.banned_until).getTime() > Date.now();
        if (profile.is_banned || isTempBanned) {
          const authError = createAuthError(
            AuthErrorCode.ACCOUNT_BANNED,
            undefined,
            undefined,
            false,
            'Contact support to appeal the ban'
          );
          return handleAuthError(authError);
        }
      }

      // Check minimum tier requirement
      if (options.minimumTier && !hasPermission(authContext, options.minimumTier)) {
        logger.warn(`Insufficient tier: required ${options.minimumTier}, user has ${authContext.profile?.subscription_tier || 'none'}`);
        
        const authError = createAuthError(
          AuthErrorCode.TIER_UPGRADE_REQUIRED,
          `${options.minimumTier} subscription tier required for this operation`,
          undefined,
          false,
          `Please upgrade to ${options.minimumTier} tier to access this feature`
        );
        
        return handleAuthError(authError);
      }

      // Log successful authentication
      if (authContext.isAuthenticated) {
        logger.debug('Request authenticated successfully:', {
          userId: authContext.user?.id,
          tier: authContext.profile?.subscription_tier,
          accessLevel: authContext.accessLevel
        });
      } else {
        logger.debug('Request proceeding with anonymous access');
      }

      // Call the actual handler with auth context
      return await handler(req, authContext);

    } catch (error) {
      logger.error('Auth middleware error:', error);
      
      const authError = createAuthError(
        AuthErrorCode.AUTH_SERVICE_UNAVAILABLE,
        'Authentication service is temporarily unavailable',
        error instanceof Error ? error.message : 'Unknown error',
        true,
        'Please try again in a few moments'
      );
      
      return handleAuthError(authError);
    }
  };
}

/**
 * Middleware for protected endpoints (requires authentication)
 */
export function withProtectedAuth<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>,
  options?: { enforceBan?: boolean }
) {
  // Default: enforce bans for protected routes; allow per-route override
  const enforceBan = options?.enforceBan ?? true;
  return withAuth(handler, { 
    required: true, 
    requireProfile: true,
    enforceBan,
  });
}

/**
 * Middleware for enhanced endpoints (optional authentication with feature flagging)
 */
export function withEnhancedAuth<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>
) {
  return withAuth(handler, { 
    required: false, 
    allowAnonymous: true,
    enforceBan: false, // Enhanced endpoints typically read-only; allow access when banned unless overridden
  });
}

/**
 * Middleware for tier-specific endpoints
 */
export function withTierAuth<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>,
  minimumTier: 'free' | 'pro' | 'enterprise'
) {
  return withAuth(handler, { 
    required: true, 
    requireProfile: true,
  minimumTier,
  enforceBan: true,
  });
}

/**
 * Middleware for admin-only endpoints (requires account_type = 'admin')
 */
export function withAdminAuth<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>
) {
  return withAuth(async (req: T, context: AuthContext) => {
    if (!context.profile || context.profile.account_type !== 'admin') {
      logger.warn('Admin access denied', {
        userId: context.user?.id,
      });

      return NextResponse.json(
        {
          error: 'Insufficient privileges',
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
        { status: 403 }
      );
    }

    return handler(req, context);
  }, { required: true, requireProfile: true, enforceBan: true });
}

/**
 * Utility to check conversation ownership
 */
export function validateConversationOwnership(
  conversations: Array<{ userId: string; id: string }>,
  authContext: AuthContext
): { valid: boolean; invalidConversations: string[] } {
  if (!authContext.isAuthenticated || !authContext.user) {
    return {
      valid: false,
      invalidConversations: conversations.map(c => c.id)
    };
  }

  const invalidConversations = conversations
    .filter(conv => conv.userId !== authContext.user!.id)
    .map(conv => conv.id);

  return {
    valid: invalidConversations.length === 0,
    invalidConversations
  };
}

/**
 * Middleware wrapper that adds conversation ownership validation
 */
export function withConversationOwnership<T extends NextRequest>(
  handler: (req: T, context: AuthContext) => Promise<NextResponse>
) {
  return withProtectedAuth(async (req: T, context: AuthContext) => {
    try {
      // Only validate conversation ownership for POST requests (sync operations)
      // GET requests (fetch operations) don't need this validation
      if (req.method === 'POST') {
        // Parse request body to check for conversations
        const body = await req.json();
        
        if (body.conversations && Array.isArray(body.conversations)) {
          const validation = validateConversationOwnership(body.conversations, context);
          
          if (!validation.valid) {
            logger.warn('Conversation ownership validation failed:', {
              userId: context.user?.id,
              invalidConversations: validation.invalidConversations
            });
            
            const authError = createAuthError(
              AuthErrorCode.INSUFFICIENT_PERMISSIONS,
              'Unauthorized conversation access',
              `Invalid conversations: ${validation.invalidConversations.join(', ')}`,
              false,
              'You can only access your own conversations'
            );
            
            return handleAuthError(authError);
          }
        }

        // Create new request with parsed body for POST requests
        const newReq = new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body: JSON.stringify(body)
        }) as T;

        return await handler(newReq, context);
      } else {
        // For GET requests, just pass through without body parsing
        return await handler(req, context);
      }
      
    } catch (error) {
      logger.error('Conversation ownership validation error:', error);
      
      const authError = createAuthError(
        AuthErrorCode.INSUFFICIENT_PERMISSIONS,
        'Failed to validate conversation ownership',
        error instanceof Error ? error.message : 'Unknown error',
        false,
        'Please ensure you are accessing your own conversations'
      );
      
      return handleAuthError(authError);
    }
  });
}

/**
 * Rate limiting headers helper
 */
export function addRateLimitHeaders(
  response: NextResponse,
  authContext: AuthContext,
  remaining: number = 0
): NextResponse {
  const rateLimitInfo = {
    limit: authContext.features.maxRequestsPerHour,
    remaining,
    reset: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
  };

  response.headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
  response.headers.set('X-RateLimit-Reset', rateLimitInfo.reset);

  if (remaining === 0) {
    response.headers.set('Retry-After', '3600'); // 1 hour
  }

  return response;
}