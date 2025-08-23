# Streaming Integration with Web Search & Reasoning

**Status**: Open  
**Priority**: Medium  
**Component**: Backend Streaming + Frontend Integration  
**Created**: 2025-08-23

## Issue Description

Streaming responses don't properly handle Web Search annotations and Reasoning data, resulting in incomplete or missing metadata in streaming mode compared to non-streaming mode.

## Current Status

### ✅ What Works in Streaming:

- Basic text content streaming
- Token counts (input/output/total)
- Elapsed time calculation
- Generation ID links
- Basic markdown rendering

### ❌ What's Missing in Streaming:

- **Web Search annotations**: URL citations, search results metadata
- **Reasoning data**: Model thinking steps and reasoning details
- **Complete metadata**: Some advanced metadata fields may be incomplete

## Evidence from User Report

Screenshot shows streaming response with web search enabled:

- `"has_websearch":true` is present
- But annotations array appears in raw JSON metadata (parsing issue)
- Unclear if reasoning mode was tested

## Root Cause Analysis

### Backend Streaming Endpoint Issues

1. **OpenRouter Stream Processing**: The `/api/chat/stream` endpoint may not be extracting all metadata from OpenRouter's streaming response
2. **Annotation Handling**: Web search annotations might not be properly parsed from stream metadata
3. **Reasoning Integration**: Reasoning steps might not be captured in streaming mode

### Current Implementation Gaps

Looking at `src/app/api/chat/stream/route.ts`:

```typescript
// May not handle all OpenRouter streaming metadata
const rawAnnotations = streamMetadata.annotations ?? [];
// Reasoning handling might be incomplete
...(streamMetadata.reasoning && { reasoning: streamMetadata.reasoning }),
```

## Comparison: Non-Streaming vs Streaming

### Non-Streaming (`/api/chat`) Features:

- ✅ Full OpenRouter response processing
- ✅ Complete annotation extraction
- ✅ Reasoning data preservation
- ✅ All metadata fields populated

### Streaming (`/api/chat/stream`) Missing:

- ❓ Incomplete annotation processing?
- ❓ Missing reasoning data?
- ❓ Partial metadata extraction?

## Investigation Required

### 1. Backend Stream Metadata Extraction

Check if OpenRouter streaming responses include:

- Complete annotation data for web search
- Full reasoning steps and details
- All metadata fields present in non-streaming

### 2. Frontend Integration

Verify streaming hook handles:

- Annotation display in UI
- Reasoning expandable sections
- All metadata field population

### 3. Feature Parity Testing

Compare streaming vs non-streaming for:

- Web search responses with citations
- Reasoning mode with thinking steps
- Complex responses with multiple metadata types

## Proposed Solution

### Phase 1: Backend Investigation

1. **Log OpenRouter streaming metadata**: Add detailed logging to see what's available
2. **Compare stream vs completion**: Verify OpenRouter provides same metadata in both modes
3. **Fix extraction logic**: Update annotation and reasoning parsing if needed

### Phase 2: Frontend Enhancement

1. **Annotation display**: Ensure streaming responses show web search citations
2. **Reasoning sections**: Verify reasoning data populates expandable sections
3. **UI parity**: Match non-streaming feature display exactly

### Phase 3: Integration Testing

1. **Web search + streaming**: Test various search queries with streaming enabled
2. **Reasoning + streaming**: Test reasoning mode with streaming
3. **Combined features**: Test web search + reasoning + streaming together

## User Impact

### Current Experience:

- **Inconsistent features**: Some advanced features work only in non-streaming mode
- **Feature confusion**: Users might disable streaming to access full functionality
- **Reduced value**: Streaming becomes "basic mode" instead of enhanced UX

### Desired Experience:

- **Feature parity**: All features work identically in both modes
- **Enhanced UX**: Streaming provides faster feedback WITH all advanced features
- **Transparent choice**: Users choose streaming purely for UX preference

## Testing Checklist

### Web Search Integration:

- [ ] Web search + streaming shows URL citations
- [ ] Annotation links are clickable and functional
- [ ] Search result metadata is complete
- [ ] Citation formatting matches non-streaming

### Reasoning Integration:

- [ ] Reasoning + streaming shows expandable thinking steps
- [ ] Reasoning details are complete and formatted
- [ ] Reasoning metadata (effort level, etc.) is preserved
- [ ] UI matches non-streaming reasoning display

### Combined Features:

- [ ] Web search + reasoning + streaming works together
- [ ] All metadata fields populated correctly
- [ ] Performance remains acceptable with all features enabled

## Dependencies

- Streaming metadata parsing bug fix (related issue)
- OpenRouter API streaming capabilities investigation
- Frontend streaming hook metadata handling enhancement
