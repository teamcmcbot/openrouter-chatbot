# Image Output Pricing (Unified Patch)

`001-unify-recompute.sql` is the **single authoritative consolidated migration** for image output pricing + unified cost recomputation. It fully replaces the earlier incremental drafts:

| Replaced legacy patches                  | Status     |
| ---------------------------------------- | ---------- |
| 001-add-output-image-cost.sql            | superseded |
| 002-stub-recompute-output-image.sql      | superseded |
| 003-implement-output-image-recompute.sql | superseded |
| 004-update-triggers-output-image.sql     | superseded |
| any earlier 005-unify-recompute draft    | superseded |

> Note: The file name in this folder is `001-unify-recompute.sql` but the header comment inside references `005-unify-recompute.sql` (historic numbering). This is intentional to preserve lineage context; adjust the header if you prefer strict alignment.

## What the unified patch does

Schema & column changes (idempotent via `IF NOT EXISTS` / safe drops):

- Adds `model_access.output_image_price` (varchar, default '0'); drops any legacy `output_image_cost` column.
- Adds `chat_attachments.metadata JSONB` (default `{}`) for source tagging (e.g. `{ "source": "assistant" | "user" }`).
- Extends `message_token_costs` with: `output_image_tokens`, `output_image_units`, `output_image_cost`.
- Adds `chat_messages.output_image_tokens` to persist raw assistant output image token counts.

Cost recomputation logic:

- Drops obsolete `recompute_output_image_cost_for_assistant_message` (stub + prior impl variants).
- Introduces unified function `recompute_image_cost_for_user_message(p_user_message_id TEXT)` that accepts either the originating user message id **or** the assistant message id.
- Computes: prompt, text completion (excludes output image tokens), input image (capped at 3), output image (uncapped), and websearch costs.
- Writes/updates a single row in `message_token_costs` (upsert on `assistant_message_id`).
- Applies delta adjustments to `user_usage_daily.estimated_cost` for accurate incremental accounting.

Triggers:

- `after_assistant_message_cost` (on `chat_messages` insert) invokes unified recompute for successful assistant messages.
- `after_attachment_link_recompute_cost` (on `chat_attachments` `message_id` update) recomputes only when a _user_ message gains ready attachments (avoids double-charging for assistant output images arriving later).

Pricing fallbacks & heuristics:

- Output image price fallback for `google/gemini-2.5-flash-image-preview` = `0.00003` when model metadata not yet synced.
- Websearch cost default baseline = `0.004` per result (capped at 50) if model-level `web_search_price` missing.
- Heuristic: if `output_image_tokens = 0` but assistant has output image attachments, tokens inferred 1:1 from attachment count (temporary bridge until provider token reporting is consistent).

`pricing_source` JSON payload records the pricing & computation basis (including differentiation of text vs image tokens, websearch result count, and pricing model id) for auditability.

## Deployment / usage

1. Apply `001-unify-recompute.sql` in your migration process (safe to run multiple times).
2. Remove / do not apply the superseded incremental patch files listed above (they can be deleted after merge).
3. Verify (see checklist below). Once validated, fold these changes into the canonical DDL under `/database/schema/` and update any dependent docs.

## Verification checklist

- [ ] Columns present:
  - `model_access.output_image_price`
  - `chat_attachments.metadata`
  - `message_token_costs.output_image_tokens|output_image_units|output_image_cost`
  - `chat_messages.output_image_tokens`
- [ ] Function `recompute_image_cost_for_user_message(text)` exists.
- [ ] Obsolete function `recompute_output_image_cost_for_assistant_message` removed.
- [ ] Triggers `after_assistant_message_cost` and `after_attachment_link_recompute_cost` exist and reference expected functions.
- [ ] Inserting an assistant message with images + websearch produces / updates a row in `message_token_costs` with `output_image_units` > 0 and correct `total_cost`.
- [ ] Updating (linking) image attachments to a user message (status `ready`) recomputes costs (observe `estimated_cost` delta in `user_usage_daily`).

## Manual test snippets (examples)

```sql
-- Confirm new columns
SELECT output_image_price FROM public.model_access LIMIT 1;
SELECT output_image_tokens, output_image_units, output_image_cost FROM public.message_token_costs LIMIT 5;

-- List triggers
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name IN ('after_assistant_message_cost','after_attachment_link_recompute_cost');

-- Invoke recompute manually (using an assistant message id or its user message id)
SELECT public.recompute_image_cost_for_user_message('<id>');

-- Inspect pricing source JSON
SELECT assistant_message_id, pricing_source
FROM public.message_token_costs
ORDER BY created_at DESC
LIMIT 10;
```

## Post-merge tasks

- Integrate column additions & function definitions into base schema files in `/database/schema/`.
- Update any pricing / usage documentation under `/docs/database/` and cost accounting references under `/docs/architecture/`.
- Remove superseded patch files from version control (after team approval) to prevent accidental re-application ordering confusion.

## Future follow-ups (optional)

- Replace heuristic 1:1 `output_image_tokens` inference once provider reliably supplies image token counts.
- Add regression tests for cost deltas (e.g., use a test harness calling the function with fixture data).
- Centralize pricing overrides (e.g., Gemini image preview) into a lookup table for easier maintenance.

---

Maintainer note: This unified patch is idempotent and safe to include in automated deploy pipelines; it relies on `CREATE OR REPLACE FUNCTION` and guarded `ALTER TABLE` statements to avoid failures on re-run.
