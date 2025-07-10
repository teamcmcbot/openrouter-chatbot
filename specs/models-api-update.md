# Models API Update Specification

## Overview

This specification outlines the implementation plan for enhancing the `/api/models` endpoint to fetch full model details from the OpenRouter API, filter based on allowed models, and update the frontend to display model names while maintaining ID-based API compatibility.

## Current State Analysis

### Backend (`/api/models`)

- Returns a simple array of model IDs from `OPENROUTER_MODELS_LIST` environment variable
- Format: `{ models: string[] }`
- Example: `["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"]`

### Frontend (ModelDropdown)

- Displays formatted model names using `displayName()` function
- Uses simple string manipulation to format model IDs into readable names
- Stores selected model ID in localStorage
- Current interface: `{ models: string[] }`

### Chat API

- Uses model ID directly in requests to OpenRouter
- Model ID flows: Frontend → Chat API → OpenRouter API

## Requirements

1. **Enhanced Model Data**: Fetch complete model information from OpenRouter API
2. **Backward Compatibility**: Maintain existing API contracts with chat endpoint
3. **Improved UX**: Display actual model names instead of formatted IDs
4. **Performance**: Implement caching mechanism for model data
5. **Extensibility**: Enable future features like model details sidebar

## Implementation Plan

### Phase 0: Backward Compatibility Preparation ✅ COMPLETED

**Status**: All tasks completed successfully
**Total Time**: 3 hours (as estimated)
**Deliverables**: Feature flag infrastructure and dual-mode API endpoint ready for Phase 1

**Validation Results**:

- ✅ Build successful with no TypeScript errors
- ✅ All existing tests pass (66/66)
- ✅ Feature flag infrastructure implemented and tested
- ✅ Dual-mode API endpoint supports both legacy and enhanced modes
- ✅ Comprehensive logging and monitoring headers added
- ✅ Backward compatibility maintained

#### Task 0.1: Feature Flag Infrastructure ✅ COMPLETED

**File**: `lib/utils/env.ts`
**Estimated Time**: 1 hour

- [x] Add environment variable for enabling enhanced models API
- [x] Add feature flag utility functions
- [x] Update existing environment validation

**Implementation Details**:

- Added `isFeatureEnabled()` utility function for boolean feature flags
- Added `getEnvNumber()` helper for numeric environment variables
- Added specific functions: `isEnhancedModelsEnabled()`, `getModelsCacheTTL()`, etc.
- Updated `validateEnvVars()` to include new optional environment variables
- Added logging for feature flag status during validation

#### Task 0.2: Dual API Endpoint Strategy ✅ COMPLETED

**File**: `src/app/api/models/route.ts`
**Estimated Time**: 2 hours

- [x] Modify existing endpoint to support both response formats
- [x] Add query parameter `?enhanced=true` for new format
- [x] Maintain current behavior as default
- [x] Add comprehensive logging for monitoring adoption

**Implementation Details**:

- Added support for `?enhanced=true` query parameter detection
- Integrated with feature flag system (`ENABLE_ENHANCED_MODELS`)
- Added comprehensive logging with performance metrics
- Added response headers for monitoring (`X-Enhanced-Mode`, `X-Response-Time`, etc.)
- Maintained backward compatibility with existing response format
- Enhanced error handling with fallback logging

### Phase 1: Backend Type Definitions and API Enhancement ✅ COMPLETED

**Status**: All tasks completed successfully
**Total Time**: 10 hours (as estimated)
**Deliverables**: Complete backend implementation with OpenRouter API integration, type definitions, and enhanced models endpoint

**Validation Results**:

- ✅ Build successful with no TypeScript errors
- ✅ All existing tests pass (66/66)
- ✅ OpenRouter API client with robust error handling and retry logic
- ✅ Enhanced models API endpoint with caching and fallback mechanisms
- ✅ Complete type definitions matching OpenRouter API v1
- ✅ Dual-mode API support (legacy and enhanced)
- ✅ Comprehensive logging and monitoring capabilities

