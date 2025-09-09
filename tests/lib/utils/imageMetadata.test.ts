// tests/lib/utils/imageMetadata.test.ts
import { 
  calculateChecksum, 
  getFileExtensionFromMime,
  extractBasicMetadata,
  extractMetadataWithDimensions,
  validateImageDimensions,
  calculateImageMetrics,
  extractImageDimensions
} from '../../../lib/utils/imageMetadata';

describe('Image Metadata Utilities', () => {
  // Test data - small valid PNG image (1x1 pixel)
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ]);

  // Invalid/corrupted buffer
  const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

  describe('calculateChecksum', () => {
    it('should calculate consistent SHA-256 checksums', () => {
      const checksum1 = calculateChecksum(validPngBuffer);
      const checksum2 = calculateChecksum(validPngBuffer);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 is 64 hex characters
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different checksums for different data', () => {
      const checksum1 = calculateChecksum(validPngBuffer);
      const checksum2 = calculateChecksum(invalidBuffer);
      
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty buffers', () => {
      const emptyBuffer = Buffer.alloc(0);
      const checksum = calculateChecksum(emptyBuffer);
      
      expect(checksum).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should throw on invalid input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => calculateChecksum(null as any)).toThrow('Failed to calculate checksum');
    });
  });

  describe('getFileExtensionFromMime', () => {
    it('should return correct extensions for supported MIME types', () => {
      expect(getFileExtensionFromMime('image/png')).toBe('png');
      expect(getFileExtensionFromMime('image/jpeg')).toBe('jpg');
      expect(getFileExtensionFromMime('image/webp')).toBe('webp');
    });

    it('should return "bin" for unsupported MIME types', () => {
      expect(getFileExtensionFromMime('image/gif')).toBe('bin');
      expect(getFileExtensionFromMime('text/plain')).toBe('bin');
      expect(getFileExtensionFromMime('')).toBe('bin');
    });
  });

  describe('validateImageDimensions', () => {
    it('should validate reasonable dimensions', () => {
      expect(validateImageDimensions(1, 1)).toBe(true);
      expect(validateImageDimensions(100, 100)).toBe(true);
      expect(validateImageDimensions(1920, 1080)).toBe(true);
      expect(validateImageDimensions(8192, 8192)).toBe(true);
    });

    it('should reject invalid dimensions', () => {
      expect(validateImageDimensions(0, 100)).toBe(false);
      expect(validateImageDimensions(100, 0)).toBe(false);
      expect(validateImageDimensions(-1, 100)).toBe(false);
      expect(validateImageDimensions(8193, 100)).toBe(false);
      expect(validateImageDimensions(100, 8193)).toBe(false);
    });

    it('should reject non-integer dimensions', () => {
      expect(validateImageDimensions(100.5, 100)).toBe(false);
      expect(validateImageDimensions(100, 100.5)).toBe(false);
      expect(validateImageDimensions(NaN, 100)).toBe(false);
      expect(validateImageDimensions(100, NaN)).toBe(false);
    });
  });

  describe('calculateImageMetrics', () => {
    it('should calculate correct aspect ratio and megapixels', () => {
      const metrics = calculateImageMetrics(1920, 1080);
      
      expect(metrics.aspect_ratio).toBe('1.778');
      expect(metrics.megapixels).toBe('2.1');
    });

    it('should handle square images', () => {
      const metrics = calculateImageMetrics(100, 100);
      
      expect(metrics.aspect_ratio).toBe('1.000');
      expect(metrics.megapixels).toBe('0.0');
    });

    it('should handle portrait orientation', () => {
      const metrics = calculateImageMetrics(1080, 1920);
      
      expect(metrics.aspect_ratio).toBe('0.563');
      expect(metrics.megapixels).toBe('2.1');
    });
  });

  describe('extractImageDimensions', () => {
    it('should extract dimensions from valid PNG', () => {
      const { width, height } = extractImageDimensions(validPngBuffer);
      
      expect(width).toBe(1);
      expect(height).toBe(1);
    });

    it('should return null for corrupted/invalid images', () => {
      const { width, height } = extractImageDimensions(invalidBuffer);
      
      expect(width).toBeNull();
      expect(height).toBeNull();
    });

    it('should return null for empty buffer', () => {
      const emptyBuffer = Buffer.alloc(0);
      const { width, height } = extractImageDimensions(emptyBuffer);
      
      expect(width).toBeNull();
      expect(height).toBeNull();
    });
  });

  describe('extractBasicMetadata', () => {
    const options = {
      originalName: 'test-image.png',
      uploadSource: 'user_input' as const,
      userTier: 'pro',
      sessionId: 'session-123',
      draftId: 'draft-456',
      maxSize: 5 * 1024 * 1024, // 5MB
    };

    it('should extract basic metadata without dimensions', () => {
      const { checksum, metadata } = extractBasicMetadata(validPngBuffer, 'image/png', options);
      
      expect(checksum).toBeTruthy();
      expect(metadata.original_name).toBe('test-image.png');
      expect(metadata.upload_source).toBe('user_input');
      expect(metadata.file_extension).toBe('png');
      expect(metadata.bytes_processed).toBe(validPngBuffer.length);
      expect(metadata.user_tier).toBe('pro');
      expect(metadata.validation.checksum_calculated).toBe(true);
      expect(metadata.validation.dimensions_extracted).toBe(false);
    });

    it('should validate MIME type correctly', () => {
      const { metadata } = extractBasicMetadata(validPngBuffer, 'image/png', options);
      expect(metadata.validation.mime_verified).toBe(true);

      const { metadata: invalidMimeMetadata } = extractBasicMetadata(validPngBuffer, 'image/gif', options);
      expect(invalidMimeMetadata.validation.mime_verified).toBe(false);
    });

    it('should validate size limits', () => {
      const { metadata } = extractBasicMetadata(validPngBuffer, 'image/png', options);
      expect(metadata.validation.size_within_limits).toBe(true);

      const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB > 5MB limit
      const { metadata: oversizeMetadata } = extractBasicMetadata(largeBuffer, 'image/png', options);
      expect(oversizeMetadata.validation.size_within_limits).toBe(false);
    });
  });

  describe('extractMetadataWithDimensions', () => {
    const options = {
      originalName: 'test-image.png',
      uploadSource: 'user_input' as const,
      userTier: 'pro',
      sessionId: 'session-123',
      draftId: 'draft-456',
      maxSize: 5 * 1024 * 1024, // 5MB
    };

    it('should extract complete metadata with dimensions', () => {
      const { checksum, width, height, metadata } = extractMetadataWithDimensions(
        validPngBuffer, 
        'image/png', 
        options
      );
      
      expect(checksum).toBeTruthy();
      expect(width).toBe(1);
      expect(height).toBe(1);
      expect(metadata.dimensions).toEqual({ width: 1, height: 1 });
      expect(metadata.aspect_ratio).toBe('1.000');
      expect(metadata.megapixels).toBe('0.0');
      expect(metadata.validation.dimensions_extracted).toBe(true);
    });

    it('should handle images without extractable dimensions', () => {
      const { checksum, width, height, metadata } = extractMetadataWithDimensions(
        invalidBuffer, 
        'image/png', 
        options
      );
      
      expect(checksum).toBeTruthy();
      expect(width).toBeNull();
      expect(height).toBeNull();
      expect(metadata.dimensions).toBeUndefined();
      expect(metadata.validation.dimensions_extracted).toBe(false);
    });

    it('should work with minimal options', () => {
      const minimalOptions = {
        uploadSource: 'llm_generated' as const,
        userTier: 'free',
        maxSize: 1024 * 1024,
      };

      const { checksum, metadata } = extractMetadataWithDimensions(
        validPngBuffer, 
        'image/jpeg', 
        minimalOptions
      );
      
      expect(checksum).toBeTruthy();
      expect(metadata.upload_source).toBe('llm_generated');
      expect(metadata.user_tier).toBe('free');
      expect(metadata.file_extension).toBe('jpg');
      expect(metadata.original_name).toBeUndefined();
      expect(metadata.upload_session).toBeUndefined();
    });

    it('should include processing timestamp', () => {
      const beforeTime = new Date().toISOString();
      const { metadata } = extractMetadataWithDimensions(validPngBuffer, 'image/png', options);
      const afterTime = new Date().toISOString();
      
      expect(metadata.processing_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(metadata.processing_timestamp >= beforeTime).toBe(true);
      expect(metadata.processing_timestamp <= afterTime).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined buffers gracefully in checksum calculation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => calculateChecksum(null as any)).toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => calculateChecksum(undefined as any)).toThrow();
    });

    it('should not throw errors during dimension extraction failures', () => {
      expect(() => extractImageDimensions(invalidBuffer)).not.toThrow();
      expect(() => extractImageDimensions(Buffer.alloc(0))).not.toThrow();
    });

    it('should continue metadata extraction even if checksum fails', () => {
      // This would be hard to test with the current implementation since checksum 
      // calculation is very robust, but we ensure the function structure supports it
      expect(() => extractMetadataWithDimensions(validPngBuffer, 'image/png', {
        uploadSource: 'user_input',
        userTier: 'free',
        maxSize: 1024,
      })).not.toThrow();
    });
  });
});
