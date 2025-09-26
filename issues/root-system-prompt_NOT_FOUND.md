# root-system-prompt file not found in vercel.

## Overview

The root system prompt file is stored in `lib/prompts/root-system-prompt.txt` and is loaded during server startup. When sending prompt to OpenRouter, the content of this file is prepended to the user message as system prompt. This works fine in local development, but in vercel deployment, the file is not found, resulting in empty system prompt.

```log
{"ts":"2025-09-26T06:09:12.341Z","level":"warn","msg":"[rootPrompt] File '/var/task/lib/prompts/root-system-prompt.txt' not found. Falling back to minimal prompt.","args":[]}
```

It looks like they are finding the file at `/var/task/lib/prompts/root-system-prompt.txt`, but not from the app root directory?
