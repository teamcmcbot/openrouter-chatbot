# function_search_path_mutable hardening

This patch pins `search_path` for flagged public functions to prevent name shadowing/hijacking via mutable `search_path`.

- What it does: `ALTER FUNCTION ... SET search_path = 'pg_catalog, public'` for each function reported by the Security Advisor.
- Why: Ensures deterministic resolution for unqualified names; recommended hardening, especially for `SECURITY DEFINER` functions.
- Impact: No application code changes; function signatures and bodies are unchanged. Triggers/RPCs keep working.

## Files

- `001_set_search_path.sql` — applies the hardening
- `002_reset_search_path.sql` — optional rollback (resets function-level `search_path`)

## Apply

Run `001_set_search_path.sql` in your Supabase SQL editor or via migration tooling.

## Verify

- Re-run Supabase database linter; warning `0011_function_search_path_mutable` should clear for the listed functions.
- Smoke test: operations that call triggers (e.g., updated_at) and selected RPCs.

## Rollback

If needed, run `002_reset_search_path.sql`.

## Notes

- If any function legitimately needs additional trusted schemas, update `target_schema`/`target_names` list or extend the SET value accordingly.
- Future function edits should prefer schema-qualified references (e.g., `public.table`, `pg_catalog.now()`).
- Current target count: 32 functions (keep this list in sync with `/database/schema/**.sql` merges).
