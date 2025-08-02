# Analysis and Recommendations: Database Model Access Changes

## Initial Analysis

### Current State

- The current model access implementation is not integrated; it relies on hardcoded data.
- The `model_access` table is either missing or not fully utilized in the current schema.
- The user profile (`profiles` table) contains an `allowed_models` JSONB array, which is used to control model access per user, but this is not scalable or maintainable.
- There is no automated process to sync models from the OpenRouter API to the database.
- The `/api/models` endpoint may be using cached or hardcoded data, and does not leverage tier-based access control from the database.

### Requirements

- Extract the list of models from the OpenRouter API and store them in the database.
- Store key information: model name, description, provider, pricing, and tier access fields (`is_free`, `is_pro`, `is_enterprise`).
- Add a `status` column to track model lifecycle: `active`, `inactive`, `disabled`, `new`.
- On first sync, all models are set to `new`. Admin reviews and updates their status.
- On subsequent syncs, compare OpenRouter and DB lists to update statuses and add/remove models as needed.
- Tier access fields default to `false` for new models; admin must enable as appropriate.
- Remove reliance on the `allowed_models` field in `profiles` and any related triggers/functions.
- The `/api/models` endpoint should enforce authentication and tier-based authorization.

## Recommendations

1. **Schema Design**

   - Propose and implement a new `model_access` table with the required fields: model name, description, provider, pricing, tier access flags, and status.
   - Add necessary triggers or functions to keep the table in sync with OpenRouter and to manage status transitions.

2. **Migration Plan**

   - Identify and remove the `allowed_models` field from the `profiles` table.
   - Remove or update any triggers/functions that reference or update `allowed_models`.

3. **Sync Job**

   - Implement a daily job (e.g., using a serverless function or cron job) to fetch models from OpenRouter, compare with the DB, and update the `model_access` table accordingly.
   - Ensure new models are set to `new` and require admin review before activation.

4. **API Changes**

   - Update the `/api/models` endpoint to:
     - Query the `model_access` table for available models based on user tier.
     - Enforce authentication and authorization.
     - Optionally, cache results for performance, but always respect the latest DB state.

5. **Admin Workflow**

   - Provide an admin interface or workflow to review and update the status and tier access of new models.

6. **Testing and Validation**
   - Add tests to ensure the sync job, API endpoint, and tier-based filtering work as expected.
   - Validate that the removal of `allowed_models` does not break existing functionality.

## Next Steps

- Design the new `model_access` table schema.
- Update the database migration scripts in `/database/`.
- Refactor the `/api/models` endpoint and related code.
- Implement and schedule the sync job.
- Remove deprecated fields and triggers from the `profiles` table.
- Add admin review workflow for new models.

---

This document should be updated as implementation progresses and new requirements emerge.