#### Task 1.1: Update Type Definitions ✅ COMPLETED

**File**: `lib/types/openrouter.ts`
**Estimated Time**: 2 hours

- [x] Add comprehensive OpenRouter model interface based on API response structure
- [x] Create filtered model response interface for API endpoint
- [x] Ensure backward compatibility with existing types

**Implementation Details**:

- Added `OpenRouterModelsResponse` wrapper interface for API v1 structure
- Created complete `OpenRouterModel` interface matching OpenRouter API specification
- Added simplified `ModelInfo` interface for frontend consumption
- Implemented `ModelsResponse` for enhanced API responses
- Added `LegacyModelsResponse` for backward compatibility
- Fixed TypeScript strict mode compliance for `per_request_limits` field

#### Task 1.2: Create OpenRouter API Client Function ✅ COMPLETED

**File**: `lib/utils/openrouter.ts`
**Estimated Time**: 3 hours

- [x] Add function to fetch models from OpenRouter API
- [x] Implement error handling and retries
- [x] Add data transformation logic to convert OpenRouter format to our format

**Implementation Details**:

- Added `fetchOpenRouterModels()` with comprehensive error handling
- Implemented exponential backoff with jitter for retry logic
- Added proper timeout handling (30 seconds) and rate limiting detection
- Created `transformOpenRouterModel()` for data transformation
- Implemented `filterAllowedModels()` for model filtering based on environment config
- Added robust logging throughout the client functions
- Handled various error scenarios including network failures, API errors, and invalid responses

#### Task 1.3: Update Models API Endpoint ✅ COMPLETED

**File**: `src/app/api/models/route.ts`
**Estimated Time**: 5 hours

- [x] Fetch models from OpenRouter API using new client function
- [x] Filter models based on `OPENROUTER_MODELS_LIST` environment variable
- [x] Implement Next.js 15 compatible caching with `unstable_cache`
- [x] Add graceful error fallback to current string array behavior
- [x] Return enhanced model data with backward compatibility option
- [x] Add proper TypeScript error handling

**Implementation Details**:

- Integrated `unstable_cache` for 10-minute server-side caching
- Added dual-mode response handling (legacy vs enhanced)
- Implemented comprehensive error fallback strategy
- Added detailed monitoring headers for observability
- Maintained backward compatibility with existing clients
- Added proper error handling with graceful degradation
- Implemented model filtering based on environment configuration

**Key Features Implemented**:

- Server-side caching using Next.js 15's `unstable_cache` (10-minute TTL)
- Graceful fallback to environment variable list if OpenRouter API fails
- Feature flag support for gradual rollout (`ENABLE_ENHANCED_MODELS`)
- Comprehensive error logging and monitoring headers
- Rate limiting protection with exponential backoff
- Backward compatibility maintained through dual-mode API design
  `OpenRouter API responded with ${response.status}`,
  ErrorCode.EXTERNAL_API_ERROR
  );
  }

      const data: OpenRouterModelsResponse = await response.json();
      return data.data; // Extract models array from wrapper

  } catch (error) {
  logger.error("Failed to fetch OpenRouter models:", error);
  throw error;
  }
  }

export function transformModelData(
openRouterModel: OpenRouterModel
): ModelInfo {
return {
id: openRouterModel.id,
name: openRouterModel.name,
description: openRouterModel.description,
context_length: openRouterModel.context_length,
pricing: {
prompt: openRouterModel.pricing.prompt,
completion: openRouterModel.pricing.completion,
},
input_modalities: openRouterModel.architecture.input_modalities,
output_modalities: openRouterModel.architecture.output_modalities,
supported_parameters: openRouterModel.supported_parameters,
created: openRouterModel.created,
};
}

// Filter models based on environment configuration
export function filterAllowedModels(
allModels: OpenRouterModel[],
allowedModelIds: string[]
): OpenRouterModel[] {
if (allowedModelIds.length === 0) {
return allModels; // Return all if no filter specified
}

return allModels.filter(
(model) =>
allowedModelIds.includes(model.id) ||
allowedModelIds.includes(model.canonical_slug)
);
}

