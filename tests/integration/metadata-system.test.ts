// tests/integration/metadata-system.test.ts

import { calculateChecksum, extractImageDimensions, extractMetadataWithDimensions } from '../../lib/utils/imageMetadata';

describe('Image Metadata System Integration', () => {
  // Create test image data
  const createTestImageBuffer = (size: number = 1024): Buffer => {
    return Buffer.alloc(size, 0);
  };

  describe('Checksum Calculation', () => {
    it('should calculate consistent checksums for identical data', () => {
      const buffer1 = createTestImageBuffer(1024);
      const buffer2 = createTestImageBuffer(1024);
      
      const checksum1 = calculateChecksum(buffer1);
      const checksum2 = calculateChecksum(buffer2);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    it('should calculate different checksums for different data', () => {
      const buffer1 = Buffer.from('image data 1');
      const buffer2 = Buffer.from('image data 2');
      
      const checksum1 = calculateChecksum(buffer1);
      const checksum2 = calculateChecksum(buffer2);
      
      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Image Dimensions Extraction', () => {
    it('should return null dimensions for invalid image data', () => {
      const buffer = Buffer.from('not an image');
      const { width, height } = extractImageDimensions(buffer);
      
      expect(width).toBeNull();
      expect(height).toBeNull();
    });

    it('should handle empty buffer gracefully', () => {
      const buffer = Buffer.alloc(0);
      const { width, height } = extractImageDimensions(buffer);
      
      expect(width).toBeNull();
      expect(height).toBeNull();
    });
  });

  describe('Complete Metadata Extraction', () => {
    it('should extract metadata with all required fields', () => {
      const buffer = createTestImageBuffer(2048);
      
      const result = extractMetadataWithDimensions(buffer, 'image/png', {
        originalName: 'test.png',
        uploadSource: 'user_input',
        userTier: 'free',
        sessionId: 'test-session',
        draftId: 'test-draft',
        maxSize: 10485760, // 10MB
      });

      // Verify core fields
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.width).toBeNull(); // Invalid image data
      expect(result.height).toBeNull();
      expect(result.metadata).toBeDefined();

      // Verify metadata structure
      expect(result.metadata.original_name).toBe('test.png');
      expect(result.metadata.upload_source).toBe('user_input');
      expect(result.metadata.file_extension).toBe('png');
      expect(result.metadata.bytes_processed).toBe(2048);
      expect(result.metadata.user_tier).toBe('free');

      // Verify validation flags
      expect(result.metadata.validation.checksum_calculated).toBe(true);
      expect(result.metadata.validation.dimensions_extracted).toBe(false);
      expect(result.metadata.validation.mime_verified).toBe(true);
      expect(result.metadata.validation.size_within_limits).toBe(true);
    });

    it('should handle LLM-generated images metadata', () => {
      const buffer = createTestImageBuffer(4096);
      
      const result = extractMetadataWithDimensions(buffer, 'image/jpeg', {
        uploadSource: 'llm_generated',
        userTier: 'pro',
        maxSize: 20971520, // 20MB
      });

      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.metadata.upload_source).toBe('llm_generated');
      expect(result.metadata.file_extension).toBe('jpg');
      expect(result.metadata.bytes_processed).toBe(4096);
      expect(result.metadata.user_tier).toBe('pro');
      expect(result.metadata.validation.checksum_calculated).toBe(true);
    });

    it('should handle large files within limits', () => {
      const buffer = createTestImageBuffer(5242880); // 5MB
      
      const result = extractMetadataWithDimensions(buffer, 'image/webp', {
        uploadSource: 'user_input',
        userTier: 'enterprise',
        maxSize: 10485760, // 10MB limit
      });

      expect(result.metadata.bytes_processed).toBe(5242880);
      expect(result.metadata.validation.size_within_limits).toBe(true);
    });

    it('should detect size violations', () => {
      const buffer = createTestImageBuffer(15728640); // 15MB
      
      const result = extractMetadataWithDimensions(buffer, 'image/png', {
        uploadSource: 'user_input',
        userTier: 'free',
        maxSize: 10485760, // 10MB limit
      });

      expect(result.metadata.bytes_processed).toBe(15728640);
      expect(result.metadata.validation.size_within_limits).toBe(false);
    });
  });

  describe('Database Integration Preparation', () => {
    it('should provide data structure suitable for database insertion', () => {
      const buffer = createTestImageBuffer(1536);
      
      const metadataResult = extractMetadataWithDimensions(buffer, 'image/jpeg', {
        originalName: 'database-test.jpg',
        uploadSource: 'user_input',
        userTier: 'pro',
        sessionId: 'db-session',
        draftId: 'db-draft',
        maxSize: 5242880, // 5MB
      });

      // Simulate database record preparation
      const dbRecord = {
        user_id: 'user-123',
        session_id: 'db-session',
        draft_id: 'db-draft',
        file_path: 'uploads/database-test.jpg',
        mime_type: 'image/jpeg',
        file_size: 1536,
        original_name: 'database-test.jpg',
        
        // New metadata fields
        checksum: metadataResult.checksum,
        width: metadataResult.width,
        height: metadataResult.height,
        metadata: metadataResult.metadata,
        
        // Standard timestamp fields
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Verify all required database fields are present
      expect(dbRecord.checksum).toBeDefined();
      expect(typeof dbRecord.checksum).toBe('string');
      expect(dbRecord.width).toBeNull(); // Invalid image, so null
      expect(dbRecord.height).toBeNull();
      expect(typeof dbRecord.metadata).toBe('object');
      expect(dbRecord.metadata).not.toBeNull();

      // Verify metadata can be JSON serialized for JSONB column
      expect(() => JSON.stringify(dbRecord.metadata)).not.toThrow();
      const serialized = JSON.parse(JSON.stringify(dbRecord.metadata));
      expect(serialized.validation.checksum_calculated).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed MIME types gracefully', () => {
      const buffer = createTestImageBuffer(1024);
      
      const result = extractMetadataWithDimensions(buffer, 'invalid/mime', {
        uploadSource: 'user_input',
        userTier: 'free',
        maxSize: 10485760,
      });

      expect(result.checksum).toBeDefined();
      expect(result.metadata.file_extension).toBe('bin'); // Unknown extension defaults to 'bin'
      expect(result.metadata.validation.mime_verified).toBe(false);
    });

    it('should handle missing optional fields', () => {
      const buffer = createTestImageBuffer(512);
      
      const result = extractMetadataWithDimensions(buffer, 'image/png', {
        uploadSource: 'llm_generated',
        userTier: 'free',
        maxSize: 1048576, // 1MB
      });

      expect(result.metadata.original_name).toBeUndefined();
      expect(result.metadata.upload_session).toBeUndefined();
      expect(result.metadata.draft_context).toBeUndefined();
      expect(result.metadata.validation.checksum_calculated).toBe(true);
    });
  });
});
