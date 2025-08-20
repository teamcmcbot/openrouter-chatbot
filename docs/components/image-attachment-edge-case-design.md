# Image Attachment Edge Case: Design Implementation

## Overview

This document outlines the design implementation for the image attachment edge case where users upload images and then switch to a text-only model before sending.

## Design Goals Achieved

✅ **Prevent accidental sending** - Users cannot send images with incompatible models  
✅ **Clear visual indication** - Prominent banner explains the situation  
✅ **Highlighted model name** - Selected model name is emphasized in the message  
✅ **Consistent styling** - Works well on both desktop and mobile devices  
✅ **Fixed-width buttons** - Buttons maintain consistent sizing across devices  
✅ **Smart pluralization** - Text adapts based on single/multiple images  
✅ **Accessible design** - Proper focus states and contrast ratios

## Design Implementation

### Banner Layout

- **Container**: Rounded amber-toned warning banner with proper spacing
- **Structure**: Vertical layout with title, description, and action buttons
- **Responsive**: Stacks appropriately on mobile, inline on desktop

### Text Content

- **Single Message**: Model name in bold followed by explanation and options
- **Format**: "[Model Name] doesn't support image input. You can discard the [image/images] and send text only, or switch to a multimodal model."
- **Pluralization**: Automatically adapts text for single vs multiple images
- **Example**: "**Baidu: ERNIE 4.5 21B A3B** doesn't support image input. You can discard the image and send text only, or switch to a multimodal model."

### Button Design

- **Primary Action**: "Send without image(s)" - Amber button with hover states
- **Secondary Action**: "Switch model" - Outlined button with matching theme
- **Consistent Height**: Both buttons use `py-2.5` for uniform height across all screen sizes
- **Responsive Width**:
  - Mobile: Full-width buttons (flex-1)
  - Desktop: Fixed 128px width (sm:w-32)
- **States**: Proper disabled states when message is empty

### Accessibility Features

- **Focus Management**: Proper focus ring and offset colors
- **Color Contrast**: WCAG compliant contrast ratios
- **Semantic HTML**: Proper button roles and labels
- **Screen Reader**: Descriptive text for assistive technologies

## Technical Implementation

### Component Location

`/components/chat/MessageInput.tsx` - Lines 378-398

### Key Features

1. **Model Name Detection**: Dynamically retrieves and displays the selected model's human-readable name
2. **Attachment Count Awareness**: Adapts messaging based on number of uploaded images
3. **Action Integration**: Connects to existing handlers for sending and model selection
4. **State Management**: Properly disabled when message is empty

### Styling Classes

### Styling Classes

- **Container**: `rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20`
- **Primary Button**: `bg-blue-600 text-white hover:bg-blue-700`
- **Secondary Button**: `border border-blue-300 text-blue-700 bg-white hover:bg-blue-50`
- **Height Consistency**: `h-9 flex items-center justify-center` for absolute button height consistency

## User Experience Flow

1. **Upload Images**: User uploads one or more images with a multimodal model
2. **Switch Model**: User switches to a text-only model (e.g., GPT-4 → GPT-4)
3. **Banner Appears**: Clear warning banner with model name highlighted
4. **User Choices**:
   - **Send Text Only**: Discards images and sends message immediately
   - **Switch Model**: Opens model selector filtered to multimodal models
5. **Resolution**: User proceeds with their preferred choice

## Visual Design

### Color Scheme

- **Background**: Professional blue (`bg-blue-50`) with subtle transparency
- **Border**: Matching blue tones (`border-blue-200`)
- **Text**: High contrast blue for readability (`text-blue-800`, `text-blue-900`)
- **Dark Mode**: Adapted blue tones (`dark:bg-blue-900/20`, `dark:text-blue-200`)

### Typography

- **Title**: `text-sm font-medium` - Clear hierarchy
- **Description**: `text-xs` with `font-semibold` for model name emphasis
- **Buttons**: `text-xs font-medium` - Consistent with UI patterns

### Spacing

- **Container**: `px-3 py-2.5` - Balanced padding
- **Content Gap**: `gap-2.5` - Proper vertical rhythm
- **Button Gap**: `gap-2` - Comfortable button spacing

## Testing

### Test Coverage

- Component renders without errors ✅
- Banner appears with correct text ✅
- Model name highlighting works ✅
- Button text pluralization functions ✅

### Test File

`/tests/components/chat/MessageInput-image-banner.test.tsx`

## Implementation Notes

### Model Name Resolution

```typescript
const selectedModelData =
  Array.isArray(availableModels) && availableModels.length > 0
    ? (availableModels as ModelInfo[]).find(
        (m) => m && typeof m === "object" && "id" in m && m.id === selectedModel
      )
    : null;
return selectedModelData ? selectedModelData.name : selectedModel;
```

### Responsive Button Sizing

```typescript
className = "flex-1 sm:flex-none sm:w-32";
// Mobile: Full width (flex-1)
// Desktop: Fixed 128px width (sm:w-32)
```

### Smart Pluralization

```typescript
{
  attachments.length === 1 ? "image" : "images";
}
// Single: "Send without image"
// Multiple: "Send without images"
```

## Future Enhancements

1. **Animation**: Smooth slide-in animation for banner appearance
2. **Preview Thumbnails**: Show small previews in the banner
3. **Model Suggestions**: Recommend specific multimodal alternatives
4. **Batch Actions**: Handle multiple model switches more efficiently

---

**Status**: ✅ Implemented and Tested  
**Design Review**: ✅ Approved  
**Performance Impact**: Minimal - conditional rendering only  
**Accessibility**: ✅ WCAG 2.1 AA Compliant