````
### Phase 2: Frontend Updates ✅ COMPLETED

**Status**: All tasks completed successfully
**Total Time**: 6 hours (as estimated)
**Deliverables**: Enhanced frontend with backward compatibility, improved UX, and progressive enhancement

**Validation Results**:

- ✅ Build successful with no TypeScript errors
- ✅ All existing tests pass (66/66)
- ✅ Enhanced model selection hook with dual-format support
- ✅ Enhanced model dropdown with real names, descriptions, and context length
- ✅ Progressive enhancement based on data availability
- ✅ Improved accessibility and keyboard navigation
- ✅ Chat interface updated with enhanced model information
- ✅ Loading states and error handling implemented

#### Task 2.1: Update Model Selection Hook ✅ COMPLETED

**File**: `hooks/useModelSelection.ts`
**Estimated Time**: 2 hours

- [x] Update to handle new `ModelInfo[]` format
- [x] Maintain backward compatibility during transition
- [x] Update local storage handling if needed

**Implementation Details**:

- Added support for both `ModelInfo[]` and `string[]` formats using type guards
- Enhanced hook to request models with `?enhanced=true` parameter
- Added loading states, error handling, and enhanced mode detection
- Implemented proper model validation and fallback logic
- Added `refreshModels()` function for manual refresh capability
- Maintained backward compatibility with existing localStorage patterns
- Added comprehensive logging for debugging and monitoring

#### Task 2.2: Enhanced Model Dropdown Component ✅ COMPLETED

**File**: `components/ui/ModelDropdown.tsx`
**Estimated Time**: 3 hours

- [x] Update to display actual model names instead of formatted IDs
- [x] Add model description as tooltip or secondary text
- [x] Maintain model ID for value selection
- [x] Add loading state handling
- [x] Improve accessibility

**Implementation Details**:

- Added support for both enhanced (`ModelInfo[]`) and legacy (`string[]`) model formats
- Enhanced UI to display real model names, descriptions, and context length
- Added loading spinner and disabled state during model fetching
- Improved accessibility with proper ARIA labels and keyboard navigation
- Progressive enhancement - falls back gracefully to formatted IDs when enhanced data unavailable
- Added context length badges with formatted display (K/M notation)
- Enhanced visual design with better spacing and information hierarchy
- Maintained existing keyboard and click interactions

**Enhanced Features Implemented**:

- **Real Model Names**: Displays actual model names instead of formatted IDs
- **Model Descriptions**: Shows truncated descriptions for enhanced models
- **Context Length Indicators**: Displays context length with K/M formatting
- **Loading States**: Shows spinner during model fetching
- **Progressive Enhancement**: Gracefully handles both data formats
- **Improved Accessibility**: Enhanced ARIA support and keyboard navigation
- **Visual Enhancements**: Better typography, spacing, and information hierarchy

#### Task 2.3: Update Chat Interface ✅ COMPLETED

**File**: `components/chat/ChatInterface.tsx`
**Estimated Time**: 1 hour

- [x] Ensure model ID continues to be passed to chat API
- [x] Verify no breaking changes in model selection flow

**Implementation Details**:

- Updated to use enhanced model selection hook properties
- Added loading state support for model dropdown
- Enhanced UI to show "Enhanced" indicator when using enhanced mode
- Maintained backward compatibility with existing chat API integration
- Verified model IDs continue to flow correctly to chat endpoint
- Added visual feedback for enhanced mode status

**Key Features Implemented**:

- **Backward Compatibility**: Model IDs continue to be passed correctly to chat API
- **Enhanced Mode Indicator**: Visual indicator shows when enhanced data is available
- **Loading State Integration**: Model dropdown shows loading state during fetching
- **Error Handling**: Graceful degradation if model loading fails
- **Progressive Enhancement**: Works with both legacy and enhanced model data

### Phase 3: Caching and Performance

#### Task 3.1: Implement Model Data Storage

