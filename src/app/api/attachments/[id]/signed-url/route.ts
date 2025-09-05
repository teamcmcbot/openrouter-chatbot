// src/app/api/attachments/[id]/signed-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../../lib/utils/errors';
import { logger } from '../../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../../lib/utils/headers';

const BUCKET = 'attachments-images';
const URL_TTL_SECONDS = 300; // ~5 minutes

async function getSignedUrlHandler(req: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const { user } = authContext;
    if (!user) throw new ApiErrorResponse('Authentication required', ErrorCode.AUTH_REQUIRED);

    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 2]; // .../attachments/:id/signed-url

    // Fetch attachment and verify ownership + status
    const { data: attachment, error } = await supabase
      .from('chat_attachments')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !attachment) {
      // 404 to avoid existence leak
      throw new ApiErrorResponse('Attachment not found', ErrorCode.NOT_FOUND);
    }
    if (attachment.status !== 'ready') {
      throw new ApiErrorResponse('Attachment not available', ErrorCode.NOT_FOUND);
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, URL_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      logger.error('Failed to create signed URL', signErr);
      throw new ApiErrorResponse('Failed to create signed URL', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const durationMs = Date.now() - t0;
  logger.info('Minted signed URL for attachment', {
      userId: user.id,
      attachmentId: id,
      ttl: URL_TTL_SECONDS,
      mime: attachment.mime,
      size_bytes: attachment.size_bytes,
      session_id: attachment.session_id,
      message_id: attachment.message_id,
      draft_id: attachment.draft_id,
      requestId,
      durationMs,
    });

    return NextResponse.json({ id, signedUrl: signed.signedUrl, ttlSeconds: URL_TTL_SECONDS }, {
      headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId },
    });
  } catch (error) {
  return handleError(error, requestId, '/api/attachments/[id]/signed-url');
  }
}

export const GET = withAuth(
  withTieredRateLimit(getSignedUrlHandler, { tier: 'tierB' }),
  { required: true, requireProfile: true, enforceBan: false }
);
