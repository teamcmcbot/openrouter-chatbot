# Collapsible ModelDetailsSidebar Implementation Plan

**Status:** In Progress  
**Priority:** Medium  
**Estimated Effort:** 1-2 days  
**Target Completion:** TBD

---

## ⚠️ Critical Design Principles

### 1. Mobile Behavior Preservation

**This feature MUST NOT affect mobile behavior in any way.**

### 2. Layout Strategy: Resize (Not Overlay)

**Rationale:** After evaluating both approaches:

- **Overlay Approach**: Sidebar floats over chat content
  - ❌ Hides messages during sidebar usage
  - ❌ Requires manual close to continue chatting
  - ❌ Interrupts user workflow
- **Layout Resize Approach**: Sidebar resizes within layout (SELECTED)
  - ✅ All content remains accessible
  - ✅ No workflow interruption
  - ✅ Matches professional tools (VS Code, IDEs)
  - ✅ Animation smoothness solvable with fast transitions (200ms)

**Implementation:** Parent container uses dynamic width with smooth 200ms cubic-bezier animation.

### Implementation Strategy Summary:

| Aspect           | Mobile (< 1024px)                             | Desktop (≥ 1024px)                  |
| ---------------- | --------------------------------------------- | ----------------------------------- |
| **State**        | `isDetailsSidebarOpenMobile`                  | `isDetailsSidebarOpenDesktop`       |
| **Control**      | `isOpen` prop (overlay visibility)            | Parent container width transition   |
| **Behavior**     | Overlay slide in/out                          | Collapse to thin trigger bar (10px) |
| **Animation**    | Standard slide (300ms)                        | Fast resize (200ms cubic-bezier)    |
| **Close Button** | `X` icon (closes overlay)                     | `→` icon (collapses sidebar)        |
| **Prop Value**   | Dynamic `isOpen={isDetailsSidebarOpenMobile}` | Fixed `isOpen={true}`               |
| **Changes**      | NONE - Keep 100% unchanged                    | New collapse logic in ChatInterface |

**Key Insight:** The `isOpen` prop is for mobile overlay positioning. Desktop collapse is handled by **parent container width transition**, not by the sidebar component's `isOpen` prop.

---

## Overview

This specification outlines the implementation of a collapsible ModelDetailsSidebar feature for the desktop chat interface. Currently, the ModelDetailsSidebar occupies 17.5% of the screen width on desktop and cannot be dismissed, even when empty or when the user doesn't need model information. This feature will give users control over their layout, allowing them to collapse the sidebar to gain more screen space for the chat interface.

---

## Problem Statement

### Current Behavior

On desktop (≥1024px viewport):

- The chat interface uses a fixed 3-column layout:
  - **Left:** ChatSidebar (15%, min-width: 200px)
  - **Middle:** ChatInterface (flex-1, ~67.5%)
  - **Right:** ModelDetailsSidebar (17.5%, min-width: 240px)
- The ModelDetailsSidebar is **always visible** (`isOpen={true}` hardcoded)
- When empty, it shows a placeholder message but still occupies 17.5% of screen width
- Users cannot dismiss or hide the sidebar, even for extended chat sessions where model details aren't needed

### User Pain Points

1. **Wasted screen space** when model details aren't actively needed
2. **No user control** over layout preferences
3. **Visual clutter** from persistent empty sidebar
4. **Limited chat area** for reading long conversations
5. **Reduced flexibility** compared to modern IDE and productivity tools

---

## Solution Overview

Implement a collapsible sidebar system that:

1. **Allows manual collapse/expand** via a close button in the sidebar header
2. **Preserves auto-expand behavior** when user selects a new model (keeps current UX)
3. **Remembers user preference** across sessions via localStorage
4. **Provides easy re-open access** via a compact trigger button
5. **Maintains responsive behavior** on mobile (no changes to mobile overlay behavior)

---

## ModelDetailsSidebar Purpose & Core Functionality

**⚠️ CRITICAL: These features MUST remain fully functional after collapse implementation**

### Primary Use Case 1: Model Selection Details

**Trigger:** User selects a model from the model dropdown

**Flow:**

1. User clicks model dropdown in ChatInterface header
2. Selects a model (e.g., "Claude 3.5 Sonnet")
3. `handleModelSelect()` is called
4. Sidebar automatically opens (if collapsed) via `showModelDetails(modelInfo, 'overview', undefined)`
5. Sidebar displays on **Overview tab**:
   - Model name and provider
   - Model description (expandable)
   - Context length
   - Supported parameters
   - Architecture details

**Code Reference (ChatInterface.tsx):**

```typescript
const handleModelSelect = (modelId: string) => {
  setSelectedModel(modelId);

  if (availableModels.length > 0) {
    const selectedModelInfo = availableModels.find(...);

    if (selectedModelInfo && typeof selectedModelInfo === 'object') {
      // Opens sidebar with model details on overview tab
      showModelDetails(selectedModelInfo, 'overview', undefined);
    }
  }
};
```

---

### Primary Use Case 2: Generation Cost Details

**Trigger:** User clicks generation ID link in assistant message

**Flow:**

1. Assistant message displays with a clickable generation ID (e.g., "gen-Abc123XYZ")
2. User clicks the generation ID link
3. `onModelClick(modelId, 'pricing', completionId)` is called
4. Sidebar automatically opens (if collapsed) via `showModelDetails(modelInfo, 'pricing', generationId)`
5. Sidebar switches to **Pricing tab**
6. API call to `/api/generation/${generationId}` fetches generation details
7. Displays actual costs for that specific generation:
   - Model used
   - Input tokens & cost
   - Output tokens & cost
   - Total cost
   - Cache hits (if applicable)
   - Reasoning tokens (if applicable)
   - Additional features used (web search, etc.)

**Code Reference (MessageList.tsx):**

```typescript
{
  message.role === "assistant" && message.completion_id && (
    <button
      onClick={() =>
        onModelClick?.(message.model!, "pricing", message.completion_id)
      }
      className="text-xs underline hover:text-blue-400"
      title={message.completion_id}
    >
      {message.completion_id}
    </button>
  );
}
```

**Code Reference (ModelDetailsSidebar.tsx):**

```typescript
// Fetch generation data when generationId changes and we're on pricing tab
useEffect(() => {
  const shouldFetch = generationId &&
                     activeTab === 'pricing' &&
                     isOpen &&
                     shouldAllowFetch &&
                     generationId !== lastFetchedGenerationIdRef.current;

  if (shouldFetch) {
    fetch(`/api/generation/${generationId}`)
      .then(response => response.json())
      .then(data => {
        setGenerationData(data.data?.data || data.data);
        setGenerationInCache(generationId, generationData); // Cache for instant reopen
      });
  }
}, [generationId, activeTab, isOpen, ...]);
```

---

### Additional Features

**Tab Navigation:**

- **Overview:** Model information, description, parameters
- **Pricing:** Model pricing structure OR specific generation costs (when generationId provided)
- **Capabilities:** Supported modalities, features, context window

**Hover Highlighting:**

- When hovering over generation ID in sidebar, corresponding message in chat gets highlighted
- `hoveredGenerationId` state syncs between sidebar and message list

**Generation Data Caching:**

- Fetched generation details cached in memory
- Instant display when reopening sidebar for same generation
- Reduces API calls and improves UX

---

## Current Implementation Analysis

### Layout Structure (ChatInterface.tsx)

