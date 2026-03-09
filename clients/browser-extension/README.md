# Browser Extension (Chrome + Safari)

This is a single WebExtension codebase used for both Chrome and Safari.

## Chrome setup
1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked` and select this folder.
4. Open extension options and set:
   - `API Base URL`
   - `Device Token` (or click `Register Device`)

## Safari setup
Safari can consume the same extension using Apple's converter:

```bash
xcrun safari-web-extension-converter /absolute/path/to/clients/browser-extension --project-location /absolute/path/to/clients/safari-extension --copy-resources --force
```

Then open the generated Xcode project, build, and enable the extension in Safari.

## Features implemented
- Capture current tab.
- Capture selected tabs.
- Capture all tabs in current window.
- Capture all open tabs across browser windows.
- Keyboard shortcuts (`Cmd/Ctrl+Shift+Y` and `Cmd/Ctrl+Shift+U`).
- Retry queue with periodic background flush.
- Client-side filtering for non-web tabs and exact duplicate URLs within a batch.
- Device registration and token rotation from options page.
