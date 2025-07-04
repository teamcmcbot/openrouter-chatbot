# GitHub Copilot Mission Brief - OpenRouter Chatbot Frontend

## 🎯 Mission Overview
**Agent**: GitHub Copilot  
**Role**: Frontend UI/UX Developer  
**Primary Responsibility**: Create the complete user interface and interactive components for the OpenRouter Chatbot web application.

**Success Criteria**:
- ✅ Responsive, modern chat interface with Tailwind CSS
- ✅ Real-time loading states and error handling  
- ✅ Clean, accessible UI components
- ✅ Smooth user interactions and animations
- ✅ Integration with backend API endpoints

---

## 📁 Exclusive File Ownership

**YOU OWN these exact paths** (full write access):
```
/app/(app)/**/*          # All UI pages and layouts
/components/**/*         # All React components  
/styles/**/*             # Custom styles (if needed)
/hooks/**/*              # Custom React hooks
```

**You can READ** (for integration):
- `/app/api/**/*` (API contracts from Gemini CLI)
- `/lib/types/**/*` (Type definitions from Gemini CLI)
- `/.env.example` (Environment variables)

---

## 🏗️ Task Breakdown

### Task 1: Landing Page Setup
**Priority**: High
- Create modern landing page at `/app/(app)/page.tsx`
- Hero section with clear app description
- Call-to-action button leading to chat interface
- Clean navigation and footer
- **Files**: `app/(app)/page.tsx`, `app/(app)/layout.tsx`

### Task 2: Chat Interface Core
**Priority**: High  
- Chat page at `/app/(app)/chat/page.tsx`
- Message input component with send button
- Message display area with proper styling
- Typing indicators and loading states
- **Files**: `app/(app)/chat/page.tsx`, `components/chat/ChatInterface.tsx`, `components/chat/MessageInput.tsx`, `components/chat/MessageList.tsx`

### Task 3: UI Components Library
**Priority**: Medium
- Reusable Button component with variants
- Input field components with validation states
- Loading spinner/skeleton components
- Error boundary and error display components
- **Files**: `components/ui/Button.tsx`, `components/ui/Input.tsx`, `components/ui/Loading.tsx`, `components/ui/ErrorDisplay.tsx`

### Task 4: Responsive Design & Polish
**Priority**: Medium
- Mobile-first responsive design
- Dark/light theme support (optional)
- Smooth animations and transitions
- Accessibility improvements (ARIA labels, keyboard nav)
- **Files**: Various component files, potential `styles/globals.css` updates

### Task 5: Custom Hooks
**Priority**: Low
- `useChat` hook for managing chat state
- `useLocalStorage` for persisting chat history (optional)
- `useDebounce` for input optimization
- **Files**: `hooks/useChat.ts`, `hooks/useLocalStorage.ts`, `hooks/useDebounce.ts`

---

## 🔌 API Integration Contracts

**Expected from Gemini CLI**:
- `POST /api/chat` endpoint
  - Request: `{ message: string }`
  - Response: `{ response: string, error?: string }`
  - Status codes: 200 (success), 400 (bad request), 500 (server error)

**Type Definitions** (from `/lib/types/`):
```typescript
// Expected from Gemini CLI
interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

interface ChatResponse {
  response: string;
  error?: string;
}
```

---

## 📋 Git Communication Protocol

### Commit Message Format:
```
[COPILOT] Clear description of what was implemented

Examples:
[COPILOT] Add responsive chat interface with message input
[COPILOT] Implement loading states and error handling
[COPILOT] Create reusable UI component library
```

### Handoff Communication:
```
[COPILOT] Implemented chat UI components, needs /api/chat endpoint from GEMINI
[COPILOT] Added message input validation, ready for API integration
[COPILOT] Chat interface complete, waiting for backend response handling
```

### Before Starting New Work:
1. **Always run**: `git pull --rebase`
2. **Check others' work**: `git log --oneline -10`  
3. **Review recent changes**: `git show [recent-commit-hash]`

### Commit Frequency:
- Commit every 1-3 related files
- After completing each component
- Before starting a new major feature

---

## 🧪 Testing Approach

**Your Testing Responsibilities**:
- Component testing with React Testing Library
- UI interaction testing
- Responsive design testing
- Accessibility testing

**Test Files** (you own):
- `/tests/components/**/*.test.tsx`
- Basic component rendering and interaction tests
- Form validation and input handling tests

**Example Test Structure**:
```typescript
// tests/components/ChatInterface.test.tsx
describe('ChatInterface', () => {
  it('renders message input', () => {
    // Test component rendering
  });
  
  it('handles message submission', () => {
    // Test form interactions
  });
});
```

---

## 🚀 Development Workflow

### Phase 1: Foundation (Day 1)
1. Set up basic layout and routing structure
2. Create landing page with navigation
3. Implement basic chat page shell

### Phase 2: Core Chat (Day 1-2)  
1. Build message input component
2. Create message display components
3. Add loading and error states
4. Integrate with API (when available)

### Phase 3: Polish (Day 2-3)
1. Responsive design refinements
2. Animations and micro-interactions
3. Accessibility improvements
4. Component testing

### Integration Points with Gemini CLI:
- **TODO Comments**: Add `// TODO: GEMINI - need API endpoint here` where backend integration needed
- **Type Imports**: Import shared types from `/lib/types/`
- **Error Handling**: Handle API errors gracefully with user-friendly messages

---

## 🎨 Design Guidelines

**Visual Style**:
- Clean, modern interface using Tailwind CSS
- Consistent spacing and typography
- Professional color scheme (neutral with accent colors)
- Mobile-first responsive approach

**User Experience**:
- Intuitive chat interface similar to popular messaging apps
- Clear visual feedback for all user actions
- Graceful loading states and error recovery
- Accessible keyboard navigation

**Component Architecture**:
- Small, focused, reusable components
- Clear prop interfaces with TypeScript
- Consistent naming conventions
- Well-documented component APIs

---

## 🔄 Integration Checkpoints

**Waiting for Gemini CLI**:
1. Chat API endpoint implementation
2. TypeScript type definitions
3. Error response format standards
4. Environment variable configurations

**You'll Signal When Ready**:
1. UI components are complete and styled
2. Form validation is implemented
3. Loading states are in place
4. Ready for API integration testing

**Success Metrics**:
- All components render without errors
- Responsive design works on mobile/desktop
- Form submissions trigger correct API calls
- Loading states provide good UX
- Error messages are user-friendly

Remember: Focus on creating an exceptional user experience while maintaining clean, maintainable code. Your frontend work sets the tone for the entire application!