```tsx
<div className="flex h-full overflow-visible mobile-safe-area">
  {/* Left Sidebar - Chat History (15%) */}
  <div className="hidden lg:block w-[15%] min-w-[200px]">
    <ChatSidebar isOpen={true} onClose={() => {}} onNewChat={handleNewChat} />
  </div>

  {/* Main Chat Area (67.5%) */}
  <div className="flex flex-col flex-1 lg:w-[67.5%] min-w-0 bg-slate-50 dark:bg-gray-800">
    {/* Chat interface content */}
  </div>

  {/* Right Sidebar - Model Details (17.5%) */}
  <div className="hidden lg:block w-[17.5%] min-w-[240px]">
    <ModelDetailsSidebar
      model={selectedDetailModel}
      isOpen={true} // ⚠️ HARDCODED - Always visible on desktop
      onClose={handleCloseDetailsSidebar}
      initialTab={selectedTab}
      generationId={selectedGenerationId}
      onGenerationHover={handleGenerationHover}
      onGenerationClick={handleGenerationClick}
      variant="desktop"
    />
  </div>
</div>
```

### Key Findings

1. **`isOpen` prop is hardcoded to `true`** on desktop
2. **`onClose` handler exists** but doesn't actually change state on desktop
3. **Mobile behavior is correct** - uses conditional overlay with state management
4. **Auto-expand logic works** - in `handleModelSelect()` function
5. **Model click from messages** - in `handleModelClickFromMessage()` already opens sidebar

### ⚠️ CRITICAL: Mobile Behavior Preservation

**The `isOpen` prop is designed for mobile overlay behavior and MUST NOT be changed for mobile.**

- **Mobile (< 1024px):** `isOpen` controls overlay visibility (slide in/out)
- **Desktop (≥ 1024px):** Collapse behavior handled by **parent container** width, NOT by `isOpen` prop

**Implementation Strategy:**

- Desktop collapse: Control via **parent container** `className` and conditional rendering
- Keep `isOpen={true}` for desktop ModelDetailsSidebar component (internal state)
- Only change `isOpen` prop value for mobile variant
- Mobile behavior remains 100% unchanged

---

## User Interaction Flows

### Flow 1: Initial State (First Visit)

```
User arrives at /chat page (desktop view)
├─ ModelDetailsSidebar shows empty state: "Select a model to view details"
├─ Sidebar is VISIBLE by default (current behavior maintained)
└─ User sees close button [X] in sidebar header (NEW)
```

**Design Decision:** Start with sidebar visible to maintain discoverability for new users.

---

### Flow 2: User Selects a Model (Auto-Expand) ✅ PRESERVE

**⚠️ CRITICAL: This must continue to work exactly as before**

```
User clicks model dropdown → selects "Claude 3.5 Sonnet"
├─ handleModelSelect() is called
├─ Sidebar automatically OPENS (if collapsed) ← MUST PRESERVE
├─ Shows model details (overview tab by default)
├─ Displays: name, description, context length, pricing, capabilities
└─ User can read model info, then optionally dismiss
```

**Why This Matters:**

- Users need instant access to model information when making selection decisions
- Auto-expand on model change is expected UX (current behavior)
- Collapsing sidebar should never interfere with model details display

**Current Code (ChatInterface.tsx lines ~157-180):**

```typescript
const handleModelSelect = (modelId: string) => {
  setSelectedModel(modelId);

  if (availableModels.length > 0) {
    const selectedModelInfo = availableModels.find((model) =>
      typeof model === "string" ? model === modelId : model.id === modelId
    );

    if (selectedModelInfo && typeof selectedModelInfo === "object") {
      showModelDetails(selectedModelInfo, "overview", undefined);
      // ☝️ This opens the sidebar - MUST CONTINUE TO WORK
    }
  }
};
```

**Implementation Note:** `showModelDetails()` already sets both mobile and desktop sidebar open states. No changes needed to preserve this behavior.

---

### Flow 3: User Clicks Generation ID (Auto-Expand + Fetch) ✅ PRESERVE

**⚠️ CRITICAL: Generation cost tracking must continue to work**

```
User sees assistant message with generation ID link
├─ Clicks on generation ID (e.g., "gen-Abc123XYZ")
├─ handleModelClickFromMessage() is called
├─ Sidebar automatically OPENS (if collapsed) ← MUST PRESERVE
├─ Switches to PRICING tab
├─ API call to /api/generation/{id} fetches cost details
├─ Displays actual costs:
│   ├─ Input tokens & cost
│   ├─ Output tokens & cost
│   ├─ Total cost
│   ├─ Cache usage (if applicable)
│   └─ Reasoning tokens (if applicable)
└─ User can review generation-specific costs
```

**Why This Matters:**

- Essential for cost tracking and transparency
- Users need to see actual costs per generation
- Generation details are cached for instant re-display
- Hover highlighting between message and sidebar must work

**Current Code (ChatInterface.tsx):**

```typescript
const handleModelClickFromMessage = (
  modelId: string,
  tab: 'overview' | 'pricing' | 'capabilities' = 'overview',
  generationId?: string
) => {
  if (availableModels.length > 0) {
    const modelInfo = availableModels.find(...);

    if (modelInfo && typeof modelInfo === 'object') {
      showModelDetails(modelInfo, tab, generationId);
      // ☝️ This opens sidebar with specific tab and generation ID
      // MUST CONTINUE TO WORK - triggers API call in ModelDetailsSidebar
    }
  }
};
```

**Current Code (MessageList.tsx):**

```typescript
{
  message.role === "assistant" && message.completion_id && (
    <button
      onClick={() =>
        onModelClick?.(message.model!, "pricing", message.completion_id)
      }
      className="text-xs underline hover:text-blue-400"
    >
      {message.completion_id}
    </button>
  );
}
```

**Implementation Note:** The `showModelDetails()` store action will open the sidebar (desktop or mobile) and set the tab + generationId. ModelDetailsSidebar's useEffect will detect the generationId and fetch generation data. All existing logic preserved.

---

### Flow 4: User Collapses Sidebar (Manual Dismiss) 🆕 NEW

```
User clicks [→] close button in ModelDetailsSidebar header
├─ onClick handler calls toggleDetailsSidebar() or closeDetailsSidebar()
├─ Sidebar smoothly collapses (200ms transition)
│   ├─ Width animates: w-[17.5%] (min-w-[240px]) → w-10
│   └─ Content fades out during transition
├─ Main chat area expands to fill space (flex-1 handles this automatically)
├─ Collapsed state shows thin vertical bar (CollapsedSidebarTrigger)
└─ Preference saved to localStorage: 'detailsSidebar.collapsed' = true
```

**Visual States:**

**BEFORE (Expanded):**

```
┌────────────────────────────────────────────────────┐
│  Chat    │      Main Chat          │   Model       │
│  List    │      Interface          │   Details     │
│  15%     │      flex-1             │   17.5%       │
│          │                         │   [→] Close   │
│          │                         │   ┌─────────┐ │
│          │                         │   │ Info    │ │
└────────────────────────────────────────────────────┘
```

**AFTER (Collapsed):**

```
┌────────────────────────────────────────────────────┐
│  Chat    │      Main Chat (Expanded)              │▶│
│  List    │      Interface                         │ │
│  15%     │      flex-1 (more space)               │ │
│          │                                        │ │
│          │      [More room for messages]         │ │
└────────────────────────────────────────────────────┘
                                                     ↑
                                            Thin re-open bar
```

---

### Flow 5: User Re-Opens Sidebar 🆕 NEW

```
User clicks re-open trigger (vertical bar or floating button)
├─ onClick handler calls openDetailsSidebar() or toggleDetailsSidebar()
├─ Sidebar smoothly expands (200ms transition)
│   ├─ Width animates: w-10 → w-[17.5%] (min-w-[240px])
│   └─ Content fades in during transition
├─ Shows last viewed model details (state preserved in store)
├─ If generationId was set, generation data restored from cache (instant)
├─ Main chat area shrinks back to flex-1 with sidebar present
└─ Preference saved to localStorage: 'detailsSidebar.collapsed' = false
```

