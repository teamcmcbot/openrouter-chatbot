// src/app/api/uploads/images/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withTierAuth } from '../../../../../lib/middleware/auth';
import { withRedisRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';
import { logger } from '../../../../../lib/utils/logger';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BUCKET = 'attachments-images';

function getExtFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function getTierMaxBytes(tier: 'free' | 'pro' | 'enterprise'): number {
  // Free ≤ 5MB; Pro/Enterprise ≤ 10MB
  const MB = 1024 * 1024;
  return tier === 'free' ? 5 * MB : 10 * MB;
}

async function uploadImageHandler(req: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { user, profile } = authContext;
    if (!user || !profile) {
      throw new ApiErrorResponse('Authentication required', ErrorCode.AUTH_REQUIRED);
    }

    const form = await req.formData();
    const file = form.get('image');
    const draftId = (form.get('draftId') || '').toString();
    const sessionId = form.get('sessionId') ? String(form.get('sessionId')) : null;
    const originalName = form.get('originalName') ? String(form.get('originalName')) : undefined;

    if (!file || !(file instanceof File)) {
      throw new ApiErrorResponse('Field "image" is required (multipart/form-data)', ErrorCode.BAD_REQUEST);
    }
    if (!draftId) {
      throw new ApiErrorResponse('Field "draftId" is required', ErrorCode.BAD_REQUEST);
    }

    const mime = (file as File).type;
    if (!ALLOWED_MIME.has(mime)) {
      throw new ApiErrorResponse('Unsupported image type', ErrorCode.BAD_REQUEST);
    }

    const maxBytes = getTierMaxBytes(profile.subscription_tier);
    const size = (file as File).size;
    if (size > maxBytes) {
      throw new ApiErrorResponse('Image exceeds size limit for your tier', ErrorCode.PAYLOAD_TOO_LARGE);
    }

    // Enforce pending cap ≤ 3 for this user + draft (and optional session)
    const { count: pendingCount, error: pendingErr } = await supabase
      .from('chat_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'ready')
      .is('message_id', null)
      .eq('draft_id', draftId);

    if (pendingErr) {
      logger.error('Error counting pending attachments', pendingErr);
      throw new ApiErrorResponse('Failed to validate pending attachments', ErrorCode.INTERNAL_SERVER_ERROR);
    }
    if ((pendingCount || 0) >= 3) {
      throw new ApiErrorResponse('Attachment limit reached (max 3 per message)', ErrorCode.BAD_REQUEST);
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const ext = getExtFromMime(mime);
    const rand = (typeof globalThis !== 'undefined' && 'crypto' in globalThis && (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID)
      ? (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const path = `${user.id}/${yyyy}/${mm}/${dd}/drafts/${draftId}/${rand}.${ext}`;

    const buffer = Buffer.from(await (file as File).arrayBuffer());

    // Upload to Storage under user session (RLS will assign owner)
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (uploadErr) {
      logger.error('Storage upload failed', uploadErr);
      throw new ApiErrorResponse('Failed to upload image', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    // Insert DB row (do not set message_id yet)
    const { data: inserted, error: insertErr } = await supabase
      .from('chat_attachments')
      .insert({
        user_id: user.id,
        session_id: sessionId,
        message_id: null,
        kind: 'image',
        mime,
        size_bytes: size,
        storage_bucket: BUCKET,
        storage_path: path,
        draft_id: draftId,
        status: 'ready',
        checksum: null,
      })
      .select('*')
      .single();

    if (insertErr || !inserted) {
      logger.error('DB insert chat_attachments failed, attempting to cleanup storage', insertErr);
      // best-effort cleanup
      await supabase.storage.from(BUCKET).remove([path]);
      throw new ApiErrorResponse('Failed to record attachment', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    logger.info('Image uploaded', {
      userId: user.id,
      attachmentId: inserted.id,
      mime,
      size_bytes: size,
      session_id: sessionId,
      draft_id: draftId,
    });

    return NextResponse.json({
      id: inserted.id,
      mime,
      size,
      storagePath: path,
      originalName,
    });
  } catch (error) {
    return handleError(error);
  }
}

// Require Pro tier or higher for image uploads to align with UI gating
export const POST = withTierAuth(
  withRedisRateLimit(uploadImageHandler, {
    // Use default rate limit for uploads - will be determined by user tier inside middleware
  }),
  'pro'
);
