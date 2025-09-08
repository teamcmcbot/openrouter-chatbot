// lib/utils/persistAssistantImages.ts
import { logger } from './logger';

interface PersistImageOptions {
  messageId: string;
  sessionId: string;
  dataUrl: string;
}

interface PersistImageResult {
  success: boolean;
  signedUrl?: string;
  attachmentId?: string;
  error?: string;
}

/**
 * Persists an assistant image by uploading it to the /api/chat/images/store endpoint
 * and returns a signed URL for immediate use.
 */
export async function persistAssistantImage({ 
  messageId, 
  sessionId, 
  dataUrl 
}: PersistImageOptions): Promise<PersistImageResult> {
  try {
    // Extract MIME type from data URL
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
    if (!mimeMatch) {
      throw new Error('Invalid data URL format');
    }
    const mimeType = mimeMatch[1];
    
    // Validate supported MIME types
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }

    const response = await fetch('/api/chat/images/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageId,
        sessionId,
        imageData: dataUrl,
        mimeType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      signedUrl: result.signedUrl,
      attachmentId: result.attachmentId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Failed to persist assistant image', { 
      messageId, 
      sessionId, 
      error: errorMessage 
    });
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Persists multiple assistant images and returns an array with results and signed URLs.
 * Failed images retain their original data URLs.
 */
export async function persistAssistantImages(
  images: string[], 
  messageId: string, 
  sessionId: string
): Promise<string[]> {
  if (!images || images.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    images.map(dataUrl => 
      persistAssistantImage({ messageId, sessionId, dataUrl })
    )
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled' && result.value.success && result.value.signedUrl) {
      return result.value.signedUrl;
    } else {
      // Fallback to original data URL on failure
      return images[index];
    }
  });
}