**Implementation Note:** All sidebar state (selectedModel, selectedTab, generationId) is preserved in Zustand store even when collapsed. Re-opening simply toggles visibility without losing context.

---

### Flow 6: Generation Hover Highlighting ✅ PRESERVE

```
User hovers over generation ID link in sidebar pricing section
├─ onGenerationHover(generationId) is called
├─ hoveredGenerationId state updates in store
├─ Corresponding assistant message in MessageList gets highlighted
└─ Visual feedback helps user correlate costs with messages
```

**Why This Matters:**

- Essential for connecting generation costs to specific messages
- Provides visual feedback across components
- Must work regardless of sidebar collapse state

**Implementation Note:** Hover handlers remain unchanged. When sidebar is collapsed, hover highlighting is not active (sidebar not visible), but when expanded, all hover behavior works as before.

---

### Flow 5: User Clicks Model Badge in Message

```
User reads chat history and clicks model badge in a message
├─ handleModelClickFromMessage() is called with modelId, tab, generationId
├─ Sidebar automatically OPENS (even if collapsed)
├─ Shows clicked model's details in specified tab
├─ Scrolls to specific generation if generationId provided
└─ User can review model info, then dismiss again if desired
```

**Current Code (ChatInterface.tsx lines ~182-195):**

```typescript
const handleModelClickFromMessage = (
  modelId: string,
  tab: "overview" | "pricing" | "capabilities" = "overview",
  generationId?: string
) => {
  if (availableModels.length > 0) {
    const modelInfo = availableModels.find((model) =>
      typeof model === "string" ? model === modelId : model.id === modelId
    );

    if (modelInfo && typeof modelInfo === "object") {
      showModelDetails(modelInfo, tab, generationId);
      // ⚠️ This should also open the sidebar if collapsed
    }
  }
};
```

**Proposed Change:** Ensure this function calls `openDetailsSidebar()` on desktop.

---

## Implementation Details

### Phase 1: State Management

#### 1.1 Update Zustand Store (`stores/detailsSidebarStore.ts`)

**Current Store Structure:**

```typescript
interface DetailsSidebarState {
  selectedDetailModel: ModelInfo | null;
  isDetailsSidebarOpen: boolean;  // Currently only used for mobile overlay
  selectedTab: 'overview' | 'pricing' | 'capabilities';
  selectedGenerationId: string | undefined;
  hoveredGenerationId: string | undefined;

  showModelDetails: (model: ModelInfo, tab?: ..., generationId?: string) => void;
  closeDetailsSidebar: () => void;
  setHoveredGenerationId: (id: string | undefined) => void;
}
```

**Proposed Changes:**

```typescript
interface DetailsSidebarState {
  selectedDetailModel: ModelInfo | null;

  // RENAMED for clarity
  isDetailsSidebarOpenMobile: boolean;    // Mobile overlay state
  isDetailsSidebarOpenDesktop: boolean;   // NEW: Desktop collapse state

  selectedTab: 'overview' | 'pricing' | 'capabilities';
  selectedGenerationId: string | undefined;
  hoveredGenerationId: string | undefined;

  // NEW: Smart expansion tracking
  lastCollapseTime: number | null;        // Timestamp when user manually collapsed

  // Existing actions
  showModelDetails: (model: ModelInfo, tab?: ..., generationId?: string) => void;
  closeDetailsSidebar: () => void;  // Will handle both mobile and desktop
  setHoveredGenerationId: (id: string | undefined) => void;

  // NEW actions
  openDetailsSidebar: () => void;         // Explicitly open sidebar
  toggleDetailsSidebar: () => void;       // Toggle open/closed state (tracks collapse time)
  setDesktopSidebarOpen: (isOpen: boolean) => void;  // Direct setter
}
```

**Implementation:**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useDetailsSidebar = create(
  persist<DetailsSidebarState>(
    (set, get) => ({
      selectedDetailModel: null,
      isDetailsSidebarOpenMobile: false,
      isDetailsSidebarOpenDesktop: true, // Default: visible
      selectedTab: "overview",
      selectedGenerationId: undefined,
      hoveredGenerationId: undefined,
      lastCollapseTime: null, // No recent collapse

      showModelDetails: (model, tab = "overview", generationId) => {
        set({
          selectedDetailModel: model,
          selectedTab: tab,
          selectedGenerationId: generationId,
          isDetailsSidebarOpenMobile: true, // Open on mobile when details shown
          isDetailsSidebarOpenDesktop: true, // Open on desktop when details shown
        });
      },

      closeDetailsSidebar: () => {
        // Determine if we're on mobile or desktop
        const isMobile =
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 1023px)").matches;

        if (isMobile) {
          set({ isDetailsSidebarOpenMobile: false });
        } else {
          set({ isDetailsSidebarOpenDesktop: false });
        }
      },

      openDetailsSidebar: () => {
        const isMobile =
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 1023px)").matches;

        if (isMobile) {
          set({ isDetailsSidebarOpenMobile: true });
        } else {
          set({ isDetailsSidebarOpenDesktop: true });
        }
      },

      toggleDetailsSidebar: () => {
        const state = get();
        const isMobile =
          typeof window !== "undefined" &&
          window.matchMedia("(max-width: 1023px)").matches;

        if (isMobile) {
          set({
            isDetailsSidebarOpenMobile: !state.isDetailsSidebarOpenMobile,
          });
        } else {
          // Track collapse time for smart expansion
          const isCollapsing = state.isDetailsSidebarOpenDesktop;
          set({
            isDetailsSidebarOpenDesktop: !state.isDetailsSidebarOpenDesktop,
            lastCollapseTime: isCollapsing ? Date.now() : null,
          });
        }
      },

      setDesktopSidebarOpen: (isOpen: boolean) => {
        set({ isDetailsSidebarOpenDesktop: isOpen });
      },

      setHoveredGenerationId: (id) => {
        set({ hoveredGenerationId: id });
      },
    }),
    {
      name: "details-sidebar-storage",
      partialize: (state) => ({
        // Only persist desktop collapse state, not collapse time
        isDetailsSidebarOpenDesktop: state.isDetailsSidebarOpenDesktop,
      }),
    }
  )
);
```

**Key Design Decisions:**

1. **Separate mobile/desktop state** for clarity and independent control
2. **Persist desktop state** to remember user preference across sessions
3. **Auto-detect device type** in action handlers for convenience
4. **Default to visible** on first visit for discoverability

---

### Phase 2: Update ChatInterface Component

#### 2.1 Import New Store Actions

**File:** `components/chat/ChatInterface.tsx`

**Current (lines ~24-31):**

```typescript
const {
  selectedDetailModel,
  isDetailsSidebarOpen,
  selectedTab,
  selectedGenerationId,
  hoveredGenerationId,
  showModelDetails,
  closeDetailsSidebar,
  setHoveredGenerationId,
} = useDetailsSidebar();
```

**Proposed:**

```typescript
const {
  selectedDetailModel,
  isDetailsSidebarOpenMobile,
  isDetailsSidebarOpenDesktop,
  selectedTab,
  selectedGenerationId,
  hoveredGenerationId,
  showModelDetails,
  closeDetailsSidebar,
  openDetailsSidebar, // NEW
  toggleDetailsSidebar, // NEW
  setHoveredGenerationId,
} = useDetailsSidebar();
```

---

#### 2.2 Update Desktop Sidebar Layout

**Current (lines ~433-446):**

````typescript
#### 2.2 Update Desktop Sidebar Layout

**Current (lines ~433-446):**

```typescript
{
  /* Right Sidebar - Model Details (17.5%) */
}
<div className="hidden lg:block w-[17.5%] min-w-[240px]">
  <ModelDetailsSidebar
    model={selectedDetailModel}
    isOpen={true} // ⚠️ HARDCODED - Always visible on desktop
    onClose={handleCloseDetailsSidebar}
    initialTab={selectedTab}
    generationId={selectedGenerationId}
    onGenerationHover={handleGenerationHover}
    onGenerationClick={handleGenerationClick}
    variant="desktop"
  />
