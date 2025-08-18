# Replace Enhanced Mode Indicator

## Overview

The current model dropdown api call `/api/models?enhanced=true` is the default and we should not need to fallback to the old mode of retrieving models from .env file.

I want to completely remove the old mode and any backward support in the frontend and backend codes.

`enhanced` is the default and models endpoint do not need to include `enhanced=true` in the request.

## Goal

Remove the old mode of retrieving models from the .env file and ensure that all frontend and backend code is updated to use the new model dropdown API call without the `enhanced=true` parameter.

## UI Changes

In the ChatInteface header `chat-header` there is a visual indicator to show `Enhanced` mode is called. I want to repurpose that to show the account type of the User: Anonymous | Free | Pro | Enterprise
