# Database Bandwidth Lessons

## What Happened

Nougat exceeded the Convex Free plan database bandwidth limit during development.

The issue was not one dramatic bug. It was a collection of common patterns that look harmless early on but become expensive together:

- broad reactive subscriptions
- list queries scanning far more records than they render
- large blobs stored directly on hot-path records
- “summary” queries that quietly become kitchen sinks
- debug helpers that use full-table `.collect()` reads on hosted dev

This document captures the lessons so future projects do not repeat them.

## Core Principle

Treat bandwidth as a first-class design constraint from the start.

In a reactive backend, read cost is not just “what the user sees now.” It is:

- what the query scans
- what each scanned document contains
- how often subscriptions rerun
- how many places in the app mount the same broad query

That means a query that “only returns 12 items” can still be expensive if it scanned hundreds of large documents to decide which 12 to return.

## The Main Failure Modes

## 1. Fat documents on hot paths

### Bad pattern

Store large or rarely used payloads directly on the main record that powers list views.

Examples:

- raw API payloads
- article bodies
- large source metadata blobs
- debug traces

### Why it hurts

Every list, filter, and summary scan pays for the whole document shape.

### Better pattern

Keep hot-path records small. Move large cold-path fields to separate tables keyed by the primary record ID.

Use:

- `captures`
  - small, list-safe fields
- `capturePayloads`
  - raw source payloads and large metadata

## 2. Scanning to discover state instead of querying state directly

### Bad pattern

Scan recent records, then derive whether they belong in a queue.

Examples:

- scan recent captures to find which ones have pending review
- scan large record sets to build per-item status counts on read

### Why it hurts

The cost scales with total recent records, not with the number of queue items actually needed.

### Better pattern

Materialize direct query targets.

Examples:

- `captureReviewState`
- `capturePreviews`
- `pendingWorkByOwner`

Denormalization is good when it buys cheaper reads.

## 3. Broad shared-layout subscriptions

### Bad pattern

Put expensive summary queries in global app chrome because several pages “might” want that information.

### Why it hurts

The query reruns everywhere:

- dashboard
- review
- tasks
- notes
- resources
- skills

It becomes hidden background bandwidth.

### Better pattern

Use the smallest possible route-specific query.

Examples:

- nav badge:
  - `hasPendingReview`
- dashboard sidebar:
  - top tags and sync health
- review page:
  - full derived summary

## 4. Search built on top of rich operational records

### Bad pattern

Search by scanning rich records and constructing a temporary search string in the query handler.

### Why it hurts

It forces broad scans over the wrong table and often drags large fields into memory.

### Better pattern

Create search-safe projections:

- normalized title
- normalized author
- short excerpt
- tags or search tokens

Search should happen against small projection records, not the full operational source objects.

## 5. Full-table debug helpers on hosted dev

### Bad pattern

Use `.collect()` freely on hosted development because the dataset still feels “small.”

### Why it hurts

Debug/admin helpers count against the same hosted bandwidth budget. They are especially dangerous because:

- they often read many tables at once
- they get rerun repeatedly during diagnosis
- they are easy to forget in cost discussions because they are not user-facing

### Better pattern

Assume full-table helpers are local-only unless proven otherwise.

Rules:

- run them on local Convex by default
- require narrow scopes for cloud runs
- prefer targeted indexes and limits
- never normalize unrestricted `.collect()` in routine cloud workflows

## 6. Mistaking returned row count for query cost

### Bad pattern

Assume a query is cheap because it only returns a small visible list.

### Why it hurts

Query cost is driven by the scan and document size, not just the final response size.

### Better pattern

Ask these questions for every nontrivial query:

- how many documents can this scan?
- how large is each scanned document?
- how often does this subscription rerun?
- is this query mounted globally or only on one route?
- can I precompute the answer instead?

## What To Do Instead On New Projects

## Use this default architecture

### 1. Separate hot-path and cold-path data early

Hot-path tables:

- list views
- queues
- summaries
- search projections

Cold-path tables:

- raw payloads
- full extracted content
- debug details
- rich metadata blobs

### 2. Build projections on write, not on read

If the UI repeatedly needs:

- a preview
- a queue row
- a search row
- a status summary

then materialize it when the source record changes.

### 3. Prefer tiny existence queries for badges

For nav badges and indicator dots:

- use `take(1)`
- return booleans when possible
- avoid count-shaped queries unless the exact number is necessary

### 4. Treat cloud dev like production for cost

Hosted dev is not free just because it is “dev.”

Policy that works:

- local deployment for default development
- cloud dev only for hosted-only flows

### 5. Add budget guardrails

Before merging a new query:

- define max scan size
- define expected rerun frequency
- note whether the underlying table is slim or fat
- note whether the query belongs in route chrome or a page body

## Practical Review Checklist

When reviewing a reactive backend query, ask:

- Does this scan more records than it returns?
- Does it scan a table with large blob fields?
- Is it mounted in shared chrome?
- Does it join or fan out per returned row?
- Is it reconstructing queue/search state at read time?
- Could a small projection table answer this directly?
- Should this be local-only tooling instead of a cloud dev workflow?

If the answer to two or more is “yes,” the query likely needs redesign.

## Heuristics That Age Well

- Small docs on hot paths
- Big blobs off hot paths
- Boolean queries for badges
- Projection tables for queues and search
- Write-time denormalization over read-time fanout
- Local dev for heavy iteration
- Cloud dev only when a hosted URL is actually required

## A Good Default Rule

If a query exists mainly to support:

- a list
- a badge
- a queue
- a search surface
- a dashboard summary

then optimize for cheap repeated reads first, even if that means more bookkeeping on writes.

That tradeoff is usually correct.