</div>;
````

**Proposed (FINAL APPROACH - Layout Resize with Fast Animation):**

```typescript
{
  /* Right Sidebar - Model Details (Collapsible) */
}
<div
  className={`hidden lg:block transition-all duration-200 ease-in-out ${
    isDetailsSidebarOpenDesktop ? "w-[17.5%] min-w-[240px]" : "w-10"
  }`}
>
  {isDetailsSidebarOpenDesktop ? (
    <ModelDetailsSidebar
      model={selectedDetailModel}
      isOpen={true} // ⚠️ KEEP TRUE - isOpen is for mobile overlay behavior only
      onClose={toggleDetailsSidebar} // Wire up desktop toggle handler
      initialTab={selectedTab}
      generationId={selectedGenerationId}
      onGenerationHover={handleGenerationHover}
      onGenerationClick={handleGenerationClick}
      variant="desktop"
    />
  ) : (
    <CollapsedSidebarTrigger onExpand={toggleDetailsSidebar} />
  )}
</div>;
```

**Key Changes:**

1. **Fast Animation**: `duration-200` (200ms) instead of 300ms for imperceptible text reflow
2. **Smooth Easing**: `ease-in-out` provides natural acceleration/deceleration
3. **Layout Resize**: ChatInterface (flex-1) automatically expands when sidebar collapses
4. **Parent Control**: Container width transitions between `w-[17.5%]` (open) and `w-10` (collapsed)
5. **`isOpen` Unchanged**: Always `true` when desktop sidebar is visible - preserves mobile logic

**Why This Approach:**

- ✅ Content never hidden - all messages remain accessible
- ✅ No workflow interruption - user can continue chatting
- ✅ Fast animation (200ms) prevents jarring text reflow
- ✅ Matches professional tool patterns (VS Code, Chrome DevTools)
- ✅ Mobile behavior 100% preserved

---

#### 2.3 Update Model Selection Handler (with Smart Expansion)

**Current (lines ~157-180):**

```typescript
const handleModelSelect = (modelId: string) => {
  setSelectedModel(modelId);

  if (availableModels.length > 0) {
    const selectedModelInfo = availableModels.find((model) =>
      typeof model === "string" ? model === modelId : model.id === modelId
    );

    if (selectedModelInfo && typeof selectedModelInfo === "object") {
      showModelDetails(selectedModelInfo, "overview", undefined);

      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (!isDesktop) {
        closeDetailsSidebar();
      }
    }
  }
};
```

**Proposed (with Smart Expansion Logic):**

```typescript
const handleModelSelect = (modelId: string) => {
  setSelectedModel(modelId);

  if (availableModels.length > 0) {
    const selectedModelInfo = availableModels.find((model) =>
      typeof model === "string" ? model === modelId : model.id === modelId
    );

    if (selectedModelInfo && typeof selectedModelInfo === "object") {
      // Smart expansion: respect user intent if they just collapsed sidebar
      const store = useDetailsSidebar.getState();
      const timeSinceCollapse = Date.now() - (store.lastCollapseTime || 0);
      const shouldRespectCollapse = timeSinceCollapse < 30000; // 30 seconds

      if (shouldRespectCollapse && !store.isDetailsSidebarOpenDesktop) {
        // User recently collapsed - don't auto-expand, just update data
        set({
          selectedDetailModel: selectedModelInfo,
          selectedTab: "overview",
          selectedGenerationId: undefined,
        });
      } else {
        // Normal flow: auto-expand sidebar with model details
        showModelDetails(selectedModelInfo, "overview", undefined);
      }
    }
  }
};
```

**Smart Expansion Rationale:**

- If user manually collapsed sidebar < 30s ago, respect their intent
- Don't immediately re-expand on next model selection
- After 30s cooldown, resume normal auto-expand behavior
- Prevents annoying "whack-a-mole" experience

---

#### 2.4 Update Model Click Handler

**Current (lines ~182-195):**

```typescript
const handleModelClickFromMessage = (
  modelId: string,
  tab: "overview" | "pricing" | "capabilities" = "overview",
  generationId?: string
) => {
  if (availableModels.length > 0) {
    const modelInfo = availableModels.find((model) =>
      typeof model === "string" ? model === modelId : model.id === modelId
    );

    if (modelInfo && typeof modelInfo === "object") {
      showModelDetails(modelInfo, tab, generationId);
    }
  }
};
```

**Proposed:** No changes needed - `showModelDetails` handles opening.

---

#### 2.5 Update Mobile Sidebar

**Current (lines ~459-469):**

```typescript
{
  /* Mobile Model Details Sidebar */
}
<div className="lg:hidden">
  <ModelDetailsSidebar
    model={selectedDetailModel}
    isOpen={isDetailsSidebarOpen}
    onClose={handleCloseDetailsSidebar}
    initialTab={selectedTab}
    generationId={selectedGenerationId}
    onGenerationHover={handleGenerationHover}
    onGenerationClick={handleGenerationClick}
    variant="mobile"
  />
</div>;
```

**Proposed:**

```typescript
{
  /* Mobile Model Details Sidebar - NO CHANGES TO BEHAVIOR */
}
<div className="lg:hidden">
  <ModelDetailsSidebar
    model={selectedDetailModel}
    isOpen={isDetailsSidebarOpenMobile} // ⚠️ Use mobile-specific state
    onClose={closeDetailsSidebar} // Handler already detects mobile
    initialTab={selectedTab}
    generationId={selectedGenerationId}
    onGenerationHover={handleGenerationHover}
    onGenerationClick={handleGenerationClick}
    variant="mobile"
  />
</div>;
```

**⚠️ CRITICAL: Mobile Behavior Unchanged**

The mobile sidebar MUST continue to work exactly as before:

- `isOpen={isDetailsSidebarOpenMobile}` controls overlay visibility
- `variant="mobile"` triggers overlay positioning and animations
- `onClose` handler detects mobile and only updates `isDetailsSidebarOpenMobile`
- Desktop collapse logic has ZERO impact on mobile behavior
}
<div className="lg:hidden">
  <ModelDetailsSidebar
    model={selectedDetailModel}
    isOpen={isDetailsSidebarOpenMobile} // Use mobile-specific state
    onClose={closeDetailsSidebar} // Handler already detects mobile
    initialTab={selectedTab}
    generationId={selectedGenerationId}
    onGenerationHover={handleGenerationHover}
    onGenerationClick={handleGenerationClick}
    variant="mobile"
  />
</div>;

````

---

### Phase 3: Update ModelDetailsSidebar Component

**⚠️ CRITICAL: Minimal Changes to ModelDetailsSidebar**

The ModelDetailsSidebar component's `isOpen` prop is designed for **mobile overlay behavior** and should NOT be modified for desktop collapse functionality.

**Desktop Collapse Strategy:**
- ✅ Parent container (`ChatInterface.tsx`) controls desktop visibility
- ✅ Conditional rendering: Show sidebar OR collapsed trigger
- ✅ ModelDetailsSidebar always receives `isOpen={true}` on desktop
- ❌ DO NOT modify ModelDetailsSidebar's internal `isOpen` logic

