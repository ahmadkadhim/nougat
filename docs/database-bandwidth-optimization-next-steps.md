# Database Bandwidth Optimization Next Steps

## Context

As of March 10, 2026, the Nougat cloud dev deployment exceeded the Convex Free plan database bandwidth limit.

The biggest causes were:

- broad reactive queries over `captures`
- `captures` documents carrying large `rawPayload` and `sourceMetadata` fields
- review and dashboard queries scanning far more captures than they displayed
- debug and admin helpers using full-table `.collect()` reads on the cloud dev deployment

Some immediate query trims have already landed:

- the app-wide review badge now uses a tiny `getHasPendingReview` query instead of the full derived summary
- `getReviewQueue` now scans fewer captures
- `getDashboardData` no longer fetches large unused derived/capture payloads
- `listDashboardCaptures` now scans fewer captures and no longer loads tags just to support free-text search

This document covers the next highest-leverage changes.

## Priority 0: Use Local Convex For Normal Development

### Why

Even a well-shaped cloud dev deployment can burn bandwidth during normal UI work because every reactive query still hits the hosted database. The easiest way to stay inside the free plan is to do default development locally.

### Action

- use `npx convex dev --local` for routine UI, query, schema, and evaluator work
- use cloud dev only for flows that need a public hosted URL
- examples:
  - X OAuth callback testing
  - public inbox endpoint testing
  - final shared-environment checks before shipping

### Notes

- local and cloud state are separate
- if a task depends on cloud state, say so explicitly before switching environments

## Priority 1: Remove Large Payloads From The `captures` Hot Path

### Problem

The `captures` table currently stores all of this on the hot list/read path:

- `rawPayload`
- `sourceMetadata`
- `selectedText`
- `tabContext`

The worst part is `rawPayload`, which can hold large enriched X payloads and article metadata blobs.

Every dashboard/review scan over `captures` pays for that.

### Proposed change

Split large capture data into a separate cold-path table, for example:

- `capturePayloads`
  - `captureId`
  - `rawPayload`
  - `sourceMetadata`
  - any other rarely needed large fields

Keep `captures` slim:

- ids
- owner
- timestamps
- status
- platform
- canonical URL
- lightweight author/title/preview fields

### Expected impact

Very high. This is likely the single biggest remaining bandwidth reduction.

## Priority 2: Materialize A Slim `capturePreviews` Table

### Problem

The dashboard currently scans `captures`, then builds UI previews on read. That is expensive and repeats work.

### Proposed change

Create a write-time projection table for list/search use, for example:

- `capturePreviews`
  - `captureId`
  - `ownerAuthUserId`
  - `platform`
  - `status`
  - `title`
  - `author`
  - `excerpt`
  - `postedAt`
  - `sourcedAt`
  - `syncBatchAt`
  - `canonicalUrl`
  - small preview image URL if needed
  - lightweight X preview fields only if they are cheap

Update it during:

- ingestion
- enrichment
- reprocessing
- status changes

### Expected impact

Very high. It removes repeated preview derivation from the main list query and avoids scanning full `captures` rows for browsing.

## Priority 3: Materialize `captureReviewState`

### Problem

The review queue currently:

1. scans recent captures
2. loads per-capture entity rows
3. filters to captures that still have pending review items
4. loads feedback history for those items

That means the queue is discovering pending review work at read time instead of querying it directly.

### Proposed change

Create a small table or projection keyed by capture:

- `captureReviewState`
  - `captureId`
  - `ownerAuthUserId`
  - `hasPendingReview`
  - `pendingCount`
  - `savedCount`
  - `approvedCount`
  - `rejectedCount`
  - optional lane counts
  - lightweight capture title/author data
  - updated timestamp

Update it whenever:

- a new bit is persisted
- a bit changes review status
- feedback is added
- outputs are purged or regenerated

### Expected impact

High. It turns the review queue from a scan-and-derive query into a direct lookup.

## Priority 4: Replace Cloud Debug Helpers With Local-Only Tools

### Problem

Several internal helpers use full-table `.collect()` reads:

- `getDerivedDebugSnapshot`
- `purgeDerivedOutputs`
- migration helpers

These are fine in small local datasets but expensive in cloud dev, especially when run repeatedly.

### Proposed change

- treat these as local-only tools
- run them against `--local` by default
- if they must run in cloud:
  - require explicit capture scopes
  - require explicit limits
  - avoid unrestricted `.collect()` where possible

### Guardrail

Add comments and naming that make the intended usage obvious, for example:

- `getDerivedDebugSnapshotLocalOnly`
- `purgeDerivedOutputsForCaptures`

## Priority 5: Split Summary Queries By Surface

### Problem

A shared “summary” query is tempting, but it often grows into a kitchen-sink subscription that every page reruns.

### Proposed change

Keep route-specific summary queries small and purpose-built:

- app nav:
  - only “is there pending review?”
- dashboard sidebar:
  - top tags
  - sync health
  - failed count
- review page:
  - full derived summary

### Expected impact

Medium to high. This reduces background reruns and avoids paying for data the current route does not need.

## Priority 6: Make Search Use Searchable Projections, Not Rich Capture Rows

### Problem

The dashboard search currently inspects preview title plus optional tag data while scanning recent captures. That is still too broad.

### Proposed change

Once `capturePreviews` exists:

- search against normalized preview text fields only
- keep search fields short and indexed where possible
- avoid building search strings from large raw source data at read time

## Priority 7: Add Explicit Cloud-Safe Limits To Admin And Batch Paths

### Problem

Some tools assume “small enough” datasets and use generous limits or whole-table scans.

### Proposed change

- lower default scan limits
- require opt-in to larger cloud reads
- add parameters like:
  - `captureIds`
  - `ownerAuthUserId`
  - `limit`
  - `scanLimit`
- reject dangerous cloud calls unless the scope is narrow

## Priority 8: Add A Tiny Ops Checklist For Cloud Dev

Before running expensive operations on cloud dev:

- am I on cloud because I need a hosted URL, or out of habit?
- is there a local deployment option?
- does this helper use `.collect()`?
- does this query scan more than it returns?
- is the table carrying large cold-path fields?
- am I subscribing to a broad query in shared layout chrome?

## Suggested Implementation Order

1. Move default dev to `npx convex dev --local`
2. Split `rawPayload` and `sourceMetadata` out of `captures`
3. Add `capturePreviews`
4. Add `captureReviewState`
5. Lock down full-table debug helpers
6. Revisit search and review queue query shapes after the projections exist

## Success Criteria

We should consider this solved when:

- normal daily development happens on local Convex
- dashboard browsing no longer scans fat `captures` records
- review queue no longer discovers pending captures by scanning recent captures
- cloud dev bandwidth stays comfortably below the free-plan limit during a normal month