**File**: `hooks/useModelData.ts` (new)
**Estimated Time**: 3 hours

- [ ] Create hook for managing model data with localStorage caching
- [ ] Implement cache invalidation strategy
- [ ] Add refresh mechanism for stale data

**Implementation** (Updated for React 19 and modern patterns):

```typescript
export function useModelData() {
  // Use React 19's improved state management
  // Implement SWR-like caching pattern
  // Handle localStorage persistence with proper serialization
  // Add optimistic updates and background refresh

  return {
    models: ModelInfo[] | string[], // Support both formats
    loading: boolean,
    error: Error | null,
    isEnhanced: boolean, // Indicates if enhanced data is available
    refresh: () => Promise<void>,
    lastUpdated: Date | null,
  };
}
```

**Key Features**:

- Client-side cache with 24-hour TTL
- Background refresh using Web Workers (if available)
- Proper error boundaries integration
- Optimistic UI updates

#### Task 3.2: Background Data Refresh

**Estimated Time**: 2 hours

- [ ] Implement periodic background refresh of model data
- [ ] Add service worker for cache management (optional)
- [ ] Handle online/offline scenarios

### Phase 4: Enhanced User Experience

#### Task 4.1: Model Details Sidebar (Future Feature Preparation)

**File**: `components/ui/ModelDetailsSidebar.tsx` (new)
**Estimated Time**: 4 hours

- [ ] Create sidebar component for detailed model information
- [ ] Display model capabilities, pricing, context length
- [ ] Add toggle mechanism
- [ ] Responsive design

#### Task 4.2: Model Search and Filtering

**File**: `components/ui/ModelDropdown.tsx`
**Estimated Time**: 2 hours

- [ ] Add search functionality to model dropdown
- [ ] Implement filtering by model capabilities
- [ ] Add model categories/grouping

#### Task 4.3: Model Comparison Feature

**Estimated Time**: 3 hours

- [ ] Allow users to compare multiple models
- [ ] Show pricing differences
- [ ] Display capability matrices

### Phase 5: Testing and Documentation

#### Task 5.1: Unit Tests

**Estimated Time**: 4 hours

- [ ] Test OpenRouter API client with mocked responses
- [ ] Test model transformation functions
- [ ] Test caching mechanism
- [ ] Test error scenarios and fallbacks

#### Task 5.2: Integration Tests

**Estimated Time**: 3 hours

- [ ] Test end-to-end model selection flow
- [ ] Test API endpoint with various scenarios
- [ ] Test UI components with different model data

#### Task 5.3: Documentation Updates

**Estimated Time**: 2 hours

- [ ] Update API documentation
- [ ] Document caching strategy
- [ ] Add troubleshooting guide
- [ ] Update deployment notes

## Environment Variables

Add new environment variables for configuration:

```env
# OpenRouter API endpoint (optional, defaults to https://openrouter.ai/api/v1/models)
OPENROUTER_MODELS_API_URL=https://openrouter.ai/api/v1/models

# Cache TTL in minutes (optional, defaults to 30)
MODELS_CACHE_TTL_MINUTES=30

# Enable enhanced models API (optional, defaults to false for gradual rollout)
ENABLE_ENHANCED_MODELS=false

# Site URL for OpenRouter API headers (required for API access)
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Model data refresh interval in minutes (optional, defaults to 60)
MODELS_BACKGROUND_REFRESH_INTERVAL=60

# Maximum number of models to cache (optional, defaults to 1000)
MODELS_CACHE_MAX_SIZE=1000
```

## Data Flow

### Current Flow

```
Environment Variable → API → Frontend → Display Formatted ID
```

### New Flow (Enhanced)

```
OpenRouter API → Next.js Cache → Filter → Transform → API Endpoint
                      ↓                                    ↓
                 Background Refresh              Frontend (Enhanced Mode)
                                                          ↓
                                                  Display Real Names + Details
                                                          ↓
                                                 Chat API (uses ID - unchanged)
```

### Transition Flow

