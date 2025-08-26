# Streaming Rollout and Canary Guide

This guide outlines safe rollout, canary, and rollback for the streaming protocol.

## Flags Overview

- STREAM_MARKERS_ENABLED
  - 1: Forward progressive marker lines (`__REASONING_CHUNK__`, `__ANNOTATIONS_CHUNK__`).
  - 0: Suppress markers entirely. Final metadata still includes annotations and optional reasoning.
- STREAM_REASONING_ENABLED
  - 1: Forward reasoning when requested and allowed by model/tier.
  - 0: Suppress reasoning in streaming path even if requested.
- STREAM_DEBUG
  - 1: Verbose logs in dev (chunk sizes, marker emissions, parse warnings, TTF_annotation).
  - 0: Quiet (recommended for production).

## Recommended Rollout Sequence

1. Stage validation

- STREAM_MARKERS_ENABLED=0
- STREAM_REASONING_ENABLED=1
- STREAM_DEBUG=1 (short window)
- Goal: Verify content streaming and final metadata only; ensure no marker contamination.

2. Canary progressive markers

- STREAM_MARKERS_ENABLED=1 for a small percentage of instances or a single region.
- STREAM_REASONING_ENABLED=1
- STREAM_DEBUG=1 for 15–30 minutes, then 0.
- Watch for incomplete marker JSON or UI contamination.

3. Gradual expansion

- Increase scope of STREAM_MARKERS_ENABLED=1 as metrics remain healthy.
- Keep STREAM_REASONING_ENABLED aligned with product policy and tiers.

## What to Watch

- Logs with STREAM_DEBUG=1:

  - "STREAM[DEBUG] event parsed" counts rising without parse errors
  - "STREAM[DEBUG] emit reasoning/annotations" occurrences
  - "TTF_annotation" timing (first annotations forwarded)
  - Any "metadata parse warning" lines

- User-facing:
  - No marker prefixes rendered in assistant text
  - Final metadata JSON present exactly once at end-of-stream
  - Annotations deduplicated by URL; reasoning visible only when allowed

## Rollback

- Immediate suppression of markers: set STREAM_MARKERS_ENABLED=0
- Suppress reasoning if needed: set STREAM_REASONING_ENABLED=0
- Keep STREAM_DEBUG=1 temporarily to capture diagnostics during rollback window; revert to 0 afterwards.

## Notes

- Final metadata line remains the authoritative summary regardless of flag settings.
- Non-streaming endpoint behavior is unaffected by STREAM_MARKERS_ENABLED.
- When in doubt, prefer conservative settings: markers off, reasoning off.
