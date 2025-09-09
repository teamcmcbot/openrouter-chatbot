// src/app/api/chat/images/store/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withProtectedAuth } from '../../../../../../lib/middleware/auth';
import { withTieredRateLimit } from '../../../../../../lib/middleware/redisRateLimitMiddleware';
import { AuthContext } from '../../../../../../lib/types/auth';
import { createClient } from '../../../../../../lib/supabase/server';
import { handleError, ApiErrorResponse, ErrorCode } from '../../../../../../lib/utils/errors';
import { logger } from '../../../../../../lib/utils/logger';
import { deriveRequestIdFromHeaders } from '../../../../../../lib/utils/headers';
import { extractMetadataWithDimensions } from '../../../../../../lib/utils/imageMetadata';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BUCKET = 'attachments-images';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit for assistant images

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

async function storeImageHandler(req: NextRequest, authContext: AuthContext): Promise<NextResponse> {
  const route = '/api/chat/images/store';
  const requestId = deriveRequestIdFromHeaders((req as unknown as { headers?: unknown })?.headers);
  
  try {
    const supabase = await createClient();
    const { user } = authContext;
    if (!user) {
      throw new ApiErrorResponse('Authentication required', ErrorCode.AUTH_REQUIRED);
    }

    const body = await req.json();
    const { 
      messageId, 
      sessionId, 
      imageData, 
      mimeType
    } = body;

    // Validate required fields
    if (!messageId || typeof messageId !== 'string') {
      throw new ApiErrorResponse('Field "messageId" is required', ErrorCode.BAD_REQUEST);
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new ApiErrorResponse('Field "sessionId" is required', ErrorCode.BAD_REQUEST);
    }
    if (!imageData || typeof imageData !== 'string') {
      throw new ApiErrorResponse('Field "imageData" is required (base64 or data URL)', ErrorCode.BAD_REQUEST);
    }
    if (!mimeType || typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
      throw new ApiErrorResponse('Invalid or unsupported MIME type', ErrorCode.BAD_REQUEST);
    }

    // Verify the message exists and belongs to the user
    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .select('id, role, session_id')
      .eq('id', messageId)
      .eq('session_id', sessionId)
      .single();

    if (messageError || !message) {
      throw new ApiErrorResponse('Message not found or access denied', ErrorCode.NOT_FOUND);
    }

    if (message.role !== 'assistant') {
      throw new ApiErrorResponse('Can only store images for assistant messages', ErrorCode.BAD_REQUEST);
    }

    // Verify the session belongs to the user and get profile for metadata
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, user_id, profiles!inner(subscription_tier)')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      throw new ApiErrorResponse('Session not found or access denied', ErrorCode.NOT_FOUND);
    }

    // Process image data (handle both data URLs and plain base64)
    let base64Data: string;
    if (imageData.startsWith('data:')) {
      const match = imageData.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) {
        throw new ApiErrorResponse('Invalid data URL format', ErrorCode.BAD_REQUEST);
      }
      base64Data = match[1];
    } else {
      base64Data = imageData;
    }

    // Convert base64 to buffer
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      throw new ApiErrorResponse('Invalid base64 data', ErrorCode.BAD_REQUEST);
    }

    // Validate size
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new ApiErrorResponse('Image exceeds size limit (10MB)', ErrorCode.PAYLOAD_TOO_LARGE);
    }

    // Extract metadata and checksum for LLM-generated image
    let checksum: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let metadata: Record<string, unknown> = {};
    
    try {
      const metadataResult = extractMetadataWithDimensions(buffer, mimeType, {
        uploadSource: 'llm_generated',
        userTier: ((session as unknown as { profiles?: { subscription_tier: string } }).profiles?.subscription_tier) || 'free',
        sessionId,
        maxSize: MAX_SIZE_BYTES,
      });
      
      checksum = metadataResult.checksum;
      width = metadataResult.width;
      height = metadataResult.height;
      metadata = metadataResult.metadata as unknown as Record<string, unknown>;
      
      logger.info('LLM image metadata extracted', {
        requestId,
        messageId,
        hasChecksum: !!checksum,
        hasDimensions: !!(width && height),
        bytes: buffer.length,
      });
    } catch (metadataError) {
      // Non-blocking: log warning but continue with storage
      logger.warn('Failed to extract LLM image metadata', {
        error: metadataError,
        requestId,
        messageId,
        mimeType,
        size: buffer.length,
      });
    }

    // Generate storage path
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const ext = getExtFromMime(mimeType);
    const rand = typeof globalThis !== 'undefined' && 'crypto' in globalThis 
      ? (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const path = `${user.id}/${yyyy}/${mm}/${dd}/assistant/${sessionId}/${messageId}/${rand}.${ext}`;

    // Upload to Storage
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (uploadErr) {
      logger.error('Storage upload failed', { error: uploadErr, requestId, messageId });
      throw new ApiErrorResponse('Failed to upload image', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    // Create attachment record with metadata
    const { data: attachment, error: attachmentErr } = await supabase
      .from('chat_attachments')
      .insert({
        user_id: user.id,
        session_id: sessionId,
        message_id: messageId,
        kind: 'image',
        mime: mimeType,
        size_bytes: buffer.length,
        storage_bucket: BUCKET,
        storage_path: path,
        draft_id: null, // Assistant images are not drafts
        width,
        height,
        checksum,
        metadata,
        status: 'ready',
      })
      .select('id, storage_path')
      .single();

    if (attachmentErr) {
      // Clean up uploaded file on DB failure
      try {
        await supabase.storage.from(BUCKET).remove([path]);
      } catch {}
      
      logger.error('Failed to create attachment record', { error: attachmentErr, requestId, messageId });
      throw new ApiErrorResponse('Failed to create attachment record', ErrorCode.INTERNAL_SERVER_ERROR);
    }

    // Generate signed URL for immediate use
    const { data: signedUrl, error: signedUrlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (signedUrlError) {
      logger.warn('Failed to create signed URL for stored image', { error: signedUrlError, requestId, attachmentId: attachment.id });
    }

    logger.info('Assistant image stored successfully', {
      requestId,
      messageId,
      sessionId,
      attachmentId: attachment.id,
      sizeBytes: buffer.length,
      mimeType,
    });

    return NextResponse.json({
      success: true,
      attachmentId: attachment.id,
      signedUrl: signedUrl?.signedUrl || null,
      storagePath: attachment.storage_path,
    });

  } catch (error) {
    logger.error('Error storing assistant image:', { error, requestId });
    return handleError(error, requestId, route);
  }
}

// Apply Protected authentication with Tier B rate limiting (storage operations)
export const POST = withProtectedAuth(
  withTieredRateLimit(storeImageHandler, { tier: "tierB" })
);
