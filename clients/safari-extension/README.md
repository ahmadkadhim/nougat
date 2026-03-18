# Safari Extension

This folder contains the generated Xcode Safari Web Extension project created from:

- `clients/chrome-extension`

Project entry point:

- `clients/safari-extension/Nougat Capture/Nougat Capture.xcodeproj`

To regenerate the Safari project from the current Chrome extension source:

```bash
xcrun safari-web-extension-converter /absolute/path/to/clients/chrome-extension --project-location /absolute/path/to/clients/safari-extension --copy-resources --force
```

If the converter fails with Xcode plug-in loading errors, run:

```bash
xcodebuild -runFirstLaunch
```

Notes:
- The generated project currently uses the Chrome extension resources directly under `Shared (Extension)/Resources/`.
- Safari conversion still warns that the extension manifest does not define icons. That does not block project generation, but icons should be added before shipping.
- After opening the Xcode project, build the macOS app target and enable the extension in Safari.
