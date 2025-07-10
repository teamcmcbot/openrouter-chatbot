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

### Phase 0: Backward Compatibility Preparation (NEW)

#### Task 0.1: Feature Flag Infrastructure

**File**: `lib/utils/env.ts`
**Estimated Time**: 1 hour

- [ ] Add environment variable for enabling enhanced models API
- [ ] Add feature flag utility functions
- [ ] Update existing environment validation

#### Task 0.2: Dual API Endpoint Strategy

**File**: `src/app/api/models/route.ts`
**Estimated Time**: 2 hours

- [ ] Modify existing endpoint to support both response formats
- [ ] Add query parameter `?enhanced=true` for new format
- [ ] Maintain current behavior as default
- [ ] Add comprehensive logging for monitoring adoption

### Phase 1: Backend Type Definitions and API Enhancement

#### Task 1.1: Update Type Definitions

**File**: `lib/types/openrouter.ts`
**Estimated Time**: 2 hours

- [ ] Add comprehensive OpenRouter model interface based on API response structure
- [ ] Create filtered model response interface for API endpoint
- [ ] Ensure backward compatibility with existing types

**Updated Definition** (based on current OpenRouter API v1):

```typescript
// OpenRouter API response wrapper
export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

// Complete OpenRouter model interface (matches API v1 structure)
export interface OpenRouterModel {
  id: string;
  canonical_slug: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
    web_search: string;
    internal_reasoning: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  per_request_limits: any | null;
  supported_parameters: string[];
}

// Simplified interface for frontend consumption
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  input_modalities: string[];
  output_modalities: string[];
  supported_parameters: string[];
  created: number;
}

// API response format (maintaining backward compatibility)
export interface ModelsResponse {
  models: ModelInfo[];
}
```

#### Task 1.2: Create OpenRouter API Client Function

**File**: `lib/utils/openrouter.ts`
**Estimated Time**: 3 hours

- [ ] Add function to fetch models from OpenRouter API
- [ ] Implement error handling and retries
- [ ] Add data transformation logic to convert OpenRouter format to our format

**Implementation**:

```typescript
// Fetch models from OpenRouter API with proper error handling
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const apiUrl = getEnvVar(
    "OPENROUTER_MODELS_API_URL",
    "https://openrouter.ai/api/v1/models"
  );

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "OpenRouter Chatbot",
      },
    });

    if (!response.ok) {
      throw new ApiErrorResponse(
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
```

#### Task 1.3: Update Models API Endpoint

**File**: `src/app/api/models/route.ts`
**Estimated Time**: 5 hours

- [ ] Fetch models from OpenRouter API using new client function
- [ ] Filter models based on `OPENROUTER_MODELS_LIST` environment variable
- [ ] Implement Next.js 15 compatible caching with `unstable_cache`
- [ ] Add graceful error fallback to current string array behavior
- [ ] Return enhanced model data with backward compatibility option
- [ ] Add proper TypeScript error handling

**Key Features**:

- Use Next.js 15's `unstable_cache` for server-side caching (30-minute TTL)
- Graceful fallback to environment variable list if OpenRouter API fails
- Feature flag support for gradual rollout (`ENABLE_ENHANCED_MODELS`)
- Comprehensive error logging and monitoring
- Rate limiting protection with exponential backoff

### Phase 2: Frontend Updates

#### Task 2.1: Update Model Selection Hook

**File**: `hooks/useModelSelection.ts`
**Estimated Time**: 2 hours

- [ ] Update to handle new `ModelInfo[]` format
- [ ] Maintain backward compatibility during transition
- [ ] Update local storage handling if needed

#### Task 2.2: Enhanced Model Dropdown Component

**File**: `components/ui/ModelDropdown.tsx`
**Estimated Time**: 3 hours

- [ ] Update to display actual model names instead of formatted IDs
- [ ] Add model description as tooltip or secondary text
- [ ] Maintain model ID for value selection
- [ ] Add loading state handling
- [ ] Improve accessibility

**Enhanced Features**:

```tsx
interface ModelDropdownProps {
  models: ModelInfo[] | string[]; // Support both formats during transition
  selectedModel: string; // Still uses ID for compatibility
  onModelSelect: (modelId: string) => void;
  enhanced?: boolean; // Flag for enhanced display mode
}

// Enhanced display with model information
interface EnhancedModelDisplayProps {
  model: ModelInfo;
  selected: boolean;
  onClick: () => void;
}
```

**Migration Strategy**:

- Extend existing `displayName()` function with enhanced model data
- Add progressive enhancement based on data availability
- Maintain existing keyboard navigation and accessibility
- Add tooltip/popover for model details on hover/focus

#### Task 2.3: Update Chat Interface

**File**: `components/chat/ChatInterface.tsx`
**Estimated Time**: 1 hour

- [ ] Ensure model ID continues to be passed to chat API
- [ ] Verify no breaking changes in model selection flow

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
