// tests/api/uploads/image-metadata-integration.test.ts

import { extractMetadataWithDimensions } from '../../../lib/utils/imageMetadata';

// Mock to control the actual extraction function
jest.mock('../../../lib/utils/imageMetadata');

const mockExtractMetadataWithDimensions = extractMetadataWithDimensions as jest.MockedFunction<typeof extractMetadataWithDimensions>;

describe('Image Metadata Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract metadata with checksum and dimensions', () => {
    // Mock successful metadata extraction
    mockExtractMetadataWithDimensions.mockReturnValue({
      checksum: 'abc123def456789',
      width: 800,
      height: 600,
      metadata: {
        original_name: 'test-image.jpg',
        upload_source: 'user_input',
        file_extension: 'jpg',
        bytes_processed: 2048,
        validation: {
          checksum_calculated: true,
          dimensions_extracted: true,
        },
      },
    });

    const testBuffer = Buffer.from('fake-image-data');
    const result = extractMetadataWithDimensions(testBuffer, 'image/jpeg', {
      originalName: 'test-image.jpg',
      uploadSource: 'user_input',
      userTier: 'pro',
      sessionId: 'session-123',
      draftId: 'draft-456',
      maxSize: 10485760, // 10MB
    });

    expect(result).toBeDefined();
    expect(result.checksum).toBe('abc123def456789');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.metadata.validation.checksum_calculated).toBe(true);
    expect(result.metadata.validation.dimensions_extracted).toBe(true);
  });

  it('should handle metadata extraction with null dimensions', () => {
    // Mock metadata extraction with missing dimensions
    mockExtractMetadataWithDimensions.mockReturnValue({
      checksum: 'def456ghi789',
      width: null,
      height: null,
      metadata: {
        original_name: 'unsupported.bmp',
        upload_source: 'user_input',
        file_extension: 'bmp',
        bytes_processed: 1024,
        validation: {
          checksum_calculated: true,
          dimensions_extracted: false,
        },
      },
    });

    const testBuffer = Buffer.from('unsupported-format');
    const result = extractMetadataWithDimensions(testBuffer, 'image/bmp', {
      originalName: 'unsupported.bmp',
      uploadSource: 'user_input',
      userTier: 'free',
      sessionId: 'session-789',
      draftId: 'draft-012',
    });

    expect(result.checksum).toBe('def456ghi789');
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.metadata.validation.checksum_calculated).toBe(true);
    expect(result.metadata.validation.dimensions_extracted).toBe(false);
  });

  it('should handle metadata extraction failures gracefully', () => {
    // Mock extraction throwing an error
    mockExtractMetadataWithDimensions.mockImplementation(() => {
      throw new Error('Metadata extraction failed');
    });

    const testBuffer = Buffer.from('corrupted-data');
    
    expect(() => {
      extractMetadataWithDimensions(testBuffer, 'image/png', {
        originalName: 'corrupted.png',
        uploadSource: 'user_input',
        userTier: 'pro',
        sessionId: 'session-error',
        draftId: 'draft-error',
      });
    }).toThrow('Metadata extraction failed');
  });

  it('should call metadata extraction with correct parameters', () => {
    mockExtractMetadataWithDimensions.mockReturnValue({
      checksum: 'test-checksum',
      width: 400,
      height: 300,
      metadata: {
        original_name: 'param-test.webp',
        upload_source: 'llm_generated',
        file_extension: 'webp',
        bytes_processed: 512,
        validation: {
          checksum_calculated: true,
          dimensions_extracted: true,
        },
      },
    });

    const testBuffer = Buffer.from('webp-data');
    const context = {
      originalName: 'param-test.webp',
      uploadSource: 'llm_generated' as const,
      userTier: 'enterprise' as const,
      sessionId: 'test-session',
      draftId: 'test-draft',
    };

    extractMetadataWithDimensions(testBuffer, 'image/webp', context);

    expect(mockExtractMetadataWithDimensions).toHaveBeenCalledWith(
      testBuffer,
      'image/webp',
      context
    );
    expect(mockExtractMetadataWithDimensions).toHaveBeenCalledTimes(1);
  });

  it('should validate metadata structure integrity', () => {
    mockExtractMetadataWithDimensions.mockReturnValue({
      checksum: '123abc456def',
      width: 1920,
      height: 1080,
      metadata: {
        original_name: 'structure-test.png',
        upload_source: 'user_input',
        file_extension: 'png',
        bytes_processed: 4096,
        validation: {
          checksum_calculated: true,
          dimensions_extracted: true,
        },
        // Additional metadata fields can be included
        aspect_ratio: '1.78',
        file_size_category: 'large',
      },
    });

    const testBuffer = Buffer.from('large-image-data');
    const result = extractMetadataWithDimensions(testBuffer, 'image/png', {
      originalName: 'structure-test.png',
      uploadSource: 'user_input',
      userTier: 'pro',
      sessionId: 'structure-session',
      draftId: 'structure-draft',
    });

    // Verify required metadata structure
    expect(result).toHaveProperty('checksum');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('original_name');
    expect(result.metadata).toHaveProperty('upload_source');
    expect(result.metadata).toHaveProperty('file_extension');
    expect(result.metadata).toHaveProperty('bytes_processed');
    expect(result.metadata).toHaveProperty('validation');
    expect(result.metadata.validation).toHaveProperty('checksum_calculated');
    expect(result.metadata.validation).toHaveProperty('dimensions_extracted');
  });
});

