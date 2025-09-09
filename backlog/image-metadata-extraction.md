# Image Metadata Extraction for chat_attachments

## Overview

Populate the currently unused columns in `chat_attachments` table (`width`, `height`, `checksum`, `metadata`) with extracted image metadata for both user-uploaded images and LLM-generated images.

## Current State

The `chat_attachments` table has these unused columns:

- `width INTEGER NULL` - Image pixel width
- `height INTEGER NULL` - Image pixel height
- `checksum TEXT NULL` - File integrity hash
- `metadata JSONB DEFAULT '{}'::jsonb` - Structured metadata

### Two Image Types Need Processing

1. **Input Images** (User Uploads)

   - Endpoint: `POST /api/uploads/images`
   - Flow: Multipart form-data → Buffer → Supabase Storage
   - Current: Basic MIME/size validation only

2. **LLM-Generated Images** (Assistant Output)
   - Endpoint: `POST /api/chat/images/store`
   - Flow: Base64 from OpenRouter → Buffer → Supabase Storage
   - Current: Base64 decode + size validation only

## Requirements

### Phase 1: Basic Metadata (No Dependencies)

- [ ] **Checksum calculation** using Node.js built-in `crypto` module
- [ ] **Basic metadata** population with upload context
- [ ] **Non-blocking implementation** - metadata extraction failures should not break uploads
- [ ] **Backward compatibility** - existing records remain unaffected

### Phase 2: Image Dimensions (Final Phase)

- [ ] **Add `image-size` dependency** (~500KB, pure JavaScript)
- [ ] **Width/height extraction** from image buffers
- [ ] **Error handling** for corrupted or unsupported image formats
- [ ] **Performance testing** in serverless environment

## Technical Implementation

### Checksum Implementation

```typescript
import { createHash } from "crypto";

function calculateChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
```

### Dependency Options for Dimensions

#### Selected: `image-size` (Perfect for our needs)

- **Pros**: Lightweight (~500KB), pure JavaScript, fast dimension extraction
- **Cons**: Dimensions only (but that's exactly what we need)
- **Use case**: Extract width/height for `chat_attachments` table
- **Serverless friendly**: No native dependencies, works everywhere

### Metadata Structure

```typescript
interface ImageMetadata {
  // File information
  original_name?: string;
  upload_source: "user_input" | "llm_generated";
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
```

## Implementation Plan

### Phase 1: Checksum + Basic Metadata

**Estimated effort**: 4-6 hours
**Dependencies**: None (Node.js built-in crypto)

1. [ ] Update `POST /api/uploads/images` to calculate checksum
2. [ ] Update `POST /api/chat/images/store` to calculate checksum
3. [ ] Populate basic metadata structure
4. [ ] Add error handling for metadata extraction failures
5. [ ] Update database insert statements
6. [ ] Write tests for checksum calculation
7. [ ] Verify backward compatibility

### Phase 2: Dimensions Extraction

**Estimated effort**: 6-8 hours
**Dependencies**: `image-size` package

1. [ ] Add `image-size` dependency to package.json
2. [ ] Implement dimension extraction function
3. [ ] Update both image upload endpoints
4. [ ] Handle extraction errors gracefully
5. [ ] Add dimension validation (reasonable limits)
6. [ ] Update metadata structure with dimensions
7. [ ] Write comprehensive tests
8. [ ] Performance testing in serverless environment

## Success Criteria

### Phase 1

- [ ] All new image uploads have populated `checksum` and `metadata` fields
- [ ] Upload performance impact < 50ms per image
- [ ] Zero upload failures due to metadata extraction
- [ ] Existing functionality remains unchanged

### Phase 2

- [ ] All new images have accurate `width` and `height`
- [ ] Dimension extraction works for PNG, JPEG, WebP formats
- [ ] Bundle size increase acceptable (< 1MB for `image-size`)
- [ ] Serverless cold start impact minimal

## Benefits

1. **File Integrity**: Checksum-based validation and monitoring
2. **User Experience**: Display dimensions in UI, better file organization
3. **Performance**: Identify oversized images affecting load times
4. **Security**: Additional validation layer through checksums
5. **Compliance**: Better audit trail and file tracking
6. **Database Completeness**: Populate unused schema columns with meaningful data

## Risks & Mitigation

### Bundle Size Impact

- **Risk**: Adding image processing dependencies increases deployment size
- **Mitigation**: `image-size` is only ~500KB, minimal impact

### Processing Performance

- **Risk**: Metadata extraction adds latency to uploads
- **Mitigation**: Make extraction non-blocking, implement timeouts

### Serverless Compatibility

- **Risk**: Native dependencies may not work in serverless environment
- **Mitigation**: `image-size` is pure JavaScript, fully serverless compatible

### Error Handling

- **Risk**: Corrupted images could break metadata extraction
- **Mitigation**: Comprehensive try-catch, graceful degradation

## Testing Strategy

### Unit Tests

- [ ] Checksum calculation accuracy
- [ ] Dimension extraction for various formats
- [ ] Metadata structure validation
- [ ] Error handling for corrupted files

### Integration Tests

- [ ] End-to-end upload flow with metadata
- [ ] Database record validation
- [ ] Performance benchmarking
- [ ] Serverless deployment testing

### Load Testing

- [ ] Concurrent upload handling
- [ ] Memory usage with large images
- [ ] Cold start impact measurement

## Future Enhancements (Out of Scope)

1. **EXIF Data Extraction**: Camera metadata, GPS, timestamps (would require `sharp`)
2. **Image Optimization**: Automatic compression, format conversion
3. **Thumbnail Generation**: Preview images for faster loading
4. **Duplicate Detection**: Using checksums for deduplication
5. **Advanced Analytics**: Usage statistics and optimization insights

## Related Files

### Implementation

- `src/app/api/uploads/images/route.ts` - User upload endpoint
- `src/app/api/chat/images/store/route.ts` - LLM image storage endpoint
- `database/schema/02-chat.sql` - Database schema

### Dependencies

- `package.json` - Add image processing libraries
- `lib/utils/` - Utility functions for metadata extraction

### Documentation

- `docs/api/uploads-images.md` - API documentation updates
- `docs/architecture/image-attachments.md` - Architecture updates

## Priority

**Medium** - Enhances existing functionality without breaking changes, completes unused database schema, and provides basic image metadata for future features.

## Acceptance Criteria

- [ ] New image uploads populate all metadata fields when possible
- [ ] Upload functionality remains 100% backward compatible
- [ ] Performance impact is negligible (< 100ms additional processing)
- [ ] Error handling prevents metadata failures from breaking uploads
- [ ] Database migrations handle existing NULL values properly
- [ ] Test coverage > 90% for new metadata functionality
- [ ] Documentation updated to reflect new capabilities
