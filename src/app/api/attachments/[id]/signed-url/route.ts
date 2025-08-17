// src/app/api/attachments/[id]/signed-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../../lib/middleware/auth';
import { withRateLimit } from '../../../../../../lib/middleware/rateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../../lib/utils/errors';
import { logger } from '../../../../../../lib/utils/logger';

const BUCKET = 'attachments-images';
const URL_TTL_SECONDS = 300; // ~5 minutes

async function getSignedUrlHandler(req: NextRequest, authContext: AuthContext): Promise<NextResponse> {
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

    logger.info('Minted signed URL for attachment', {
      userId: user.id,
      attachmentId: id,
      ttl: URL_TTL_SECONDS,
    });

    return NextResponse.json({ id, signedUrl: signed.signedUrl, ttlSeconds: URL_TTL_SECONDS }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleError(error);
  }
}

export const GET = withProtectedAuth((req: NextRequest, authContext: AuthContext) =>
  withRateLimit(getSignedUrlHandler, { customLimit: 7200 /* 120/min */ })(req, authContext)
);
