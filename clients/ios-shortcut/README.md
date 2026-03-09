# iOS Share Sheet Shortcut: Nougat

This folder contains a step-by-step implementation for two shortcuts:

1. `Send to Nougat` (primary share shortcut)
2. `Replay Nougat Queue` (offline retry)

## Required variables (in Shortcuts)
Create these text variables in Shortcuts app:
- `INBOX_API_URL` = `https://<your-convex-deployment>.convex.site`
- `INBOX_DEVICE_TOKEN` = `kbx_...`
- `INBOX_SOURCE_APP` = `ios_share_sheet`

## Shortcut 1: Send to Nougat
1. Create new shortcut and enable `Show in Share Sheet`.
2. Accept input types: `URLs`, `Text`, `Articles`.
3. Add action: `Get Contents of URL` is not first. First normalize input:
   - `If Shortcut Input is URL`:
     - `Set Variable sourceUrl = Shortcut Input`
     - `Set Variable selectedText = ""`
   - `Otherwise`:
     - `Set Variable sourceUrl = "https://capture.local/ios-share/" + Current Date (UNIX)`
     - `Set Variable selectedText = Shortcut Input as Text`
4. Build Dictionary with keys:
   - `source_url`: `sourceUrl`
   - `captured_at`: `Current Date` as UNIX milliseconds
   - `capture_method`: `share_sheet`
   - `source_app`: `INBOX_SOURCE_APP`
   - `selected_text`: `selectedText`
   - `title_hint`: `Get Name of Shortcut Input` (optional)
   - `source_metadata`: nested dictionary with `ios_app`, `device_name`, `input_type`
5. Add action `Get Contents of URL`:
   - URL: `INBOX_API_URL + "/v1/captures"`
   - Method: `POST`
   - Headers:
     - `Content-Type: application/json`
     - `Authorization: Bearer INBOX_DEVICE_TOKEN`
   - Request Body: JSON dictionary from step 4.
6. Add failure branch:
   - If status code is not 2xx, append dictionary to local queue file `iCloud Drive/Shortcuts/nougat_retry_queue.json`.

## Shortcut 2: Replay Nougat Queue
1. Create shortcut named `Replay Nougat Queue`.
2. Read file `iCloud Drive/Shortcuts/nougat_retry_queue.json`.
3. If empty, exit.
4. Repeat each queued item:
   - POST to `/v1/captures` with same headers and body.
   - If success, remove from queue.
5. Overwrite queue file with remaining failed items.

## JSON payload reference
See `payload-example.json` for request shape.
