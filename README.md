# Nougat (Convex-First)

Knowledge capture system for browser tabs + iOS share sheet, with async enrichment and markdown-first storage.

## What is implemented
- Convex backend with canonical capture contracts.
- TanStack Start frontend shell with Better Auth login and an authenticated dashboard.
- Derived evaluation pipeline for tags, knowledge notes, resources, tasks, skills, viewpoints, and author/source ratings.
- Review queue with approve/reject/edit flow before outputs become durable.
- Secondary views for approved tasks, knowledge items, resources, and skill candidates.
- HTTP API endpoints:
  - `POST /v1/captures`
  - `POST /v1/captures/bulk`
  - `POST /v1/devices/register`
  - `POST /v1/devices/rotate-token`
  - `GET /v1/captures/:captureId`
  - `POST /v1/captures/:captureId/reprocess`
- Device-token auth + per-device rate limit.
- Idempotency window dedupe (`capture_hash + device_id + captured_bucket`).
- Async enrichment pipeline (fast ack + background processing).
- Scheduled X bookmark sync (every 12 hours) feeding the same capture pipeline.
- Source adapters:
  - X (`tweet` + `article` follow-up handling)
  - YouTube (`oEmbed` + transcript when available)
  - Generic web extraction.
- Markdown rendering + frontmatter provenance.
- Operator endpoints for new/failed/dedupe/reprocess and pending markdown export.
- Daily/weekly digest generation jobs.
- Chrome/Safari WebExtension for current-tab, selected-tab, window-tab, and all-open-tab capture with retry queue.
- iOS Shortcut implementation guide + payload contract.

## Project structure
- `src/`: TanStack Start routes, auth proxy route, providers, and dashboard UI.
- `convex/`: backend schema, API routes, pipeline logic, adapters.
- `clients/browser-extension/`: Chrome + Safari compatible WebExtension.
- `clients/safari-extension/`: Safari conversion target (generated via Apple's converter).
- `clients/ios-shortcut/`: iOS Shortcut implementation docs and payload example.
- `docs/api.md`: HTTP endpoint reference.
- `docs/product-brief.md`: product context, scope, and locked decisions.
- `docs/plan.md`: implementation plan and next steps.
- `scripts/sync-markdown.ts`: writes pending markdown docs to local `nougat/` files.
- `tests/`: unit tests for core normalization/hash/markdown contract utilities.

## Convex setup
1. Install deps.
2. Create Convex project/deployment.
3. Configure env values:
   - `CONVEX_URL` (available in `.env.local` after `npx convex dev`)
   - `CONVEX_SITE_URL` (available in `.env.local` after `npx convex dev`)
   - `APP_ORIGIN` (Convex-side Better Auth origin, for example `http://localhost:3000`)
   - `VITE_APP_ORIGIN` (frontend origin for the TanStack Start client)
   - `VITE_CONVEX_URL` (same Convex URL exposed to the browser client)
   - `BETTER_AUTH_SECRET` (required for Better Auth)
   - `X_BEARER_TOKEN` (optional; enables richer enrichment for X URLs. Without it, X captures are stored with minimal metadata.)
   - `X_OAUTH_CLIENT_ID` (required only if this deployment should let users connect their own X account for bookmark sync)
   - `X_OAUTH_CLIENT_SECRET` (required only if this deployment should let users connect their own X account for bookmark sync)
   - `X_BOOKMARKS_USER_ID` (optional override for bookmark sync; otherwise Nougat resolves the X user via the connected account)
   - `OPERATOR_API_KEY` (recommended)

```bash
npm install
npx convex dev
```

## Web app setup
Run the frontend separately from Convex:

```bash
npm run dev:web
```

The app provides:
- email/password login via Better Auth
- an authenticated dashboard at `/dashboard`
- a review queue at `/review`
- approved tasks at `/tasks`
- approved knowledge items at `/knowledge`
- approved resources at `/resources`
- approved skill candidates at `/skills`
- a proxied Better Auth route at `/api/auth/*`

For local development:
- TanStack Start runs on `http://localhost:3000`
- Convex must also have `APP_ORIGIN=http://localhost:3000` set in its env so Better Auth issues non-secure localhost cookies
- the frontend reads `VITE_APP_ORIGIN` and `VITE_CONVEX_URL` from `.env.local`

## X connect flow
If you are self-hosting Nougat and want X features, you need your own X developer app and OAuth 2.0 client credentials. Those secrets are not shared by this repo.

- End users of your hosted deployment do **not** need their own X app secrets. They only need an X account to connect.
- Self-hosters only need X credentials if they want X enrichment or X bookmark sync. The rest of Nougat can run without them.

1. For richer X URL enrichment, optionally set `X_BEARER_TOKEN`.
2. For user-owned X bookmark sync, set `X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET`, and `BETTER_AUTH_SECRET`.
3. Register the callback URL `https://<deployment>.convex.site/v1/operator/x/oauth/callback` in the X app settings.
4. Register your frontend origin in Better Auth via `APP_ORIGIN` and `VITE_APP_ORIGIN`.
5. Open the dashboard and use `Connect X` for the user-owned connection flow, or call the operator OAuth route directly if needed.

## Register a device token
Use extension options `Register Device` button, or call API directly:

```bash
curl -X POST "$INBOX_API_URL/v1/devices/register" \
  -H 'content-type: application/json' \
  -d '{"name":"Mac Chrome","platform":"chrome","scopes":["capture:write"]}'
```

## Export markdown files
The backend stores rendered markdown docs in Convex records (`markdownDocuments`) with deterministic file paths.
Use sync script to write files locally:

```bash
INBOX_API_URL=https://<deployment>.convex.site \
OPERATOR_API_KEY=<operator-key> \
OWNER_AUTH_USER_ID=<better-auth-user-id> \
npm run sync:markdown
```

Output files are created under `nougat/YYYY/MM/DD/` for captures and notes, plus `resources/YYYY/MM/DD/` for approved resources.
The sync script now exports capture markdown documents, approved knowledge-item markdown documents, and approved resource markdown documents.

## Browser extension setup
See: `clients/browser-extension/README.md`

## iOS shortcut setup
See: `clients/ios-shortcut/README.md`

## Testing
```bash
npm test
```

## Notes
- Scheduled X bookmark import uses a user-scoped X access token and runs every 12 hours via Convex cron.
- Preferred X bookmark auth flow:
  - register your Convex callback URL, for example `https://<deployment>.convex.site/v1/operator/x/oauth/callback`, in the X app settings
  - open `https://<deployment>.convex.site/v1/operator/x/oauth/start`
  - approve access in X
  - the callback stores the user access token + refresh token in Convex for ongoing syncs
- v1 intentionally excludes autonomous agent action orchestration.
- vNext keeps generated tasks and skill updates in manual review before approval.
- Resources are intentionally treated as a separate lane from notes, so tool/app/prompt/repo recommendations do not clutter learnings.
- This foundation is designed to feed downstream OpenClaw pipelines with markdown + provenance-rich metadata.
