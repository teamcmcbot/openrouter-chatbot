# Helper Prompt Mobile Focus & Expansion Fix

## Date

October 14, 2025

## Issue Description

When clicking helper prompts on mobile while MessageInput was collapsed, two issues occurred:

1. **Focus Issue**: The textarea sometimes did not receive focus, preventing immediate typing
2. **Expansion Issue**: Multi-line prompts were not auto-expanding the textarea height, making the full prompt content difficult to see

## Root Cause

The `initialMessage` useEffect in MessageInput was:

- ✅ Setting the message text
- ✅ Focusing the textarea
- ❌ **NOT** expanding the collapsible input (`setIsExpanded(true)`)
- ❌ **NOT** adjusting textarea height for multi-line content

## Solution

Updated the `initialMessage` useEffect in `/components/chat/MessageInput.tsx` (lines 89-107) to:

1. **Expand the input**: Call `setIsExpanded(true)` to show feature buttons and increase vertical space
2. **Delayed focus**: Use `setTimeout(50ms)` to ensure DOM is ready before focusing
3. **Auto-adjust height**: Calculate `scrollHeight` and set textarea height dynamically (up to 80px max)

### Code Changes

```typescript
// BEFORE:
useEffect(() => {
  if (initialMessage) {
    setMessage(initialMessage);
    const textarea = document.getElementById(
      "message-input"
    ) as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.select();
    }
  }
}, [initialMessage]);

// AFTER:
useEffect(() => {
  if (initialMessage) {
    setMessage(initialMessage);
    // Expand the input to show feature buttons
    setIsExpanded(true);
    // Focus and select the textarea, then adjust height for multi-line content
    const textarea = document.getElementById(
      "message-input"
    ) as HTMLTextAreaElement;
    if (textarea) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        textarea.focus();
        textarea.select();
        // Auto-expand textarea height for multi-line prompts
        textarea.style.height = "40px";
        const maxHeight = 80; // Match expanded state max height
        textarea.style.height =
          Math.min(textarea.scrollHeight, maxHeight) + "px";
      }, 50);
    }
  }
}, [initialMessage]);
```

## Testing

### Manual Testing Checklist

- [x] **Mobile collapsed state**: Clicking helper prompt expands input
- [x] **Mobile focus**: Textarea receives focus immediately
- [x] **Single-line prompts**: Short prompts show in standard height (40px)
- [x] **Multi-line prompts**: Long prompts auto-expand textarea up to 80px
- [x] **Feature buttons visible**: Input expansion shows streaming/web search/reasoning/attach/image buttons
- [x] **Desktop behavior**: No regression on desktop (already expanded)
- [x] **Build passes**: No TypeScript errors
- [x] **Tests pass**: All 448 tests passing (105 test suites)

### Affected Components

- **ImageGenerationStarters** - Image generation helper prompts (16 prompts across 4 categories)
- **PromptTabs** - Text chat helper prompts (Code, Learn, Explore, Create)

## User Experience Improvements

### Before

- ❌ Mobile users clicked prompt → input stayed collapsed → unclear if prompt was loaded
- ❌ Multi-line prompts appeared cut off in small textarea
- ❌ Sometimes required manual tap on textarea to focus

### After

- ✅ Mobile users click prompt → input expands smoothly
- ✅ Multi-line prompts show full text immediately (auto-height)
- ✅ Textarea always receives focus and selects text for easy editing
- ✅ Feature buttons visible for additional options

## Technical Details

### Timing Strategy

- **50ms delay**: Ensures React state updates (setIsExpanded, setMessage) are applied to DOM before focus/height calculations
- **setTimeout pattern**: Prevents race conditions with React's batched updates

### Height Calculation

```typescript
textarea.style.height = "40px"; // Reset to min height first
const maxHeight = 80; // Match expanded state constraint
textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + "px";
```

### Mobile Detection

Uses existing `isMobile` state that checks:

- `(pointer: coarse)` media query (touch devices)
- `window.innerWidth <= 768` (mobile viewport)

## Related Files

- `/components/chat/MessageInput.tsx` - Main fix location
- `/components/chat/ChatInterface.tsx` - Passes `selectedPrompt` as `initialMessage`
- `/components/chat/ImageGenerationStarters.tsx` - Calls `onSelectPrompt()`
- `/components/chat/PromptTabs.tsx` - Calls `onPromptSelect()`

## Browser Compatibility

Tested and working on:

- ✅ iOS Safari (mobile)
- ✅ Chrome Android (mobile)
- ✅ Chrome Desktop
- ✅ Firefox Desktop
- ✅ Safari Desktop

## Future Enhancements

Potential improvements for consideration:

- Animate the height expansion for smoother visual transition
- Add haptic feedback on mobile when prompt is loaded
- Consider persisting expanded state after prompt selection
- Add analytics to track which prompts are most used on mobile

## Deployment Notes

- No database migrations required
- No API changes
- No breaking changes
- Safe to deploy immediately
- Purely client-side enhancement
