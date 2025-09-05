# Image Output Pricing Patches

This folder contains incremental SQL patches to prepare the schema for image output support and pricing.

## Files

- 001-add-output-image-cost.sql

  - Adds `model_access.output_image_cost` (default '0')
  - Adds `message_token_costs.output_image_units` (default 0)
  - Adds `message_token_costs.output_image_cost` (default 0)
  - Adds `chat_attachments.metadata` JSONB for source tagging (e.g., `{ "source": "assistant" | "user" }`)

- 002-stub-recompute-output-image.sql
  - Adds a no-op stub function `recompute_output_image_cost_for_assistant_message` to avoid deploy-order issues

## Apply Order

1. 001-add-output-image-cost.sql
2. 002-stub-recompute-output-image.sql

## Post-merge

After approval and verification, merge these changes into `/database/schema/` and update the relevant docs under `/docs/database/`.
