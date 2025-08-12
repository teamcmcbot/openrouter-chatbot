# Backlog: Database Model Access Changes

## Overview

The current table are not integrated and contains hardcoded data.
We need to extract the list of models via openrouter API and store them in the database. Aside from the key informations like model name, description, and provider, we also need to store the model's pricing information, there will be additional fields that define which tier have access to the model. Newly added models from OpenRouter are disabled by default until an admin enables and configures them. There must be status to track whether the model is newly added or deleted from OpenRouter.

I am thinking of a daily job that will fetch the list of models from OpenRouter and update the database accordingly. The job will first fetch from DB the current list and then fetch the list from OpenRouter, then compare the two lists and update the database accordingly. This will ensure that we always have the latest models available in our system.

Status column:
`active`, `inactive`, `disabled`, `new`

On 1st run, all models from OpenRouter will be set as `new`.
Admin will review the list of `new` models and update them to `active` or `disabled` status.

On subsequent runs, models from OpenRouter is compared with the existing models in the database. If a model is not found in OpenRouter, it will be set to `inactive` status. If a model is found in OpenRouter but not in the database, it will be added as `new`. If a model is found in both places, it will be updated with the latest information.

Tier access fields:

- `is_free`: Indicates if the model is accessible to the free tier.
- `is_pro`: Indicates if the model is accessible to the pro tier.
- `is_enterprise`: Indicates if the model is accessible to the enterprise tier.

Newly added modles from OpenRouter will have these fields set to `false` by default. Admin will review the list of `new` models and update them accordingly.

## Purpose of model_access table

The `model_access` table main purpose is to configure which models are available to use for each user tier. Additionally it will also store the model's pricing information, description, and other metadata, but that is secondary as there is a model endpoint that provides the latest information about the models when populating the dropdown list in the UI.

Duing model dropdown flow:

- retrieve latest models from OpenRouter API or take from cache.
- check user's tier and filter the models based on the `model_access` table.
- if signed in user have default model set and that model is in both OpenRouter and `model_access`, then use that model as default.
- this final list of models will be used to populate the model dropdown in the UI.

## Task for AGENT during planning

- Check the current database schema in current `/database/` folder to identify what functions and triggers are already implemented linking to the `model_access` table.
- Confirm the current code base is not using the `model_access` table and that it is not hardcoded in the user profile on first login.
- Review OpenRouter models json response. IMPORTANT: Read only first 1000 lines of the file `/database/sample/openrouter_models.json` to identify the fields that need to be stored in the `model_access` table.
- Currently, profiles table has a `allowed_models` field which is a JSONB array of model names. This will be replaced with a reference to the `model_access` table. To check if we can remove this field and any trigger or function that updates it.
- Identify if there are any existing triggers or functions that update the `allowed_models` field in the `profiles` table and plan to remove them.

## Next Steps

- Propose the new schema for the `model_access` table.
- Update the database schema in `/database/` folder with the new `model_access` table. Including any necessary triggers or functions to manage the model data.
- Propose the changes to existing /api/models endpoint.
- Models endpoint should be protected by authentication and does any necessary authorization checks to ensure that only users with the appropriate tier can access the models.
- Review the existing models endpoint which stores the models in cache I think?
