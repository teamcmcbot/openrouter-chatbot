// lib/utils/imageMetadata.ts
import { createHash } from 'crypto';
import sizeOf from 'image-size';

/**
 * Image metadata interface matching the chat_attachments table structure
 */
export interface ImageMetadata {
  // File information
  original_name?: string;
  upload_source: 'user_input' | 'llm_generated';
  processing_timestamp: string;
  file_extension: string;
  bytes_processed: number;

  // Image-specific (when available)
  dimensions?: { width: number; height: number };
  aspect_ratio?: string;
  megapixels?: string;

  // Processing context
  user_tier: string;
  upload_session?: string;
  draft_context?: string;

  // Validation flags
  validation: {
    mime_verified: boolean;
    size_within_limits: boolean;
    dimensions_extracted: boolean;
    checksum_calculated: boolean;
  };
}

/**
 * Calculate SHA-256 checksum for image buffer
 */
export function calculateChecksum(buffer: Buffer): string {
  try {
    return createHash('sha256').update(buffer).digest('hex');
  } catch (error) {
    throw new Error(`Failed to calculate checksum: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get file extension from MIME type
 */
export function getFileExtensionFromMime(mime: string): string {
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

/**
 * Extract basic metadata for Phase 1 (no dimensions yet)
 */
export function extractBasicMetadata(
  buffer: Buffer,
  mime: string,
  options: {
    originalName?: string;
    uploadSource: 'user_input' | 'llm_generated';
    userTier: string;
    sessionId?: string;
    draftId?: string;
    maxSize: number;
  }
): {
  checksum: string;
  metadata: ImageMetadata;
} {
  const checksum = calculateChecksum(buffer);
  
  const metadata: ImageMetadata = {
    // File information
    original_name: options.originalName,
    upload_source: options.uploadSource,
    processing_timestamp: new Date().toISOString(),
    file_extension: getFileExtensionFromMime(mime),
    bytes_processed: buffer.length,

    // Processing context
    user_tier: options.userTier,
    upload_session: options.sessionId,
    draft_context: options.draftId,

    // Validation flags
    validation: {
      mime_verified: ['image/png', 'image/jpeg', 'image/webp'].includes(mime),
      size_within_limits: buffer.length <= options.maxSize,
      dimensions_extracted: false, // Phase 1: not yet implemented
      checksum_calculated: true,
    },
  };

  return { checksum, metadata };
}

/**
 * Validate image dimensions are reasonable (prevent malicious oversized dimensions)
 */
export function validateImageDimensions(width: number, height: number): boolean {
  // Reasonable limits: 1x1 to 8192x8192 pixels
  const MIN_DIMENSION = 1;
  const MAX_DIMENSION = 8192;
  
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= MIN_DIMENSION &&
    height >= MIN_DIMENSION &&
    width <= MAX_DIMENSION &&
    height <= MAX_DIMENSION
  );
}

/**
 * Calculate additional image metrics when dimensions are available
 */
export function calculateImageMetrics(width: number, height: number): {
  aspect_ratio: string;
  megapixels: string;
} {
  const aspectRatio = width / height;
  const megapixels = (width * height) / 1_000_000;
  
  return {
    aspect_ratio: aspectRatio.toFixed(3),
    megapixels: megapixels.toFixed(1),
  };
}

/**
 * Extract image dimensions using image-size library
 */
export function extractImageDimensions(buffer: Buffer): {
  width: number | null;
  height: number | null;
} {
  try {
    const dimensions = sizeOf(buffer);
    
    if (dimensions.width && dimensions.height) {
      // Validate dimensions are reasonable
      if (validateImageDimensions(dimensions.width, dimensions.height)) {
        return {
          width: dimensions.width,
          height: dimensions.height,
        };
      }
    }
    
    return { width: null, height: null };
  } catch {
    // Image-size failed to parse - return null dimensions
    return { width: null, height: null };
  }
}

/**
 * Extract metadata with dimensions (Phase 2 - now with image-size integration)
 */
export function extractMetadataWithDimensions(
  buffer: Buffer,
  mime: string,
  options: {
    originalName?: string;
    uploadSource: 'user_input' | 'llm_generated';
    userTier: string;
    sessionId?: string;
    draftId?: string;
    maxSize: number;
  }
): {
  checksum: string;
  width: number | null;
  height: number | null;
  metadata: ImageMetadata;
} {
  // Calculate checksum first
  const checksum = calculateChecksum(buffer);
  
  // Extract dimensions using image-size
  const { width, height } = extractImageDimensions(buffer);
  
  // Build enhanced metadata with dimensions
  const metadata: ImageMetadata = {
    // File information
    original_name: options.originalName,
    upload_source: options.uploadSource,
    processing_timestamp: new Date().toISOString(),
    file_extension: getFileExtensionFromMime(mime),
    bytes_processed: buffer.length,

    // Image-specific metrics (when dimensions available)
    ...(width && height && {
      dimensions: { width, height },
      ...calculateImageMetrics(width, height),
    }),

    // Processing context
    user_tier: options.userTier,
    upload_session: options.sessionId,
    draft_context: options.draftId,

    // Validation flags
    validation: {
      mime_verified: ['image/png', 'image/jpeg', 'image/webp'].includes(mime),
      size_within_limits: buffer.length <= options.maxSize,
      dimensions_extracted: !!(width && height),
      checksum_calculated: true,
    },
  };

  return {
    checksum,
    width,
    height,
    metadata,
  };
}
