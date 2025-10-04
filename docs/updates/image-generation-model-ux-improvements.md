# Image Generation Model UX Improvements

**Date:** October 4, 2025  
**Status:** ✅ Completed

## Overview

Enhanced the user experience when selecting image generation models by adding contextual feedback and dynamic UI changes.

## Changes Implemented

### 1. Dynamic Placeholder Text

**File:** `components/chat/MessageInput.tsx`

The message input textarea now displays context-aware placeholder text based on the selected model:

- **Text-only models:** `"Type your message..."`
- **Image generation models:** `"Describe your image..."`

This applies to any model where `output_modalities` includes `'image'`, including:
- Pure image generation models (e.g., DALL-E 3)
- Multimodal models with image output (e.g., Gemini 2.5 Flash Image)

**Implementation:**
```typescript
placeholder={isBanned 
  ? "You can't send messages while banned" 
  : (modelSupportsImageOutput ? "Describe your image..." : "Type your message...")
}
```

### 2. Toast Notification on Model Selection

**File:** `components/chat/MessageInput.tsx`

When a user switches from a non-image-generation model to an image-generation model, a success toast notification appears:

**Message Format:** `"{Model Name} can generate images"`

**Example:** `"DALL-E 3 can generate images"`

**Behavior:**
- ✅ Shows when switching FROM text-only TO image-generation model
- ❌ Does NOT show when switching between two image-generation models
- ❌ Does NOT show on initial page load (only on user action)
- Uses unique toast ID to prevent duplicates: `'image-gen-model-selected'`

**Implementation Details:**
```typescript
// Track previous model's image generation capability
const prevModelSupportsImageOutputRef = useRef<boolean>(false);

// In model change useEffect
if (modelSupportsImageOutput && !prevSupportsImageOutput) {
  const modelName = getModelDisplayName(selectedModelData, selectedModel);
  toast.success(`${modelName} can generate images`, {
    id: 'image-gen-model-selected',
  });
}
```

### 3. Detection Logic

**Image Generation Capability Detection:**
```typescript
const modelSupportsImageOutput = (() => {
  if (!selectedModel) return false;
  const info = Array.isArray(availableModels)
    ? (availableModels as ModelInfo[]).find((m) => m.id === selectedModel)
    : undefined;
  const mods = info?.output_modalities as string[] | undefined;
  return Array.isArray(mods) ? mods.includes('image') : false;
})();
```

This checks if the model's `output_modalities` array includes `'image'`.

## Testing

### Test Files Created/Updated

1. **`tests/components/MessageInput.test.tsx`** (Updated)
   - Added proper mocking for stores and hooks
   - Tests continue to pass with dynamic placeholder

2. **`tests/components/chat/MessageInput.image-gen-model.test.tsx`** (New)
   - Tests placeholder shows "Describe your image..." for image generation models
   - Tests placeholder shows "Type your message..." for text-only models
   - Tests toast notification appears when switching TO image generation model
   - Tests toast does NOT appear when switching between image generation models
   - Tests multimodal models with image output get appropriate placeholder

### Test Results

All tests passing:
```
✓ MessageInput - Image Generation Model (5 tests)
✓ MessageInput (3 tests)
```

## User Experience Flow

### Scenario 1: Selecting Image Generation Model

1. User starts with GPT-4 (text-only model)
2. User opens model dropdown and selects "DALL-E 3"
3. ✨ Toast appears: "DALL-E 3 can generate images"
4. Input placeholder changes to "Describe your image..."
5. User types image description and sends

### Scenario 2: Switching Between Image Generation Models

1. User has DALL-E 3 selected
2. User switches to "Gemini 2.5 Flash Image Preview"
3. No toast (both support image generation)
4. Placeholder remains "Describe your image..."

### Scenario 3: Switching Back to Text Model

1. User has DALL-E 3 selected (placeholder: "Describe your image...")
2. User switches to GPT-4
3. No toast
4. Placeholder changes to "Type your message..."

## Technical Details

### State Management

- **New ref:** `prevModelSupportsImageOutputRef` tracks previous model's image generation capability
- **Existing dependency:** `modelSupportsImageOutput` computed value
- **useEffect trigger:** Runs when `selectedModel`, `isEnterprise`, or `modelSupportsImageOutput` changes

### Dependencies

- `react-hot-toast` for notifications
- Model store (`useModelSelection`) for model data
- Auth store (`useAuth`) for tier checks (enterprise gating for image output toggle)

## Related Features

This enhancement complements existing features:
- **Image Output Toggle:** Enterprise users can enable/disable image generation
- **Model Badges:** UI shows "IMAGE GENERATION" badge in model catalog
- **Image Output Detection:** Backend validates model capabilities

## Future Considerations

1. **Accessibility:** Current implementation provides visual feedback; consider adding screen reader announcements
2. **i18n:** Toast messages and placeholders should be localized when internationalization is added
3. **Customization:** Could allow users to customize placeholder text in settings
4. **Analytics:** Track how often users select image generation models after seeing the toast

## Files Changed

- `components/chat/MessageInput.tsx`
- `tests/components/MessageInput.test.tsx`
- `tests/components/chat/MessageInput.image-gen-model.test.tsx` (new)

## Build Status

✅ Build successful  
✅ All tests passing  
✅ TypeScript compilation successful  
✅ No linting errors
