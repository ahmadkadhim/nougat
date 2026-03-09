# Nougat v1 (Capture + Enrichment), Convex-First

## Summary
Ship the capture and enrichment foundation first: Chrome + Safari + iOS ingestion plus scheduled X bookmark import into a markdown-first inbox with complete source metadata. Use Convex as the backend (real-time + good agent DX), and defer autonomous agent-action orchestration until v2.

## Implementation Steps
1. Finalize one canonical `Capture` contract and frontmatter schema, including full provenance (`url`, `canonical_url`, `author`, `platform`, `platform_ids`, `captured_at`, `device_id`, `capture_method`, `extraction_status`, `confidence`).
2. Set up Convex backend as the primary system of record for operational metadata and processing state.
3. Implement Convex HTTP endpoints:
   - `POST /v1/captures`
   - `POST /v1/captures/bulk`
   - `POST /v1/devices/register`
   - `POST /v1/devices/rotate-token`
   - `GET /v1/captures/:id`
   - `POST /v1/captures/:id/reprocess`
4. Implement device-scoped token auth, idempotency keys, and per-device rate limits.
5. Build Chrome extension (MV3): current tab, selected tabs, full window capture, keyboard shortcut, local retry queue.
6. Build Safari Web Extension with the same capture modes and retry behavior.
7. Build iOS Shortcut/Share Sheet flow to send URL/text from any app into the same API with offline retry.
8. Re-implement the existing OpenClaw X bookmark sync workflow inside Convex:
   - Schedule a twice-daily server-side job against the X API.
   - Fetch newly added bookmarks using a durable cursor or last-seen watermark.
   - Convert bookmarks into the same canonical capture contract as manual submissions.
   - Dedupe against prior bookmark imports and existing captures for the same canonical URL/post.
   - Mark provenance so downstream agents can distinguish `x_bookmark_sync` from manual X shares.
9. Build async enrichment pipeline in Convex:
   - Fast ack on ingest.
   - Background processing for normalization, canonicalization, dedupe, and content fetch/transforms.
   - Dead-letter queue + replay.
10. Implement source adapters:
   - X adapter with bookmark/post enrichment and follow-up content retrieval when `article` payload is partial.
   - YouTube adapter (metadata + transcript when available).
   - Generic web adapter (readability extraction + metadata).
11. Render final markdown documents and store them as source-of-truth files; keep Convex index records for query/search, dedupe, and status tracking.
12. Add minimal operator views (or endpoints) for: new captures, failed enrichments, dedupe conflicts, and reprocess control.
13. Add daily/weekly digest generation from indexed captures (summaries + prioritized review queues only, no autonomous execution yet).

## Public Interface / Type Changes
- Introduce `CaptureRequest`, `CaptureRecord`, `EnrichmentJob`, and `MarkdownDocument` contracts.
- Require complete provenance metadata on every accepted capture.
- Add a capture method/provenance value for scheduled imports such as `x_bookmark_sync`.
- Add explicit processing states: `queued`, `processing`, `enriched`, `partial`, `failed`, `dead_letter`.
- Enforce idempotency on `capture_hash` + `device_id` + `captured_at` window.

## Test Plan
- Client capture tests: single tab, selected tabs, full window, share sheet imports, offline retry replay.
- X bookmark sync tests: first import, incremental import from watermark, duplicate bookmark replay, deleted/private post fallback, API partial failure recovery.
- API tests: token scope, token rotation, idempotency, rate limiting, bulk payload handling.
- Pipeline tests: X with partial `article`, X without `article`, deleted/private posts, YouTube no transcript, paywalled page fallback.
- Markdown contract tests: required frontmatter completeness, deterministic file naming, provenance integrity.
- Reliability tests: worker retry, dead-letter routing, manual reprocess path.

## Deferred to v2
- Autonomous/hybrid agent action layer (task/skill auto-creation, approval gates, execution delegation).
- Keep only capture, enrichment, indexing, and digest support in v1 so the foundation is stable first.

## Assumptions
- Public API ingress.
- Device-token auth.
- Fast-ack + async processing.
- Native Safari extension at launch.
- Markdown as source of truth with full metadata retained.
- Convex is the backend platform for v1.
