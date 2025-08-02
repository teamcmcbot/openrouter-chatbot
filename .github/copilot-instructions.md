# GitHub Copilot Custom Instructions

## Project Overview

**OpenRouter Chatbot** is a full-stack web application designed to provide secure, scalable, and user-friendly conversational AI services. It integrates with Supabase for user management and chat history, supports multiple agents and models, and offers modular components for authentication, chat UI, and context management. The app is built for extensibility, allowing rapid prototyping and deployment of new features, with a strong focus on database integrity, workflow automation, and developer collaboration.

## Current Project Structure

```
openrouter-chatbot/
├── .github/
│   └── copilot-instructions.md
├── AGENTS.md
├── coordinator-guide.md
├── copilot-mission.md
├── database/
│   ├── schema/
│   ├── patches/
│   ├── policies/
│   ├── samples/
│   └── README.md
├── docs/
├── issues/
├── specs/
├── backlog/
├── components/
│   ├── auth/
│   ├── chat/
│   └── ui/
├── contexts/
├── coverage/
├── hooks/
├── images/
├── lib/
├── logs/
├── public/
├── scripts/
├── src/
│   └── app/
├── stores/
├── tests/
├── package.json
├── README.md
└── ...
```

## 1. Project Layout – quick map

- `/database/schema/`  → **canonical Supabase DDL** (CREATE TABLE … scripts)
- `/database/patches/<issue_or_feature>/`  → **incremental patch SQL**
- `/issues/`, `/specs/`, `/backlog/`  → user-written problem statements & feature ideas
- `/docs/`  → end-user & developer documentation

## 2. Database workflow rules

1. **Always read existing schema** in `/database/schema/` _before_ proposing changes.
2. Identify **all dependents** (tables ↔ functions ↔ triggers ↔ views) of any object you touch.
3. Create a patch script in `/database/patches/<issue_or_feature>/` that:
   - Drops / alters objects safely.
   - Is idempotent where practical.
4. **After the user signs off** (see § 5), merge the patch into the original DDL so a fresh clone gets the latest schema in one pass.

---

## 3. Planning-phase behaviour (☑ Analyse → Plan)

When the user drops a file in `/issues`, `/specs`, or `/backlog`:

1. _Phases_ → high-level milestones.
2. _Sub-tasks_ under each phase as **Markdown checkboxes**.
3. At the end of each phase, include a user verification step as a checkbox. Before this step, provide a summary of what was implemented and clear manual-testing instructions for the user (e.g., what to check in the UI or console logs).
4. A final task to update `/docs/`.
5. **Before proceeding with the implementation plan, ask up to 5 clarifying questions to ensure requirements and constraints are fully understood.**

**Do NOT** mark any phase “complete” until the user has ticked its checkbox.

---

## 4. Coding-phase behaviour (🔨 Implement)

- Tick the checkbox in the plan.
- If reality diverges from the plan, **immediately** update the plan with new tasks and note _why_.
- Provide a **“User Test Steps”** list for that sub-task.
- Ensure `npm run build` and `npm test` passes before the user tests.

**Note:** The agent should not use `git add` or `git commit` at any stage. All code commits will be performed manually by the user after the manual testing and verification step.

---

## 5. Verification gate (✅)

- Wait for the user to confirm each _testing_ checklist.
- Only then proceed to the next sub-task or phase.
- After final user approval:
  1. Merge patch SQL back into `/database/schema/`.
  2. Add / update docs in `/docs/`.
  3. Close the issue/feature.

---

## 6. Style & etiquette

- Prefer clear, modular code; match existing language/tooling choices.
- Ask clarifying questions rather than guessing.
- Never expose secrets in code or chat.
- Always check if similar functionality has already been implemented and reuse existing code or patterns where possible (e.g., database read/write, API calls, error handling, etc.).

---

_End of Copilot custom instructions._
