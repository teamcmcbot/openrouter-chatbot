# 3-Column Layout Implementation

## Overview

This document outlines the implementation of the 3-column layout for the OpenRouter Chatbot UI, achieving the 15%-70%-15% layout specification.

## Layout Structure

### Desktop Layout (md and above)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [15% Left Sidebar] [70% Chat Interface] [15% Right Sidebar]        │
│                                                                     │
│ • New Chat Button  • Header w/ Model Dropdown     • Model Details  │
│ • Chat History     • Message List                 • Tabs:          │
│ • Recent Chats     • Error Display (if any)       │  - Overview      │
│ • Edit/Delete      • Message Input Area           │  - Pricing       │
│   Chat History     •                              │  - Capabilities  │
│                    •                              • Placeholder     │
│                    •                              │ when no model   │
│                    •                              │ selected        │
└─────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (below md)

- **Left Sidebar**: Hidden by default, toggleable via hamburger menu
- **Chat Interface**: Full width with hamburger menu button in header
- **Right Sidebar**: Overlay when model details are shown

## Components Implemented

### 1. ChatSidebar (`components/ui/ChatSidebar.tsx`)

- **Purpose**: Left sidebar for chat management
- **Features**:
  - "New Chat" button
  - Chat history with sample data
  - Edit chat titles inline
  - Delete chats
  - Responsive (overlay on mobile, fixed on desktop)
- **Props**:
  - `isOpen`: Boolean for sidebar visibility
  - `onClose`: Function to close sidebar
  - `onNewChat`: Function to start new chat
  - `className`: Optional styling

### 2. ModelDetailsSidebar (`components/ui/ModelDetailsSidebar.tsx`)

- **Purpose**: Right sidebar for model information
- **Features**:
  - Always visible on desktop (with placeholder when no model selected)
  - Overlay on mobile
  - Tabbed interface (Overview, Pricing, Capabilities)
  - Model information display
- **Props**:
  - `model`: ModelInfo object or null
  - `isOpen`: Boolean for sidebar visibility
  - `onClose`: Function to close sidebar

### 3. ChatInterface (`components/chat/ChatInterface.tsx`)

- **Purpose**: Central chat area with 3-column layout orchestration
- **Updates**:
  - Added left sidebar state management
  - Added mobile hamburger menu
  - Integrated both sidebars
  - Responsive design

## Layout CSS Implementation

### Width Distribution

- **Left Sidebar**: `w-[15%] min-w-[200px]` (desktop only)
- **Chat Interface**: `md:w-[70%] flex-1` (responsive)
- **Right Sidebar**: `w-[15%] min-w-[240px]` (desktop only)

### Responsive Behavior

- **Desktop (md+)**: Full 3-column layout
- **Mobile**:
  - Chat interface takes full width
  - Left sidebar toggleable via hamburger menu
  - Right sidebar as overlay

### Container Updates

- **Chat Page**: Changed from `max-w-7xl` to `max-w-full` for full width utilization

## Key Features

### Left Sidebar Features

1. **New Chat Button**: Prominent violet button at top
2. **Chat History**:
   - Shows recent conversations
   - Inline title editing
   - Delete functionality
   - Timestamp display
   - Message count
3. **Mobile Support**: Overlay with backdrop blur

### Right Sidebar Features

1. **Model Details Display**:
   - Tabbed interface for organization
   - Overview: Basic model information
   - Pricing: Token costs and estimates
   - Capabilities: Supported parameters
2. **Placeholder State**: Helpful message when no model selected
3. **Always Visible**: On desktop, maintains space even without model

### Chat Interface Enhancements

1. **Mobile Hamburger Menu**: Easy access to left sidebar on mobile
2. **Responsive Header**: Accommodates mobile menu button
3. **Layout Orchestration**: Manages both sidebar states
4. **Full Width Utilization**: Uses available screen real estate

## Technical Implementation

### State Management

```typescript
// Sidebar states in ChatInterface
const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false);
const [isDetailsSidebarOpen, setIsDetailsSidebarOpen] = useState(false);
const [selectedDetailModel, setSelectedDetailModel] =
  useState<ModelInfo | null>(null);
```

### Mobile Responsiveness

- Uses Tailwind's responsive prefixes (`md:`)
- Hidden/visible classes for different screen sizes
- Overlay patterns for mobile sidebars

### Accessibility

- Proper ARIA labels
- Keyboard navigation support
- Screen reader friendly structure
- Focus management

## Dependencies Added

- `@heroicons/react`: For icons (hamburger menu, chat bubbles, etc.)

## Testing

- All existing tests (66/66) continue to pass
- Build process successful
- No breaking changes to existing functionality

## Performance Considerations

- Efficient CSS with Tailwind utilities
- Proper state management to avoid unnecessary re-renders
- Responsive images and content loading

## Future Enhancements

1. **Chat History Persistence**: Store in localStorage or backend
2. **Chat Search**: Search through chat history
3. **Chat Categories**: Organize chats by topics
4. **Sidebar Resize**: Allow users to adjust sidebar widths
5. **Keyboard Shortcuts**: Quick access to sidebar functions

## Files Modified/Created

- ✅ `components/ui/ChatSidebar.tsx` (new)
- ✅ `components/ui/ModelDetailsSidebar.tsx` (updated)
- ✅ `components/chat/ChatInterface.tsx` (updated)
- ✅ `src/app/chat/page.tsx` (updated)
- ✅ `package.json` (added @heroicons/react)

## Validation

- ✅ Build successful
- ✅ All tests passing (66/66)
- ✅ Responsive design working
- ✅ Accessibility features implemented
- ✅ No TypeScript errors