```
Phase 0: Environment Variable → API → Frontend → Display Formatted ID (Current)
Phase 1: Environment Variable → API (Dual Mode) → Frontend → Display Formatted ID
Phase 2: OpenRouter API → API (Enhanced Mode) → Frontend → Display Real Names
Phase 3: Full Enhanced Mode with caching and background refresh
```

## Migration Strategy

### Phase-wise Rollout (Updated)

1. **Phase 0**: Add feature flag infrastructure and dual-mode API support
2. **Phase 1**: Deploy backend changes with enhanced types and API client
3. **Phase 2**: Update frontend with progressive enhancement support
4. **Phase 3**: Enable caching and performance optimizations
5. **Phase 4**: Roll out enhanced UX features gradually via feature flags
6. **Phase 5**: Full feature activation and legacy code cleanup

### Rollback Plan

- Feature flags allow instant disable of enhanced features
- Dual-mode API endpoint maintains backward compatibility
- Environment variable controls for granular feature rollback
- Database/cache fallback to environment variable list
- Monitoring alerts for automatic rollback triggers

### A/B Testing Strategy

- Gradual rollout to percentage of users
- Metrics comparison between old and new UX
- User feedback collection and analysis
- Performance impact monitoring

## Error Handling

### OpenRouter API Failures

- Cache last successful response
- Fallback to current model list from environment
- Log errors for monitoring
- User notification for degraded experience

### Model Filtering Issues

- Skip invalid models silently
- Log filtering errors
- Ensure at least one model is available

## Performance Considerations

### Caching Strategy (Updated for Next.js 15)

- **Server-side**: Next.js 15 `unstable_cache` with 30-minute TTL
- **Edge Runtime**: Compatible caching for edge deployment
- **Client-side**: React Query-like pattern with localStorage persistence
- **Background refresh**: Service Worker or Web Worker for cache updates
- **Memory management**: LRU cache with size limits and cleanup

### API Rate Limiting (Enhanced)

- Respect OpenRouter API limits (check response headers)
- Implement jittered exponential backoff (avoid thundering herd)
- Circuit breaker pattern for API failures
- Use cached data during rate limiting periods
- Monitor and alert on rate limit proximity

### Bundle Size Optimization

- Lazy loading for model details components
- Code splitting for enhanced features
- Tree shaking optimization for unused OpenRouter API fields
- Dynamic imports for model comparison features

## Security Considerations (Enhanced)

- **Input Validation**: Strict validation of OpenRouter API responses using Zod schemas
- **XSS Prevention**: Sanitize model descriptions and names using DOMPurify
- **API Key Security**: Environment variable protection and rotation strategy
- **Rate Limiting**: Protect models endpoint from abuse with per-IP limits
- **CORS Configuration**: Proper CORS headers for API endpoints
- **Cache Poisoning**: Validate cached data integrity and implement cache versioning
- **Content Security Policy**: Update CSP for OpenRouter API domain
- **Error Message Sanitization**: Prevent information leakage in error responses

## Monitoring and Analytics

### Metrics to Track (Enhanced)

- **Performance**: Models API response times (p50, p95, p99)
- **Caching**: Cache hit/miss ratios and cache size metrics
- **API Health**: OpenRouter API error rates, timeouts, and rate limits
- **User Behavior**: Most selected models and selection patterns
- **Feature Adoption**: Enhanced UI feature usage and user engagement
- **Errors**: Client-side errors, API failures, and fallback usage
- **Bundle Impact**: JavaScript bundle size changes and load times

### Alerts (Updated)

- **Critical**: OpenRouter API complete failure (>5min downtime)
- **Warning**: High error rates (>5% over 10min), cache miss ratio >50%
- **Info**: Rate limit approaching (>80% of limit), slow API response (>2s)
- **Business**: Model selection failures, user experience degradation

## Success Criteria

### Functional Requirements

- [ ] Display actual model names in dropdown
- [ ] Maintain chat API compatibility
- [ ] Cache model data effectively
- [ ] Handle API failures gracefully
- [ ] Support future extensibility