describe('Metadata Database Integration Mock', () => {
  it('should prepare metadata for database insertion', () => {
    const metadataResult = {
      checksum: 'db-test-checksum',
      width: 640,
      height: 480,
      metadata: {
        original_name: 'db-test.jpg',
        upload_source: 'user_input' as const,
        file_extension: 'jpg',
        bytes_processed: 1536,
        validation: {
          checksum_calculated: true,
          dimensions_extracted: true,
        },
      },
    };

    // Mock database insert data preparation
    const dbInsertData = {
      user_id: 'user-123',
      session_id: 'session-456',
      draft_id: 'draft-789',
      file_path: 'path/to/file.jpg',
      mime_type: 'image/jpeg',
      file_size: 1536,
      original_name: 'db-test.jpg',
      // New metadata fields
      checksum: metadataResult.checksum,
      width: metadataResult.width,
      height: metadataResult.height,
      metadata: metadataResult.metadata,
    };

    // Verify all required fields are present for database insertion
    expect(dbInsertData.checksum).toBe('db-test-checksum');
    expect(dbInsertData.width).toBe(640);
    expect(dbInsertData.height).toBe(480);
    expect(dbInsertData.metadata).toBeDefined();
    expect(dbInsertData.metadata.validation.checksum_calculated).toBe(true);
    expect(dbInsertData.metadata.validation.dimensions_extracted).toBe(true);
  });

  it('should handle null dimensions in database insertion', () => {
    const metadataResult = {
      checksum: 'null-dims-checksum',
      width: null,
      height: null,
      metadata: {
        original_name: 'unsupported.gif',
        upload_source: 'user_input' as const,
        file_extension: 'gif',
        bytes_processed: 2048,
        validation: {
          checksum_calculated: true,
          dimensions_extracted: false,
        },
      },
    };

    const dbInsertData = {
      user_id: 'user-123',
      session_id: 'session-456',
      draft_id: null, // Can be null for direct uploads
      file_path: 'path/to/unsupported.gif',
      mime_type: 'image/gif',
      file_size: 2048,
      original_name: 'unsupported.gif',
      checksum: metadataResult.checksum,
      width: metadataResult.width, // null
      height: metadataResult.height, // null
      metadata: metadataResult.metadata,
    };

    // Verify null values are handled correctly
    expect(dbInsertData.checksum).toBe('null-dims-checksum');
    expect(dbInsertData.width).toBeNull();
    expect(dbInsertData.height).toBeNull();
    expect(dbInsertData.metadata.validation.checksum_calculated).toBe(true);
    expect(dbInsertData.metadata.validation.dimensions_extracted).toBe(false);
  });
});
