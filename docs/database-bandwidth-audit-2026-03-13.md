# Database Bandwidth Audit

Date: March 13, 2026

## Executive summary

The current bandwidth usage is not normal for "one light user," but it is explainable from the codebase.

The main problem is not write volume. It is a combination of:

- hot dashboard queries subscribing reactively in the browser
- those queries reading `captures` rows that still contain large cold-path fields such as `rawPayload` and `sourceMetadata`
- several filters being applied after broad reads instead of via narrower indexes

That combination makes cloud dev especially expensive. A single open dashboard tab can repeatedly reread oversized capture rows whenever related data changes, hot reload reconnects, or a fresh subscription is created.

## What the screenshots imply

From the Convex dashboard screenshots:

- `dashboard.getDashboardData` dominates read bandwidth at roughly `1.22 GB`
- `derived.getReviewQueue` is next at roughly `276 MB`
- `dashboard.listDashboardCaptures` is next at roughly `262 MB`
- writes are tiny in comparison

This strongly suggests read amplification rather than user load.

If this were caused primarily by actual product usage, we would expect a broader spread across user-triggered mutations and more balanced read/write growth. Instead, the biggest offenders are route-level queries that power the dashboard and review UI.

## Repo-grounded findings

### 1. `captures` is still too large for a hot table

`captures` currently stores both hot-path preview fields and cold-path blobs:

- `rawPayload`
- `sourceMetadata`
- `selectedText`
- `tabContext`

Code references:

- `convex/schema.ts`
- `convex/dashboard.ts`
- `convex/derived.ts`
- `convex/lib/activity.ts`

Because list and review queries read `captures` directly, every scan pays for those large fields even when the UI only needs a title, author, status, and small preview data.

### 2. The dashboard was using reactive subscriptions for expensive reads

The dashboard page was subscribing with `useQuery` to:

- `dashboard.getDashboardData`
- `dashboard.listDashboardCaptures`

That means the browser kept live watches open for the heaviest read paths. In cloud dev, this is costly because reconnects, query invalidations, and active editing sessions can repeatedly rerun those reads.

Code reference:

- `src/components/dashboard-shell.tsx`

### 3. `getDashboardData` was still doing status filtering after broad reads

Before this audit, `getDashboardData` loaded recent `captures` by owner and then filtered for `failed` and `dead_letter`. That can force Convex to scan many capture rows just to find a few failures.

Code reference:

- `convex/dashboard.ts`

### 4. `listDashboardCaptures` still reads broad recent windows

The dashboard list query currently reads a recent window of captures and then applies:

- platform filtering in memory
- status filtering in memory
- text search in memory
- per-capture tag lookups
- per-capture "needs review" checks

This is better than an unrestricted collect, but it is still expensive when the source rows are fat.

Code reference:

- `convex/dashboard.ts`

### 5. `getReviewQueue` is still discovery-heavy

The review queue does all of this at read time:

1. loads recent captures
2. loads related entity tables per capture
3. filters to pending review items
4. loads feedback rows for the surviving entities

That makes `derived.getReviewQueue` a structurally expensive query even after earlier trimming work.

Code reference:

- `convex/derived.ts`

## Changes applied in this audit

### Immediate reduction 1: local Convex is now the default dev path

Updated `package.json`:

- `npm run dev` now uses `convex dev --local`
- `npm run dev:cloud` is available for the hosted deployment when needed

Why this matters:

- most day-to-day UI iteration no longer burns cloud bandwidth
- cloud dev is reserved for flows that truly need a hosted URL

### Immediate reduction 2: dashboard reads are now one-shot fetches instead of live subscriptions

Updated `src/components/dashboard-shell.tsx` to fetch:

- `dashboard.getDashboardData`
- `dashboard.listDashboardCaptures`

through the Convex client `query()` method instead of `useQuery`.

Why this matters:

- idle dashboard tabs no longer keep heavyweight subscriptions open
- hot reload and reconnect behavior should cost much less
- data still refreshes when filters change or after important dashboard mutations

### Immediate reduction 3: added narrower capture indexes and used them

Added:

- `by_owner_platform_created_at`
- `by_owner_status_created_at`

Updated `convex/dashboard.ts` so:

- failed/dead-letter reads use the status index directly
- dashboard capture listing can use a platform or status-specific index before any in-memory filtering

Why this matters:

- fewer capture rows need to be scanned per query execution
- the most common dashboard filters now have a cheaper starting point

## Why GBs can happen with one user

Yes, unfortunately it is possible.

In your current setup, one user can still generate GB-scale reads when:

- the dashboard is left open in cloud dev
- capture rows contain large payload blobs
- the page uses reactive subscriptions
- the app or dev tooling reconnects several times during a work session

The key idea is:

- Convex bandwidth is about bytes read and sent, not "number of humans"

One person repeatedly rereading large documents can be more expensive than many people reading small ones.

## Highest-leverage next steps

### 1. Split cold payloads out of `captures`

Create a new table such as `capturePayloads` for:

- `rawPayload`
- `sourceMetadata`
- possibly `selectedText`
- possibly `tabContext`

Keep `captures` lean and preview-first.

Expected impact: very high

### 2. Add a materialized `capturePreviews` table

Store the fields the dashboard and review surfaces actually need:

- title
- author
- status
- excerpt
- canonical URL
- posted/sourced timestamps
- lightweight X preview data
- review-needed summary flag if possible

Expected impact: very high

### 3. Materialize review state

Add a `captureReviewState` projection keyed by capture:

- `hasPendingReview`
- `pendingCount`
- counts by lane/status
- lightweight display fields

Then `getReviewQueue` becomes a targeted lookup instead of a scan-and-derive query.

Expected impact: high

### 4. Keep cloud debug helpers on a short leash

Avoid running broad admin helpers against cloud dev unless they are tightly scoped.

Watch especially for:

- `.collect()`
- whole-table debug snapshots
- migration helpers without limits

Expected impact: medium

## Practical operating guidance

Use cloud dev only for:

- OAuth callback testing
- public endpoint testing
- final shared-environment checks

Use local Convex for:

- routine UI work
- query shaping
- schema changes
- review flow iteration
- evaluator tuning

## Bottom line

You are not "using it too much." The current query shapes and data model are simply still too expensive for a cloud-reactive dev workflow.

The changes in this audit should reduce unnecessary cloud burn immediately, but the long-term fix is to stop treating full `captures` rows as the read model for dashboard and review surfaces.
