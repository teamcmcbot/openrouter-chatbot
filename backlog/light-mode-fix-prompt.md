Here’s a tight wrap-up and a ready-to-paste prompt so we can pick up right where we left off next time.

## What we’re doing

- Goal: Improve light mode readability and hierarchy without breaking dark mode, screen by screen using your screenshots.
- Changes so far:
  - Tooltip: light-mode tinted panel variant with subtle elevation.
  - Chat layout: softened central panel (slate-50), translucent header/footer with blur.
  - Assistant/typing bubbles: thin border + subtle shadow for separation; dark mode keeps hairline, no shadow.
  - Markdown: higher-contrast code blocks and inline code; fixed global CSS override via important classes on the component block.
  - Models dropdown: fixed layering earlier (overflow/z-index) and now strengthened borders (trigger and panel) so it stands out in light mode.
- Validation: Built after each change; no TS/lint issues.

## Constraints and style guardrails

- Light mode: slate neutrals, thin borders (200–300), micro-shadows for lift; emerald accents where relevant.
- Dark mode: minimal/no shadow, hairline borders (white/10), avoid bright tints.
- Accessibility: keep contrast legible, preserve focus-visible rings, respect reduced motion.
- Safety: prefer component-level overrides to avoid fighting global CSS; don’t regress z-index/overflow for dropdowns and sidebars.

## Your reusable “next session” prompt

Paste this at the start of our next session.

You are GitHub Copilot. Act as my UI/UX-focused front-end engineer for the OpenRouter Chatbot (Next.js App Router, React, TypeScript, Tailwind). Our mission is to refine LIGHT MODE across screens without regressing dark mode. I’ll send you screenshots (light/dark) of one screen at a time. You will:

1. List specific visual issues and targeted fixes (colors, borders, shadows, spacing, z-index/overflow).
2. Implement minimal, surgical edits in the correct files (Tailwind-first). Avoid broad global CSS unless necessary.
3. Preserve dark mode behavior; use hairline borders and minimal/no shadows in dark mode.
4. Validate with a build; report PASS/FAIL succinctly. If failures occur, iterate once or twice to fix.
5. Share quick visual test steps for me (what to eyeball).
6. Keep a tiny checklist of changes and mark them done.

Project context and patterns:

- Light mode palette: slate neutrals, strong-enough borders (slate-200/300), subtle shadows for light elevation.
- Dark mode palette: gray scale, hairline borders (white/10), shadow-none by default.
- Markdown code blocks: use component-level important classes to override any global .markdown-content pre rules.
- Overlays/menus (e.g., ModelDropdown): ensure proper stacking (container overflow-visible, header stacking context, menu z-index), then stylistic separation via border-2 border-slate-300/90 and light shadow.
- Components of interest: components/chat/_, components/ui/_, components/chat/markdown/\*, globals.css (read-only unless strictly needed).

Success criteria per screen:

- Light mode visually distinct surfaces/borders; dropdowns/overlays clearly separated from background.
- Dark mode unchanged or improved subtly (no heavy shadows).
- No layout regressions across common breakpoints.
- Build passes with no new warnings.

First thing to do when we start:

- Acknowledge the screen from my screenshots, extract issues, propose concrete Tailwind class changes per element, then implement and build.

That’s it—drop this prompt next time and send the first set of screenshots, and I’ll dive right in.
