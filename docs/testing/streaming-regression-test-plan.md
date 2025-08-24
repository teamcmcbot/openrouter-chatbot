# ChatInterface UI Verification Plan - Post Streaming Implementation

## Overview

This test plan focuses on ChatInterface UI verification after streaming implementation. Tests are organized by subscription tier with specific prompts and UI verification steps for manual testing.

## Subscription Tiers & Feature Access

| Feature           | Anonymous | Free | Pro | Enterprise |
| ----------------- | --------- | ---- | --- | ---------- |
| Normal Messages   | ✅        | ✅   | ✅  | ✅         |
| Streaming         | ✅        | ✅   | ✅  | ✅         |
| Web Search        | ❌        | ❌   | ✅  | ✅         |
| Reasoning         | ❌        | ❌   | ❌  | ✅         |
| Image Attachments | ❌        | ❌   | ✅  | ✅         |

## Test Prompts

### Basic Chat Prompts

- **Short**: "Hello, how are you?"
- **Medium**: "Explain quantum computing in simple terms."
- **Long**: "Write a detailed analysis of the economic impact of artificial intelligence on the job market over the next 10 years."

### Web Search Prompts

- **Current Events**: "What happened in tech news this week?"
- **Factual Query**: "What is the current population of Tokyo?"
- **Comparison**: "Compare the GDP of USA vs China in 2024"

### Reasoning Prompts

- **Math Problem**: "If I have 15 apples and give away 1/3, then buy twice as many as I have left, how many apples do I have?"
- **Logic Puzzle**: "Three friends have different colored hats. Given these clues, who wears which color?"
- **Planning**: "Plan a 7-day itinerary for visiting Paris with a $2000 budget"

### Image Test Files

- **Small Image**: < 1MB JPEG
- **Large Image**: 8MB PNG
- **Multiple Images**: 2-3 different format images

---

## 1. Anonymous User Tests

### Basic Features - Anonymous

- [ ] **ANO-001**: Send "Hello, how are you?"
  - **UI Verify**: Message appears in chat, streaming text appears progressively, final message is properly formatted
- [ ] **ANO-002**: Send "Explain quantum computing in simple terms."
  - **UI Verify**: Long response streams smoothly, markdown formatting works, auto-scroll to bottom

### Blocked Features - Anonymous

- [ ] **ANO-003**: Click Web Search button

  - **UI Verify**: "Upgrade to use Web Search" modal appears, modal mentions Pro and Enterprise tiers, "Sign in to upgrade" CTA visible

- [ ] **ANO-004**: Click Reasoning button

  - **UI Verify**: Button is disabled, tooltip shows "Upgrade to enable Reasoning. Reasoning is available for Enterprise accounts only."

- [ ] **ANO-005**: Try to attach image (click image button)
  - **UI Verify**: "Upgrade to attach images" modal appears, mentions "Available on Pro and Enterprise. Sign in to upgrade."

---

## 2. Free User Tests

### Basic Features - Free

- [ ] **FRE-001**: Send "Hello, how are you?"

  - **UI Verify**: Message appears in chat, streaming works, user avatar shows correctly

- [ ] **FRE-002**: Send "Write a detailed analysis of the economic impact of artificial intelligence"
  - **UI Verify**: Long streaming response works, progress indicators show, final formatting is clean

### Blocked Features - Free

- [ ] **FRE-003**: Click Web Search button

  - **UI Verify**: "Upgrade to use Web Search" modal appears, mentions "Your current plan doesn't include web search. Available on Pro and Enterprise."

- [ ] **FRE-004**: Click Reasoning button

  - **UI Verify**: Button is disabled, tooltip shows "Upgrade to enable Reasoning. Reasoning is available for Enterprise accounts only."

- [ ] **FRE-005**: Try to attach image
  - **UI Verify**: "Upgrade to attach images" modal appears, mentions "Available on Pro and Enterprise."

---

## 3. Pro User Tests

### Basic Features - Pro

- [ ] **PRO-001**: Send "Hello, how are you?"

  - **UI Verify**: Message appears, streaming works correctly, user tier badge visible if applicable

- [ ] **PRO-002**: Send "Explain quantum computing in simple terms."
  - **UI Verify**: Streaming response renders properly, markdown formatting intact

### Web Search Features - Pro

- [ ] **PRO-003**: Enable Web Search, send "What happened in tech news this week?"

  - **UI Verify**: Web Search button can be toggled ON, "Web Search" chip shows on assistant message, Citations/Sources section appears below message with clickable links

- [ ] **PRO-004**: Enable Web Search, send "What is the current population of Tokyo?"
  - **UI Verify**: Streaming shows progressive updates, web search results appear, citations are properly formatted

### Image Features - Pro

- [ ] **PRO-005**: Attach small image (<1MB), send "Describe this image"

  - **UI Verify**: Image uploads successfully, thumbnail shows in attachment area, image is sent with message, response references the image

- [ ] **PRO-006**: Attach large image (8MB), send "What do you see?"

  - **UI Verify**: Upload progress indicator, image processes correctly, streaming response works with image context

- [ ] **PRO-007**: Attach 2-3 images, send "Compare these images"
  - **UI Verify**: Multiple thumbnails show, all images attach properly, can remove individual images, response handles multiple images

### Combined Features - Pro

- [ ] **PRO-008**: Enable Web Search + attach image, send "Find similar images online and describe differences"
  - **UI Verify**: Both Web Search chip and image show in message, response includes both web results and image analysis, citations appear

### Blocked Features - Pro

- [ ] **PRO-009**: Click Reasoning button
  - **UI Verify**: Button is disabled, tooltip shows "Upgrade to Enterprise to enable Reasoning"

