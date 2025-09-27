# root-system-prompt file not found in vercel.

## Overview

The root system prompt file is stored in `lib/prompts/root-system-prompt.txt` and is loaded during server startup. When sending prompt to OpenRouter, the content of this file is prepended to the user message as system prompt. This works fine in local development, but in vercel deployment, the file is not found, resulting in empty system prompt.

```log
{"ts":"2025-09-26T06:09:12.341Z","level":"warn","msg":"[rootPrompt] File '/var/task/lib/prompts/root-system-prompt.txt' not found. Falling back to minimal prompt.","args":[]}
```

It looks like they are finding the file at `/var/task/lib/prompts/root-system-prompt.txt`, but not from the app root directory?

## Investigation Notes (2025-09-27)

- Confirmed the loader in `lib/utils/openrouter.ts` relies on `OPENROUTER_ROOT_PROMPT_FILE` and resolves it via `path.join(process.cwd(), fileEnv)` before doing `fs.existsSync`/`fs.readFileSync`.
- In local dev `process.cwd()` points to the project root, so the relative path works because the raw txt file lives on disk.
- In Vercel’s default serverless build, Next.js performs output file tracing. Because the prompt path comes from an environment variable, the bundler cannot statically detect the dependency, so `lib/prompts/root-system-prompt.txt` is excluded from the serverless bundle. At runtime the function executes from `/var/task`, but the file was never packaged, leading to the warn + fallback you’re seeing.
- The earlier assumption that “relative fs access will work in serverless” holds only when the file can be traced during build (e.g., hard-coded path, `import`, or explicit tracing include). With a dynamic env-driven path, the tracer has no signal, so the file is dropped.

## Proposed Fix

1. Keep the env override, but add a static fallback that always resolves the canonical file so Next can trace it. For example:
   - Define `const defaultRootPromptPath = path.join(process.cwd(), "lib/prompts/root-system-prompt.txt");`
   - Try the env path first, but always also attempt the default path if the env-based lookup fails.
   - Because the default path is a literal string, the output tracer will include the txt file in the deployment bundle.
2. Alternatively, declare the file in `next.config.ts` using `experimental.outputFileTracingIncludes` (e.g., include it for the API routes/functions that use `loadRootSystemPrompt`). This explicitly tells Vercel to ship the txt alongside the lambda.
3. Longer-term option: import the prompt at build time with `import rootPrompt from "./prompts/root-system-prompt.txt?raw";` (or similar raw-loader approach) and cache the string instead of reading from the filesystem. That would eliminate runtime fs altogether, but requires updating the build tooling to support `.txt` imports.

## Recommended Next Steps

- Implement option (1) for the quickest, least invasive remedy: add the static fallback path and redeploy. That should stop the warning and restore the full system prompt in production immediately.
- If we want to keep the file purely configurable via env, also add (2) so any custom path can be whitelisted explicitly.
- After deploying, hit any endpoint that uses OpenRouter and confirm the absence of `[rootPrompt] File ... not found` warnings in Vercel logs and that the system prompt prepend works as expected.

## Implementation Status (2025-09-27)

- Option (1) has been implemented: `lib/utils/openrouter.ts` now resolves the env-configured path first, then falls back to a statically referenced `lib/prompts/root-system-prompt.txt`. This literal reference allows Next.js output tracing to include the prompt file in the Vercel serverless bundle, so `/var/task/lib/prompts/root-system-prompt.txt` exists at runtime.
- Reasoning leak mitigation has been added: both streaming and non-streaming OpenRouter responses sanitize `reasoning` / `reasoning_details` fields before forwarding them to clients, replacing any occurrences of the root system prompt with `[root system prompt redacted]`.
- Next action: redeploy to Vercel and verify logs show the full system prompt is being prepended without fallback warnings. Consider layering option (2) if future deployments need additional custom prompt locations.