**Mobile Behavior Preservation:**
- ✅ `isOpen` prop controls overlay slide in/out on mobile
- ✅ `variant="mobile"` prop determines mobile-specific styling
- ✅ No changes to mobile overlay positioning or animations
- ✅ Mobile uses `isDetailsSidebarOpenMobile` state

---

#### 3.1 Add Close Button to Header (Desktop Only)

**File:** `components/ui/ModelDetailsSidebar.tsx`

**Changes Required:**
1. Add close button for **desktop variant only**
2. Keep existing mobile close button unchanged
3. Use `variant` prop to differentiate button styles and behavior

**Current Header Section (approximate lines ~195-220):**

```typescript
<div className="h-full flex flex-col">
  {!model ? (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
        <InformationCircleIcon className="w-8 h-8" />
      </div>
      <p className="text-gray-900 dark:text-white font-medium">
        Select a model to view details
      </p>
    </div>
  ) : (
    <>{/* Tabs and content */}</>
  )}
</div>
````

**Proposed Changes:**

1. **Add close button in header** (when model is selected):

```typescript
import { XMarkIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

<div className="h-full flex flex-col">
  {!model ? (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      {/* Empty state */}
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
        <InformationCircleIcon className="w-8 h-8" />
      </div>
      <p className="text-gray-900 dark:text-white font-medium mb-2">
        Select a model to view details
      </p>

      {/* NEW: Close button available even when empty (desktop only) */}
      {variant === "desktop" && (
        <button
          onClick={onClose}
          className="mt-4 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Hide this panel
        </button>
      )}
    </div>
  ) : (
    <>
      {/* Header with close button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Model Details
        </h3>

        {/* Close button */}
        {variant === "desktop" && (
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white
                     hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label="Hide model details"
            title="Hide model details (you can re-open anytime)"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        )}

        {/* Mobile close button (existing behavior) */}
        {variant === "mobile" && (
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white
                     hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Rest of content */}
      {/* Tabs and details */}
    </>
  )}
</div>;
```

---

#### 3.2 Internal State - No Changes Needed

**⚠️ IMPORTANT: DO NOT modify ModelDetailsSidebar's `isOpen` handling**

The sidebar's internal behavior should remain unchanged:

- The component's `isOpen` prop is for mobile overlay positioning
- Desktop collapse is handled entirely by the parent container
- No modifications needed to the main container className logic
- Existing mobile animations and transitions remain intact

**Current Implementation (KEEP AS-IS):**

```typescript
<div
  className={`h-full mobile-safe-area bg-slate-50 dark:bg-gray-800 
              border-l border-gray-200 dark:border-gray-700 
              transition-all duration-300 ease-in-out overflow-hidden
              lg:relative lg:block lg:w-full
              ${
                isOpen
                  ? "fixed inset-y-0 right-0 z-50 lg:relative lg:z-auto"
                  : "hidden lg:block"
              }
            `}
>
  {/* Content */}
</div>
```

**Why no changes?**

- `isOpen` controls mobile overlay behavior (fixed positioning, z-index)
- Desktop version is always `lg:block` regardless of `isOpen`
- Parent container conditional rendering handles desktop collapse
- Keeps mobile and desktop concerns completely separated

---

#### 3.3 Generation Data Fetching - MUST Remain Functional ⚠️

**CRITICAL: The generation data fetching logic in ModelDetailsSidebar MUST continue to work**

**Current Implementation (lines ~100-170 in ModelDetailsSidebar.tsx):**

```typescript
// Fetch generation data when generationId changes and we're on pricing tab
useEffect(() => {
  const shouldAllowFetch = isDesktop
    ? variant === "desktop"
    : variant === "mobile";

  const shouldFetch =
    generationId &&
    activeTab === "pricing" &&
    isOpen && // ⚠️ IMPORTANT: Checks isOpen
    shouldAllowFetch &&
    generationId !== lastFetchedGenerationIdRef.current;

  // Check cache first for instant display
  if (generationId && activeTab === "pricing" && isOpen && shouldAllowFetch) {
    const cached = getGenerationFromCache(generationId);
    if (cached) {
      setGenerationData(cached);
      return;
    }
  }

  if (shouldFetch) {
    fetch(`/api/generation/${generationId}`)
      .then((response) => response.json())
      .then((data) => {
        const generationData = data.data?.data || data.data;
        setGenerationData(generationData);
        setGenerationInCache(generationId, generationData); // Cache for reuse
      });
  }
}, [generationId, activeTab, isOpen, isDesktop, model?.id, variant]);
```

**Why This Works With Our Implementation:**

1. **Desktop sidebar always has `isOpen={true}`** when visible

   - Parent container controls visibility via conditional rendering
   - When sidebar is rendered, `isOpen` is always `true`
   - Generation fetch works normally

2. **When sidebar is collapsed:**

   - Sidebar component is **NOT rendered** (conditional rendering)
   - No fetch happens (component unmounted)
   - This is correct behavior - no point fetching when not visible

3. **When sidebar re-expands:**

   - Component remounts OR becomes visible
   - If generationId still set, fetch triggers
   - Cache checked first for instant display
   - User sees generation data immediately (from cache) or after brief fetch

4. **Mobile behavior unchanged:**
   - `isOpen` controls mobile overlay
   - Fetch only happens when overlay is open
   - Same logic as before

**Testing Checklist:**

- [ ] Click generation ID → sidebar opens → generation data fetches and displays
- [ ] Collapse sidebar → re-expand → generation data restored from cache (instant)
- [ ] Switch between generations → each fetches and caches independently
- [ ] Hover over generation in sidebar → corresponding message highlights
- [ ] Mobile overlay → generation fetch works same as before

---

### Phase 4: Create Collapsed Trigger Component

#### 4.1 CollapsedSidebarTrigger Component

**File:** `components/ui/CollapsedSidebarTrigger.tsx` (NEW)

```typescript
"use client";

import {
  ChevronLeftIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

interface CollapsedSidebarTriggerProps {
  onExpand: () => void;
}

export function CollapsedSidebarTrigger({
  onExpand,
}: CollapsedSidebarTriggerProps) {
  return (
    <div
      className="h-full w-10 bg-gray-100 dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 
                 flex flex-col items-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700
                 transition-colors duration-200"
      onClick={onExpand}
      role="button"
      aria-label="Show model details"
      title="Click to show model details"
    >
      {/* Expand icon at top */}
      <div className="mt-4 p-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600">
        <ChevronLeftIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </div>

      {/* Vertical text */}
      <div className="flex-1 flex items-center">
        <div className="transform -rotate-90 whitespace-nowrap text-xs font-medium text-gray-600 dark:text-gray-400">
          Model Details
        </div>
      </div>

      {/* Info icon at bottom */}
      <div className="mb-4 p-1.5">
        <InformationCircleIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
      </div>
    </div>
  );
}

export default CollapsedSidebarTrigger;
```

**Visual Design:**

```
┌──┐
│ ◀│  ← Expand icon (ChevronLeft)
│  │
│ M│
│ o│
│ d│  ← Rotated text "Model Details"
│ e│
│ l│
│  │
│ ℹ│  ← Info icon
└──┘
   10px wide
```

---

### Phase 5: CSS Transitions & Animations

#### 5.1 Tailwind Classes for Smooth Transitions

**Parent Container:**

```typescript
className = "transition-all duration-300 ease-in-out";
```

**Width Animation:**

```typescript
// Expanded
className = "w-[17.5%] min-w-[240px]";

// Collapsed
className = "w-10";
```

**Content Fade:**

```typescript
// In ModelDetailsSidebar
className={`transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
```

#### 5.2 Preserve Main Chat Scroll Position

Ensure the main chat area doesn't jump when sidebar collapses/expands:

**ChatInterface.tsx - Message List Container:**

```typescript
<div className="flex-1 min-h-0">
  {/* Message list maintains scroll position automatically via flex-1 */}
  <MessageList
    messages={messages}
    // ... other props
  />
</div>
```

No additional code needed - `flex-1` handles this automatically.

---

### Phase 6: Testing & Validation

#### 6.1 Manual Testing Checklist

**Functional Tests:**

- [ ] Sidebar starts visible on first visit (default state)
- [ ] Close button appears in sidebar header
- [ ] Clicking close button collapses sidebar smoothly
- [ ] Collapsed trigger bar appears when sidebar is collapsed
- [ ] Clicking trigger bar expands sidebar smoothly
- [ ] Selecting new model from dropdown opens sidebar (if collapsed)
- [ ] Clicking model badge in message opens sidebar (if collapsed)
- [ ] State persists across page refreshes (localStorage)
- [ ] Main chat area expands when sidebar collapses
- [ ] Scroll position preserved during collapse/expand
- [ ] No layout shift or flicker during transitions

**Responsive Tests:**

- [ ] **Mobile behavior unchanged** (overlay, no collapse feature)
- [ ] **Mobile overlay slides in** when model selected
- [ ] **Mobile overlay slides out** when close button clicked
- [ ] **Mobile backdrop dismisses** sidebar when clicked
- [ ] **Mobile z-index correct** (overlay above chat content)
- [ ] Tablet (1024px) shows desktop behavior
- [ ] Resize browser window maintains correct layout
- [ ] Mobile → Desktop transition handles state correctly
- [ ] Desktop → Mobile transition preserves mobile overlay behavior

**⚠️ CRITICAL Mobile Tests:**

- [ ] **Mobile `isOpen` prop works** (controls overlay visibility)
- [ ] **Mobile close button (X icon) functions** correctly
- [ ] **Mobile variant styling applied** (fixed positioning, slide animation)
- [ ] **Mobile state separate from desktop** (collapsing desktop doesn't affect mobile)
- [ ] **Mobile overlay backdrop** appears and dismisses correctly
- [ ] **Mobile sidebar width** (w-64 or similar) not affected by desktop logic
- [ ] **Touch gestures work** (swipe to dismiss if implemented)
- [ ] **Mobile safe-area padding** preserved

**Visual Tests:**

- [ ] Transitions are smooth (300ms duration)
- [ ] No overflow or clipping during animation
- [ ] Dark mode works correctly
- [ ] Hover states work on close button and trigger bar
- [ ] Icons display correctly
- [ ] Text is readable in collapsed trigger

**Edge Cases:**

- [ ] Sidebar collapse works when model is selected
- [ ] Sidebar collapse works when sidebar is empty
- [ ] Rapid clicking close/open doesn't break layout
- [ ] Multiple tab switches while collapsed
- [ ] Switching conversations while collapsed

**⚠️ CRITICAL: Core Functionality Tests (MUST PASS)**

- [ ] **Model selection opens sidebar** and displays model details (overview tab)
- [ ] **Generation ID click opens sidebar** and displays cost details (pricing tab)
- [ ] **Generation data fetches** when clicking generation ID
- [ ] **Generation data caches** for instant re-display
- [ ] **Hover highlighting works** between sidebar and message list
- [ ] **Tab switching works** (overview, pricing, capabilities)
- [ ] **Model description expandable** when long
- [ ] **Pricing displays correctly** (per token, per image, per request formats)
- [ ] **Generation cost breakdown** shows all fields (input/output tokens, cache, reasoning)
- [ ] **API error handling** for missing/unavailable generations
- [ ] **Multiple generations** can be viewed by clicking different IDs
- [ ] **Collapsed → generation ID click → sidebar opens** with data
- [ ] **Model change while generation displayed → generation data clears**

#### 6.2 Automated Tests

**Unit Tests:**

```typescript
// stores/detailsSidebarStore.test.ts
describe("DetailsSidebarStore", () => {
  it("should start with desktop sidebar open by default", () => {
    const { result } = renderHook(() => useDetailsSidebar());
    expect(result.current.isDetailsSidebarOpenDesktop).toBe(true);
  });

  it("should start with mobile sidebar closed by default", () => {
    const { result } = renderHook(() => useDetailsSidebar());
    expect(result.current.isDetailsSidebarOpenMobile).toBe(false);
  });

  it("should toggle desktop sidebar state without affecting mobile", () => {
    const { result } = renderHook(() => useDetailsSidebar());
    const initialMobile = result.current.isDetailsSidebarOpenMobile;

    act(() => result.current.setDesktopSidebarOpen(false));

    expect(result.current.isDetailsSidebarOpenDesktop).toBe(false);
    expect(result.current.isDetailsSidebarOpenMobile).toBe(initialMobile); // Unchanged
  });

  it("should persist desktop sidebar state to localStorage", () => {
    const { result } = renderHook(() => useDetailsSidebar());
    act(() => result.current.setDesktopSidebarOpen(false));

    // Simulate page reload
    const { result: newResult } = renderHook(() => useDetailsSidebar());
    expect(newResult.current.isDetailsSidebarOpenDesktop).toBe(false);
  });

  it("should open sidebar when showModelDetails is called", () => {
    const { result } = renderHook(() => useDetailsSidebar());
    act(() => result.current.setDesktopSidebarOpen(false));

    const mockModel = { id: "test-model", name: "Test Model" };
    act(() => result.current.showModelDetails(mockModel));

    expect(result.current.isDetailsSidebarOpenDesktop).toBe(true);
  });
});
```

**Integration Tests:**

```typescript
// components/chat/ChatInterface.test.tsx
describe("ChatInterface - Collapsible Sidebar", () => {
  it("should collapse sidebar when close button clicked", () => {
    render(<ChatInterface />);

    const closeButton = screen.getByLabelText("Hide model details");
    fireEvent.click(closeButton);

    expect(screen.getByLabelText("Show model details")).toBeInTheDocument();
  });

  it("should expand sidebar when trigger clicked", () => {
    render(<ChatInterface />);

    // Collapse first
    fireEvent.click(screen.getByLabelText("Hide model details"));

    // Then expand
    fireEvent.click(screen.getByLabelText("Show model details"));

    expect(screen.getByLabelText("Hide model details")).toBeInTheDocument();
  });

  it("should auto-expand sidebar when model selected", () => {
    render(<ChatInterface />);

    // Collapse sidebar
    fireEvent.click(screen.getByLabelText("Hide model details"));

    // Select a model
    const modelDropdown = screen.getByRole("button", { name: /select model/i });
    fireEvent.click(modelDropdown);
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));

    // Sidebar should be expanded
    expect(screen.getByLabelText("Hide model details")).toBeInTheDocument();
  });
});
```

**Mobile-Specific Integration Tests:**

```typescript
// components/chat/ChatInterface.mobile.test.tsx
describe("ChatInterface - Mobile Sidebar Behavior", () => {
  beforeEach(() => {
    // Mock mobile viewport
    Object.defineProperty(window, "matchMedia", {
      value: jest.fn().mockImplementation((query) => ({
        matches: query === "(max-width: 1023px)",
        media: query,
      })),
    });
  });

  it("should show mobile overlay when model selected", () => {
    render(<ChatInterface />);

    // Select a model
    const modelDropdown = screen.getByRole("button", { name: /select model/i });
    fireEvent.click(modelDropdown);
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));

    // Mobile sidebar should open as overlay
    const mobileSidebar = screen.getByTestId("mobile-model-details");
    expect(mobileSidebar).toHaveClass("fixed", "inset-y-0", "right-0", "z-50");
  });

  it("should close mobile overlay when X button clicked", () => {
    render(<ChatInterface />);

    // Open mobile sidebar
    fireEvent.click(screen.getByRole("button", { name: /select model/i }));
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));

    // Close with X button
    const closeButton = screen.getByLabelText("Close");
    fireEvent.click(closeButton);

    // Sidebar should be hidden
    expect(screen.queryByTestId("mobile-model-details")).not.toBeVisible();
  });

  it("should close mobile overlay when backdrop clicked", () => {
    render(<ChatInterface />);

    // Open mobile sidebar
    fireEvent.click(screen.getByRole("button", { name: /select model/i }));
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));

    // Click backdrop
    const backdrop = screen.getByTestId("mobile-sidebar-backdrop");
    fireEvent.click(backdrop);

    // Sidebar should be hidden
    expect(screen.queryByTestId("mobile-model-details")).not.toBeVisible();
  });

  it("should NOT show collapse button on mobile", () => {
    render(<ChatInterface />);

    // Open mobile sidebar
    fireEvent.click(screen.getByRole("button", { name: /select model/i }));
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));

    // Desktop collapse button should not exist
    expect(
      screen.queryByLabelText("Hide model details")
    ).not.toBeInTheDocument();
    // Only mobile close button (X) should exist
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("should preserve mobile state when window resized", () => {
    const { rerender } = render(<ChatInterface />);

    // Open mobile sidebar
    fireEvent.click(screen.getByRole("button", { name: /select model/i }));
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));

    // Resize to desktop
    Object.defineProperty(window, "matchMedia", {
      value: jest.fn().mockImplementation((query) => ({
        matches: query === "(min-width: 1024px)",
        media: query,
      })),
    });

    rerender(<ChatInterface />);

    // Mobile state should not affect desktop rendering
    // Desktop sidebar should be visible (default state)
    expect(screen.getByLabelText("Hide model details")).toBeInTheDocument();
  });
});
```

**Core Functionality Integration Tests:**

```typescript
// components/chat/ChatInterface.functionality.test.tsx
describe("ChatInterface - Core ModelDetailsSidebar Functionality", () => {
  beforeEach(() => {
    // Mock API for generation data
    global.fetch = jest.fn((url) => {
      if (url.includes("/api/generation/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                id: "gen-123",
                model: "anthropic/claude-3.5-sonnet",
                native_tokens_prompt: 100,
                native_tokens_completion: 50,
                total_cost: 0.0025,
              },
            }),
        });
      }
      return Promise.reject(new Error("Not found"));
    });
  });

  it("should open sidebar and show model details when model selected", async () => {
    render(<ChatInterface />);

    // Collapse sidebar first
    fireEvent.click(screen.getByLabelText("Hide model details"));
    expect(screen.getByLabelText("Show model details")).toBeInTheDocument();

    // Select a model
    const modelDropdown = screen.getByRole("button", { name: /select model/i });
    fireEvent.click(modelDropdown);
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));

    // Sidebar should auto-expand
    expect(screen.getByLabelText("Hide model details")).toBeInTheDocument();

    // Should show overview tab by default
    expect(screen.getByText(/Model Details/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /overview/i })).toHaveClass(
      "active"
    );
  });

  it("should open sidebar and fetch generation data when generation ID clicked", async () => {
    const { container } = render(<ChatInterface />);

    // Assume there's an assistant message with generation ID
    const generationLink = screen.getByText("gen-123");

    // Collapse sidebar first
    fireEvent.click(screen.getByLabelText("Hide model details"));

    // Click generation ID
    fireEvent.click(generationLink);

    // Sidebar should auto-expand
    expect(screen.getByLabelText("Hide model details")).toBeInTheDocument();

    // Should show pricing tab
    expect(screen.getByRole("tab", { name: /pricing/i })).toHaveClass("active");

    // Should fetch and display generation data
    await waitFor(() => {
      expect(screen.getByText(/100.*tokens/i)).toBeInTheDocument(); // Input tokens
      expect(screen.getByText(/50.*tokens/i)).toBeInTheDocument(); // Output tokens
      expect(screen.getByText(/0\.0025/i)).toBeInTheDocument(); // Total cost
    });

    // API should have been called
    expect(global.fetch).toHaveBeenCalledWith("/api/generation/gen-123");
  });

  it("should cache generation data for instant re-display", async () => {
    render(<ChatInterface />);

    // Click generation ID first time
    const generationLink = screen.getByText("gen-123");
    fireEvent.click(generationLink);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText(/100.*tokens/i)).toBeInTheDocument();
    });

    const fetchCallCount = (global.fetch as jest.Mock).mock.calls.length;

    // Collapse sidebar
    fireEvent.click(screen.getByLabelText("Hide model details"));

    // Re-expand by clicking same generation ID
    fireEvent.click(generationLink);

    // Data should appear instantly (from cache)
    expect(screen.getByText(/100.*tokens/i)).toBeInTheDocument();

    // Should NOT make another API call (cached)
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(fetchCallCount);
  });

  it("should highlight message when hovering generation in sidebar", async () => {
    render(<ChatInterface />);

    // Click generation ID to open sidebar
    fireEvent.click(screen.getByText("gen-123"));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /pricing/i })).toHaveClass(
        "active"
      );
    });

    // Hover over generation ID in sidebar
    const sidebarGenerationId = screen.getAllByText("gen-123")[1]; // Second instance in sidebar
    fireEvent.mouseEnter(sidebarGenerationId);

    // Corresponding message should be highlighted
    const messageCard = screen.getByTestId("message-gen-123");
    expect(messageCard).toHaveClass("ring-2", "ring-blue-500");

    // Un-hover
    fireEvent.mouseLeave(sidebarGenerationId);
    expect(messageCard).not.toHaveClass("ring-2");
  });

  it("should preserve sidebar state when switching between collapsed/expanded", () => {
    render(<ChatInterface />);

    // Select a model and switch to capabilities tab
    fireEvent.click(screen.getByRole("button", { name: /select model/i }));
    fireEvent.click(screen.getByText("Claude 3.5 Sonnet"));
    fireEvent.click(screen.getByRole("tab", { name: /capabilities/i }));

    expect(screen.getByRole("tab", { name: /capabilities/i })).toHaveClass(
      "active"
    );

    // Collapse sidebar
    fireEvent.click(screen.getByLabelText("Hide model details"));

    // Re-expand
    fireEvent.click(screen.getByLabelText("Show model details"));

    // Should still be on capabilities tab
    expect(screen.getByRole("tab", { name: /capabilities/i })).toHaveClass(
      "active"
    );
    expect(screen.getByText(/Claude 3.5 Sonnet/i)).toBeInTheDocument();
  });
});
```

---

## Success Metrics

### User Experience Metrics

- **Layout flexibility:** Users can choose between 2-column and 3-column layouts
- **Screen space:** Up to 15% more chat area when sidebar collapsed (~240px @ 1920px width)
- **Discoverability:** Auto-expand on model selection maintains current UX
- **Persistence:** User preference remembered across sessions
- **Core functionality preserved:** Model details and generation costs remain fully accessible

### Technical Metrics

- **Performance:** No impact on render performance
- **API calls preserved:** Generation data fetching works identically
- **Cache effectiveness:** Generation data cached for instant re-display
- **State management:** Sidebar state (model, tab, generationId) preserved when collapsed
- **Animation smoothness:** 60fps transitions
- **Bundle size:** <2KB added (new component + state management)
- **Accessibility:** Keyboard navigable, screen reader friendly

---

## Future Enhancements (Out of Scope)

1. **Resizable Panels:** Allow users to drag borders to adjust widths
2. **Keyboard Shortcuts:** `Cmd/Ctrl + B` to toggle sidebar
3. **Preset Layouts:** Quick presets (Focus Mode, Balanced, Details Mode)
4. **Remember per-model:** Different collapse state per model
5. **Collapse Left Sidebar:** Apply same pattern to ChatSidebar
6. **Floating Mini View:** Show model name in floating badge when collapsed

---

## Migration & Rollout

### Phase 1: Development (1 day)

- Implement state management changes
- Update ChatInterface layout
- Create CollapsedSidebarTrigger component
- Add close button to ModelDetailsSidebar

### Phase 2: Testing (0.5 days)

- Manual testing on desktop and mobile
- **Verify model selection details display** (Use Case 1)
- **Verify generation cost fetching works** (Use Case 2)
- **Verify hover highlighting between sidebar and messages**
- **Verify generation data caching**
- Cross-browser testing (Chrome, Firefox, Safari, Edge)
- Responsive behavior validation
- Write automated tests

### Phase 3: Polish & Documentation (0.5 days)

- Refine animations and transitions
- Add tooltips and aria labels
- Update user documentation
- Create changelog entry

### Phase 4: Deployment

- Deploy to staging environment
- **QA validation focusing on core functionality:**
  - Model details display on selection
  - Generation cost tracking via ID clicks
  - API calls and caching behavior
  - Mobile overlay behavior unchanged
- Deploy to production
- Monitor user feedback

---

## Critical Success Criteria (Must Pass Before Deployment)

### ✅ Core Functionality Preserved

1. **Model Selection Details (Use Case 1)**

   - [ ] Selecting model from dropdown opens sidebar
   - [ ] Model details display correctly (name, description, pricing, capabilities)
   - [ ] Overview tab shows by default
   - [ ] All three tabs (overview, pricing, capabilities) work
   - [ ] Description expansion works for long descriptions

2. **Generation Cost Tracking (Use Case 2)**

   - [ ] Clicking generation ID opens sidebar
   - [ ] Sidebar switches to pricing tab automatically
   - [ ] API call to `/api/generation/{id}` triggers
   - [ ] Generation costs display correctly
   - [ ] All cost fields present (input/output tokens, cache, reasoning, total)
   - [ ] Error handling works for unavailable generations
   - [ ] Generation data caches for instant re-display

3. **Interactive Features**

   - [ ] Hover over generation ID highlights corresponding message
   - [ ] Tab switching works in all states
   - [ ] Multiple generations can be viewed sequentially
   - [ ] State preserved when collapsing/expanding sidebar

4. **Mobile Behavior**
   - [ ] Mobile overlay slides in/out correctly
   - [ ] All Use Case 1 & 2 functionality works on mobile
   - [ ] No interference from desktop collapse logic
   - [ ] Touch interactions work correctly

### ❌ Failure Criteria (Block Deployment)

- Model selection doesn't open sidebar
- Generation ID click doesn't fetch/display data
- API calls fail or don't trigger
- Generation data not cached
- Hover highlighting broken
- Mobile overlay broken
- Desktop collapse interferes with mobile behavior
- State lost when toggling sidebar

---

## Related Files

### To Modify:

- `stores/detailsSidebarStore.ts` - Add desktop collapse state
- `components/chat/ChatInterface.tsx` - Wire up collapse behavior
- `components/ui/ModelDetailsSidebar.tsx` - Add close button

### To Create:

- `components/ui/CollapsedSidebarTrigger.tsx` - Collapsed state UI
- `tests/stores/detailsSidebarStore.test.ts` - Store tests
- `tests/components/chat/ChatInterface.collapsible.test.tsx` - Integration tests

### To Update:

- `docs/features/model-details-sidebar.md` - Document collapse feature
- `CHANGELOG.md` - Add feature entry

---

## Questions & Decisions

### ✅ Resolved:

1. **Should sidebar start collapsed or expanded?**  
   → **Expanded** for discoverability (new users)

2. **Should we persist state across sessions?**  
   → **Yes** via localStorage

3. **Should mobile behavior change?**  
   → **No** - keep overlay behavior

4. **Width when collapsed?**  
   → **10px** thin trigger bar (alternative: 0px fully hidden)

5. **Auto-expand on model selection?**  
   → **Yes** - maintain current UX

### ⏳ Open Questions:

- None at this time

---

## Appendix

### A. Architecture Diagram - Mobile vs Desktop Separation

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChatInterface.tsx                        │
│                                                                 │
│  MOBILE (< 1024px)              │  DESKTOP (≥ 1024px)          │
│  ─────────────────              │  ───────────────────         │
│                                 │                               │
│  <div className="lg:hidden">   │  <div className="hidden      │
│    <ModelDetailsSidebar        │        lg:block w-[17.5%]">  │
│      isOpen={                  │    {isDetailsSidebar         │
│        isDetailsSidebar        │      OpenDesktop ? (         │
│        OpenMobile              │      <ModelDetailsSidebar    │
│      }                         │        isOpen={true}         │
│      variant="mobile"          │        variant="desktop"     │
│      onClose={                 │        onClose={toggle}      │
│        closeSidebar            │      />                      │
│      }                         │    ) : (                     │
│    />                          │      <CollapsedTrigger />    │
│  </div>                        │    )}                        │
│                                 │  </div>                      │
│  ↓                              │  ↓                           │
│  isOpen controls:               │  isOpen always true          │
│  - Overlay visibility           │  - Parent controls render    │
│  - Fixed positioning            │  - No overlay behavior       │
│  - Slide animation              │  - Conditional component     │
│  - Backdrop click               │  - Width transition          │
│                                 │                               │
└─────────────────────────────────────────────────────────────────┘

STATE MANAGEMENT (Zustand Store):
┌─────────────────────────────────────────────────────────────────┐
│  isDetailsSidebarOpenMobile     │  isDetailsSidebarOpenDesktop │
│  - Controls mobile overlay       │  - Controls desktop collapse │
│  - Not persisted                 │  - Persisted to localStorage │
│  - Default: false                │  - Default: true             │
│  - Independent from desktop      │  - Independent from mobile   │
└─────────────────────────────────────────────────────────────────┘
```

### B. Visual Mockups

_TODO: Add screenshots/mockups of:_

- Expanded state with close button
- Collapsed state with trigger bar
- Transition animation frames
- Mobile overlay (unchanged)

### C. Accessibility Considerations

**Keyboard Navigation:**

- Close button: `Tab` to focus, `Enter/Space` to activate
- Trigger bar: `Tab` to focus, `Enter/Space` to activate

**Screen Readers:**

- Close button: "Hide model details button. Press to collapse sidebar."
- Trigger bar: "Show model details button. Press to expand sidebar."
- Announce state changes: "Model details sidebar collapsed" / "expanded"

**ARIA Attributes:**

```typescript
// Close button
aria-label="Hide model details"
aria-expanded="true"

// Trigger bar
aria-label="Show model details"
aria-expanded="false"
role="button"
tabIndex={0}
```

### C. Browser Compatibility

- **Chrome/Edge:** Full support (Chromium)
- **Firefox:** Full support
- **Safari:** Full support (test iOS Safari specifically)
- **Minimum versions:** Last 2 major versions of each browser

---

**Document Version:** 1.0  
**Last Updated:** October 14, 2025  
**Author:** Development Team  
**Status:** Ready for Implementation
