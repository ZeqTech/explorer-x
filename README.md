# Explorer X

A cross-platform file explorer for Windows and macOS (Linux works too), modeled on Windows Explorer. Built with Electron.

## Features

- Back / forward / up navigation, breadcrumb address bar (click to type a path, `~` supported)
- Details and icon views, sortable columns, adjustable icon size (slider or Ctrl/Cmd + scroll)
- Image thumbnails in icon view
- Resizable sidebar with **pinned folders**, quick access and drives
- Cut / copy / paste, rename, new folder / file, drag-and-drop move (hold Ctrl/Alt to copy)
- Delete sends items to the Recycle Bin / Trash
- Recursive search, hidden-files toggle, type-to-select
- Light and dark themes (follows the OS); preferences persist between launches
- Platform-native shortcuts (Ctrl on Windows, Cmd on macOS)

## Keyboard shortcuts

| Action | Windows | macOS |
| --- | --- | --- |
| Copy / Cut / Paste | Ctrl+C / X / V | Cmd+C / X / V |
| Select all | Ctrl+A | Cmd+A |
| Address bar | Ctrl+L | Cmd+L |
| Search | Ctrl+F | Cmd+F |
| Show hidden | Ctrl+H | Cmd+H |
| Rename | F2 | F2 |
| Delete | Delete | Cmd+Backspace |
| Up | Alt+Up / Backspace | Cmd+Up |
| Back / Forward | Alt+Left / Right | Cmd+[ / ] |

## Development

Requires Node.js 20+.

```bash
npm install
npm start      # run the app
npm test       # filesystem service tests
```

## Building installers

```bash
./build.sh win    # Windows installer + portable .exe  -> dist/
./build.sh mac    # macOS .dmg + .zip (must run on a Mac)
```

macOS builds can only be produced on macOS. The included GitHub Actions workflow
(`.github/workflows/build.yml`) builds both on every push; pushing a tag like `v0.1.0`
also publishes a GitHub Release with the installers attached.

> Builds are unsigned: Windows SmartScreen and macOS Gatekeeper will warn on first launch
> (macOS: right-click the app and choose Open).

## Project layout

```
src/main.js         Electron main process + IPC handlers
src/preload.js      Sandboxed bridge exposed to the renderer
src/fs-service.js   Filesystem logic (unit tested)
src/renderer.js     UI
```