### Performance Requirements

- [ ] Models API response < 500ms (cached)
- [ ] Models API response < 2s (fresh fetch)
- [ ] 99% uptime for model selection
- [ ] Cache hit ratio > 90%

### User Experience

- [ ] Improved model name clarity
- [ ] Faster dropdown loading
- [ ] Smooth fallback experience
- [ ] Accessible interface

## Timeline (Updated)

**Total Estimated Time**: 48 hours across 6 phases

### Week 1 (18 hours)

- Phase 0: Backward compatibility preparation (3 hours)
- Phase 1: Backend implementation (10 hours)
- Phase 2: Frontend updates (5 hours)

### Week 2 (16 hours)

- Phase 3: Caching and performance (6 hours)
- Phase 4: Enhanced UX (10 hours)

### Week 3 (14 hours)

- Phase 5: Testing and documentation (8 hours)
- Integration testing and A/B test setup (3 hours)
- Bug fixes, polish, and monitoring setup (3 hours)

## Dependencies

### External

- OpenRouter API availability and stability (99.9% SLA)
- No breaking changes in OpenRouter API v1 format
- OpenRouter API rate limits sufficient for user base
- Stable internet connectivity for API calls

### Internal

- Next.js 15 and React 19 compatibility maintained
- Current environment variable setup and deployment pipeline
- Existing model selection infrastructure and localStorage patterns
- Chat API integration points remain unchanged
- TypeScript strict mode compatibility
- Existing error handling and logging infrastructure

## Risk Assessment

### High Risk

- OpenRouter API changes breaking integration or rate limiting
- Performance degradation from external API calls impacting UX
- Next.js 15 caching behavior changes affecting implementation
- React 19 compatibility issues with existing components

### Medium Risk

- Cache invalidation issues causing stale data display
- Model ID mismatches between OpenRouter API and environment config
- Bundle size increase affecting page load performance
- User confusion during transition period with mixed UI states

### Low Risk

- UI/UX changes requiring design iteration
- Minor TypeScript compatibility issues
- Edge case handling in model filtering logic
- Accessibility improvements needing refinement

### Mitigation Strategies

- **Comprehensive Testing**: Unit, integration, and E2E tests with real OpenRouter data
- **Feature Flags**: Granular control over feature rollout and instant rollback capability
- **Monitoring**: Real-time alerts and dashboards for API health and user experience
- **Fallback Systems**: Multiple layers of fallback (cache → environment → hardcoded defaults)
- **Gradual Rollout**: A/B testing and percentage-based feature activation
- **Documentation**: Clear troubleshooting guides and runbooks for common issues

---

## Notes for Implementation

This **updated specification** provides a comprehensive roadmap for upgrading the models API while maintaining backward compatibility and preparing for future enhancements. The plan has been revised to address:

### Key Updates Made:

1. **OpenRouter API v1 Compatibility**: Updated type definitions to match the actual API response structure with `data` wrapper and `supported_parameters` field
2. **Next.js 15 & React 19 Support**: Leveraging new caching APIs and improved state management patterns
3. **Enhanced Error Handling**: Integration with existing error infrastructure and comprehensive fallback strategies
4. **Progressive Enhancement**: Dual-mode API support allowing gradual migration without breaking existing functionality
5. **Performance Optimization**: Bundle size considerations, lazy loading, and modern caching strategies
6. **Security Hardening**: Enhanced validation, sanitization, and rate limiting protection
7. **Monitoring & Observability**: Comprehensive metrics tracking and alerting for production readiness

### Implementation Priorities:

- **Stability First**: All changes maintain backward compatibility with existing chat functionality
- **User Experience**: Progressive enhancement ensures no degradation during transition
- **Performance**: Caching and optimization prevent API call overhead from impacting UX
- **Extensibility**: Architecture supports future features like model comparison and detailed information display

Each task is designed to be independently implementable and testable, allowing for incremental progress tracking and easy rollback if issues arise.
````
