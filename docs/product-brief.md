# Nougat Product Brief

## Purpose
Nougat is a personal knowledge inbox for high-volume AI and tech discovery. The core job is to capture URLs and snippets from browser tabs and iOS share targets, import high-signal sources that already exist inside other platforms, enrich the source content, and turn each item into markdown with complete provenance so it can feed an agentic knowledge system.

The target workflow is:
- capture one tab, many tabs, or any iOS share target quickly
- import saved discoveries from systems that already act as an inbox, especially X bookmarks
- normalize and enrich the source in the background
- persist a markdown artifact plus structured metadata
- make the resulting corpus easy for agents to search, synthesize, connect, and turn into action later

## Problem Statement
The current pain point is tab overload across Chrome, Safari, and iOS apps such as Safari, X, YouTube, LinkedIn, and Substack. Useful content gets fragmented across devices and apps, while later knowledge processing depends on capturing enough metadata and content to make the item usable by downstream agents.

X is not just another capture source. It is one of the highest-value discovery channels in the existing workflow because many of the best tips, tools, and AI references are found there first and saved as bookmarks for later processing.

There is already a working OpenClaw system that pulls X bookmarks through the X API twice a day. Re-implementing that workflow inside Nougat matters for reliability and continuity: the product should preserve the same "save in X first, process later" behavior instead of assuming every valuable item will be manually shared from a browser or phone.

X also remains a source-specific enrichment edge case: bookmark and post payloads may not contain full article content, so Nougat needs follow-up enrichment to retrieve the actual linked article body where possible.

## Core Workflow: X Bookmarks
The intended X workflow is:
- save promising posts to X bookmarks during normal browsing
- run a server-side X bookmark sync twice a day
- ingest newly discovered bookmarks into Nougat without requiring manual share actions
- dedupe against previously imported bookmarks and already-captured URLs
- enrich the post itself plus any linked article or tool page
- render the final item into markdown with provenance showing it originated from an X bookmark import

This workflow is important because it turns an existing personal habit into a reliable ingestion channel instead of asking for new capture behavior.

## Product Scope for v1
Included in v1:
- public inbox API
- Chrome extension for current tab, selected tabs, and full-window capture
- Safari support via the same WebExtension source and Safari conversion flow
- iOS share-sheet shortcut flow
- scheduled X bookmark import via the X API, running twice daily
- async enrichment for X, YouTube, and generic web pages
- markdown-first storage with full provenance metadata
- operator views or endpoints for failed items, dedupe conflicts, pending markdown export, and reprocessing
- daily and weekly digest generation

Explicitly deferred to v2:
- autonomous agent execution
- automatic task creation
- automatic skill creation
- approval workflows for higher-impact downstream actions

## Locked Decisions
- Backend platform: Convex
- Ingress model: public API
- Auth model: device-scoped revocable tokens
- Processing model: fast acknowledgement plus async enrichment
- X bookmark intake: first-class source, imported by scheduled server-side sync rather than manual sharing alone
- Storage model: markdown as source of truth, with a metadata index for operational queries
- Metadata policy: preserve original provenance wherever possible, including URL, canonical URL, platform, author, platform-specific IDs, capture time, device, and capture method
- Safari support: included at launch
- Post-capture autonomy: deferred beyond indexing and digest generation

## Success Criteria
- Captures can be sent reliably from Chrome, Safari, and iOS
- New X bookmarks are imported automatically on the twice-daily schedule without missing or duplicating items
- Bulk tab capture is fast enough that it feels instant to use
- Every accepted capture produces a durable record with complete frontmatter
- Duplicate captures are suppressed within the configured idempotency window
- Failed enrichments are visible and reprocessable
- The output corpus is suitable for downstream OpenClaw-style agent workflows without additional manual cleanup

## Primary Risks
- X API access, rate limits, or bookmark endpoint changes could disrupt the scheduled import path
- X content fidelity may vary based on available API fields and linked article accessibility
- Generic web extraction quality will vary across site structures and paywalls
- Markdown export currently relies on a sync step from Convex records to the local filesystem
- Convex generated bindings must stay in sync with schema and function changes
