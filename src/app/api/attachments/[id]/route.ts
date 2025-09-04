// src/app/api/attachments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../lib/types/auth';
import { createClient } from '../../../../../lib/supabase/server';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../lib/utils/errors';
import { logger } from '../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../lib/utils/headers';

const BUCKET = 'attachments-images';

async function deleteAttachmentHandler(req: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const route = '/api/attachments/[id]';
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  const t0 = Date.now();
  try {
    if (req.method !== 'DELETE') {
      throw new ApiErrorResponse('Method not allowed', ErrorCode.METHOD_NOT_ALLOWED);
    }

    const supabase = await createClient();
    const { user } = authContext;
    if (!user) throw new ApiErrorResponse('Authentication required', ErrorCode.AUTH_REQUIRED);

    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]; // .../attachments/:id

    // Fetch attachment
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

    // Preconditions: message_id IS NULL AND status='ready'
    if (attachment.message_id) {
      throw new ApiErrorResponse('Attachment already linked to a message', ErrorCode.CONFLICT);
    }
    if (attachment.status !== 'ready') {
      // Idempotency: if already deleted, return 204
      return new NextResponse(null, { status: 204 });
    }

    // Delete storage object (best effort)
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .remove([attachment.storage_path]);

    if (storageErr) {
      // Log but continue to mark DB as deleted for idempotency
      logger.warn('attachments.delete.storage_remove_fail', { error: storageErr, requestId, route });
    }

    // Soft-delete DB row
    const { error: dbErr } = await supabase
      .from('chat_attachments')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    if (dbErr) {
      logger.error('attachments.delete.db_fail', { error: dbErr, requestId, route });
      throw new ApiErrorResponse('Failed to delete attachment', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    logger.info('attachments.delete.done', {
      userId: user.id,
      attachmentId: id,
      mime: attachment.mime,
      size_bytes: attachment.size_bytes,
      session_id: attachment.session_id,
      message_id: attachment.message_id,
      draft_id: attachment.draft_id,
      durationMs: Date.now() - t0,
      requestId,
      route,
    });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': requestId } });
  } catch (error) {
    logger.error('attachments.delete.fail', { error, requestId, route });
    return handleError(error, requestId);
  }
}

export const DELETE = withProtectedAuth(
  withTieredRateLimit(deleteAttachmentHandler, { tier: 'tierB' })
);
