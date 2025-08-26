# Streaming Architecture: Protocol and Flow

This document describes the streaming protocol, buffering strategy, and observability controls for the OpenRouter Chatbot.

## Goals

- Robust across SSE fragmentation and model idiosyncrasies
- Zero loss of web search annotations
- Controlled exposure of reasoning content based on subscription tier
- Simple client contract for final metadata

## Protocol Overview

- Progressive assistant content is streamed as plain text lines.
- Special marker lines may be interleaved:
  - `__ANNOTATIONS_CHUNK__{"type":"annotations","data":[UrlCitation...]}`
  - `__REASONING_CHUNK__{"type":"reasoning","data":"..."}` (tier-gated)
- Final metadata is emitted as a single complete JSON line:
  - `{ "__FINAL_METADATA__": { response, usage, id, annotations, reasoning?, reasoning_details?, ... } }`
- Backend internal sentinel (not forwarded): `__METADATA__{...}__END__` used by API transform only.

## Buffering Strategy

- Backend (producer): Parses SSE by events (\n\n delimiter), concatenates multi-line `data:` payloads, JSON-parses per event, and emits:
  - Content chunks (clean text)
  - Marker lines for annotations/reasoning when available and allowed
  - Internal `__METADATA__...__END__` for the API transform to build final metadata
- API Transform (middleware): Maintains a rolling string buffer, processes complete lines, forwards full marker lines only when their JSON is balanced. Drops backend internal sentinel and emits final one-line metadata JSON at flush.
- Frontend (consumer): Renders plain text chunks; handles marker lines specially for progressive UI, and parses final metadata JSON line.

## Annotations

- Aggregated and deduplicated by URL (case-insensitive) on the backend to avoid duplicates.
- Progressive `__ANNOTATIONS_CHUNK__` lines carry the cumulative set; the final metadata also includes the set.

## Reasoning

- Only forwarded if `options.reasoning` is requested and the user tier allows it.
- Frontend concatenates chunks when present; otherwise hidden by default.

## Observability

- TTF_annotation (time to first annotation) is recorded server-side when the first `__ANNOTATIONS_CHUNK__` is forwarded.
- Development-time verbose logging is controlled by `STREAM_DEBUG=1`.
  - Backend: logs OpenRouter request parameters, chunk sizes/previews, event payload sizes, marker emissions, and errors.
  - API route: logs metadata parsing errors and TTF_annotation.

## Error Handling

- Partial/invalid JSON events are ignored with optional debug logs.
- Balanced-brace scanning prevents forwarding incomplete marker JSON.

## Security & Rate Limiting

- Authentication handled via standardized middleware.
- Tiered rate limiting for chat endpoints (Tier A) as per project standards.

## Compatibility Notes

- Legacy client-facing metadata markers are removed. Clients must parse the one-line `{ "__FINAL_METADATA__": { ... } }` at end-of-stream.
