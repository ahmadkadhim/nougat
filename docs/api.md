# Nougat HTTP API

Base URL: your Convex deployment URL (e.g. `https://your-deployment.convex.site`)

## Auth
Use device token in header:

```http
Authorization: Bearer kbx_...
```

## Device endpoints
### `POST /v1/devices/register`
Registers a capture device and returns a token.

### `POST /v1/devices/rotate-token`
Rotates the current token.

## Capture endpoints
### `POST /v1/captures`
Body (`CaptureRequest`):

```json
{
  "source_url": "https://x.com/user/status/123",
  "captured_at": 1762651200000,
  "capture_method": "single_tab",
  "source_app": "chrome_extension",
  "title_hint": "Optional",
  "selected_text": "Optional",
  "tab_context": "Optional",
  "platform_hint": "Optional",
  "source_metadata": {"any": "json"},
  "idempotency_key": "Optional"
}
```

Supported `capture_method` values: `single_tab`, `selected_tabs`, `window_tabs`, `all_tabs`, `share_sheet`, `manual`, `x_bookmark_sync`.

Returns `202 Accepted` with capture id and dedupe status.

### `POST /v1/captures/bulk`
Body:

```json
{ "requests": ["CaptureRequest", "..."] }
```

### `GET /v1/captures/:captureId`
Fetches capture status + enrichment + markdown document info.

### `POST /v1/captures/:captureId/reprocess`
Requeues enrichment processing for a capture.

## Operator endpoints (require `x-operator-key` if configured)
### `GET /v1/operator/captures/new?limit=50`
### `GET /v1/operator/captures/failed?limit=50`
### `GET /v1/operator/captures/dedupe-conflicts?limit=50`
### `POST /v1/operator/captures/:captureId/reprocess`
### `GET /v1/operator/markdown/pending?limit=100`
### `POST /v1/operator/markdown/:documentId/exported`
### `GET /v1/operator/digests?limit=20`

## Compatibility fallback endpoints
These are included to support environments where path-param routing is constrained:
- `GET /v1/capture-status?capture_id=...`
- `POST /v1/capture-reprocess`
- `POST /v1/operator/reprocess-capture`
- `POST /v1/operator/markdown/mark-exported`