---

## 4. Enterprise User Tests

### Basic Features - Enterprise

- [ ] **ENT-001**: Send "Hello, how are you?"

  - **UI Verify**: Message appears correctly, streaming works, enterprise features accessible

- [ ] **ENT-002**: Send "Explain quantum computing in simple terms."
  - **UI Verify**: Response streams properly, all UI elements render correctly

### Web Search Features - Enterprise

- [ ] **ENT-003**: Enable Web Search, send "Compare the GDP of USA vs China in 2024"
  - **UI Verify**: Web search toggle works, "Web Search" chip appears, citations section shows with proper links

### Reasoning Features - Enterprise

- [ ] **ENT-004**: Enable Reasoning, send "If I have 15 apples and give away 1/3, then buy twice as many as I have left, how many apples do I have?"

  - **UI Verify**: Reasoning button is enabled and can be toggled, Reasoning section appears before main content, shows "Thinking..." or "Processing..." initially, reasoning content streams in real-time, reasoning section is collapsible, final answer appears after reasoning

- [ ] **ENT-005**: Enable Reasoning, send "Plan a 7-day itinerary for visiting Paris with a $2000 budget"
  - **UI Verify**: Complex reasoning streams progressively, reasoning details are properly formatted, can expand/collapse reasoning section

### Image Features - Enterprise

- [ ] **ENT-006**: Attach image, send "Analyze this image in detail"
  - **UI Verify**: Image attachment works, image displays in message, response streams with image analysis

### Combined Features - Enterprise

- [ ] **ENT-007**: Enable Web Search + Reasoning, send "Research and analyze the best investment strategies for 2025"

  - **UI Verify**: Both features work together, reasoning appears first, then main content with web search results, citations show properly

- [ ] **ENT-008**: Enable Reasoning + attach image, send "Analyze this image and explain your reasoning process"

  - **UI Verify**: Image shows in message, reasoning section streams first showing analysis process, main response follows with detailed analysis

- [ ] **ENT-009**: Enable Web Search + attach image, send "Find similar images online and compare them to this one"

  - **UI Verify**: Image attachment works, web search results include image comparisons, citations appear

- [ ] **ENT-010**: Enable ALL features (Web Search + Reasoning + Image), send "Analyze this image, research similar cases online, and explain your reasoning"
  - **UI Verify**: All features work together, reasoning streams first, then main content with image analysis and web results, all sections properly formatted

---

## 5. Enterprise + Admin Tests

### All Enterprise Features

- [ ] **ADM-001**: Run all Enterprise user tests (ENT-001 through ENT-010)
  - **UI Verify**: All tests pass identically to Enterprise user

### Admin-Specific Features

- [ ] **ADM-002**: Verify admin badge/indicator if present
  - **UI Verify**: Admin status is visible in UI if applicable

---

## Streaming-Specific UI Verification

### Progressive Display

- [ ] **STR-001**: Send long prompt, observe streaming behavior
  - **UI Verify**: Content appears progressively (not all at once), typing cursor/indicator visible during streaming, content doesn't jump or reflow awkwardly

### Reasoning Streaming

- [ ] **STR-002**: (Enterprise only) Enable reasoning, send complex problem
  - **UI Verify**: Reasoning section appears before main content, shows "Initializing AI reasoning..." initially, reasoning content streams with typing cursor, reasoning box has yellow/distinct styling

### Citations Streaming

- [ ] **STR-003**: (Pro+) Enable web search, send factual query
  - **UI Verify**: Citations appear as they're found during streaming, links are clickable, sources section is properly formatted

### Auto-scroll Behavior

- [ ] **STR-004**: Send very long prompt that would cause overflow
  - **UI Verify**: Chat auto-scrolls to bottom during streaming, user can scroll up without interrupting stream, returns to bottom when streaming completes

---

## Error States & Edge Cases

### Connection Issues

- [ ] **ERR-001**: Start message, disconnect internet mid-stream
  - **UI Verify**: Graceful error handling, appropriate error message, option to retry

### Feature Conflicts

- [ ] **ERR-002**: Try to use blocked features on lower tiers
  - **UI Verify**: Clear error messages, upgrade prompts are helpful, no broken UI states

### Large Content

- [ ] **ERR-003**: Send prompt that generates very long response (10k+ tokens)
  - **UI Verify**: Streaming remains smooth, no performance issues, content renders properly

---

## Cross-Platform UI Verification

### Desktop Browsers

- [ ] **UI-001**: Test on Chrome - all features render correctly
- [ ] **UI-002**: Test on Firefox - streaming and features work
- [ ] **UI-003**: Test on Safari - no UI rendering issues

### Mobile Browsers

- [ ] **UI-004**: Test on mobile Safari - responsive design works
- [ ] **UI-005**: Test on mobile Chrome - touch interactions work
- [ ] **UI-006**: Test responsive behavior - UI adapts to screen size

---

## Setup Instructions

### Test Account Creation

```sql
-- Anonymous: Just open app without signing in
-- Free:
UPDATE profiles SET subscription_tier = 'free' WHERE email = 'test-free@example.com';
-- Pro:
UPDATE profiles SET subscription_tier = 'pro' WHERE email = 'test-pro@example.com';
-- Enterprise:
UPDATE profiles SET subscription_tier = 'enterprise' WHERE email = 'test-enterprise@example.com';
-- Enterprise + Admin:
UPDATE profiles SET subscription_tier = 'enterprise', account_type = 'admin' WHERE email = 'test-admin@example.com';
```

### Test Data Needed

- Small image file (<1MB) - JPEG/PNG
- Large image file (~8MB) - PNG
- Multiple test images in different formats
- Reliable internet connection for web search testing
