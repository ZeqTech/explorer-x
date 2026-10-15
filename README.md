<div align="center">

# Explorer X

A file explorer for Windows and macOS.

![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0067c0)
![Tauri](https://img.shields.io/badge/built%20with-Tauri%202-ffc131)
![Size](https://img.shields.io/badge/installer-~1%20MB-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-early%20release-orange)

</div>

Explorer X follows the workflow of Windows File Explorer: a breadcrumb address bar, a sortable details view, a quick-access sidebar and drag-and-drop. It runs the same way on a Mac, with Cmd shortcuts and Trash and Finder integration. Linux builds also work.

<!-- Add a screenshot here once you have one:
![Explorer X](docs/screenshot.png)
-->

## Features

Navigation uses back, forward and up buttons, a clickable breadcrumb bar (the arrows between folders list the folders at that level), and typed paths (`~` works). Each tab keeps its own folder and history, and middle-clicking a folder opens it in a new tab. You can pin any folder to the sidebar from the right-click menu, and on Windows right-click the sidebar to import the folders you pinned to Quick access in File Explorer. Drag the sidebar divider to resize it. Double-click the divider to reset it. Pin changes can be undone with `Ctrl+Z`. The open tabs and the second pane come back the next time you start the app.

Pins can also be added by dragging a folder onto the sidebar, reordered by dragging (or with Move up and Move down), renamed, and jumped to with `Ctrl+1` to `Ctrl+9`. A pin whose folder is gone is struck through. "Copy pins as JSON" and "Paste pins from JSON" back them up or move them to another machine. The sidebar also lists your recent folders and any searches you saved with the Save button next to the search box.

Files show in a details or icon view with sortable columns and an adjustable icon size. The icons are the ones your OS uses, and image files get thumbnails in icon view. The preview pane (`Alt+P`) shows text, images, audio, video or a folder summary without opening anything. The Properties dialog (`Alt+Enter`) shows size, folder totals, dates, attributes and location.

Right-click menus on files, folders, empty space and the sidebar offer Open, Open in terminal, Copy path, Copy name, Duplicate, Pin, Properties, and Show in Explorer or Finder. You can cut, copy, paste, rename, create folders and files, and drag and drop (hold Ctrl or Alt to copy). When a name already exists you choose Replace, Skip or Keep both, with a "do this for all" option. Large copies and moves show a progress bar and can be cancelled. Selecting several items and choosing Rename opens a batch rename dialog with find and replace, numbering and a live preview. "Compress to ZIP" and "Extract to folder" work on zip files, and "Find duplicate files here" lists identical files in a folder so you can send the extra copies to the Trash.

The Split button (`Ctrl+\`) opens a second pane with its own folder. Drag files between the panes, or use "Copy to other pane" and "Move to other pane" in the right-click menu. `F6` moves the keyboard between the file list, the second pane and the sidebar, and each has its own arrow-key, `Enter` and `Delete` controls. Sorting by Size also calculates folder sizes, and the status bar shows free space on the drive and the size of a selected folder.

The Filter button opens a bar to narrow the list by type, size or modified date. Search results can be filtered too, and you can copy, move, compress, rename or delete them, or jump to the folder that holds one with "Open containing folder". "Copy to" and "Move to" let you pick a destination without opening it first, and "Open with" picks another app for a file. Compressing and extracting zip files shows progress and can be cancelled.

Deleting sends items to the Recycle Bin or Trash, and Replace sends the old item there too. Rename, create, move, copy and delete can be undone with `Ctrl+Z` and redone with `Ctrl+Y`.

There is also a recursive filename search of the current folder, and typing a few letters jumps to a matching file. The app follows your OS light or dark theme, and it remembers pins, view, sort order, icon size and sidebar width between launches.

## Getting started

### Download

Get the latest installer from the [Releases](../../releases) page. On Windows, `Explorer X_x.y.z_x64-setup.exe` is the installer (about 1 MB) and `Explorer X x.y.z portable.exe` runs without installing. On macOS there is a `.dmg`, universal for Intel and Apple Silicon.

Windows needs the Microsoft WebView2 runtime, which is already included in Windows 10 (recent updates) and 11.

> Builds are not code-signed yet. On Windows, SmartScreen may show an "unknown publisher" warning (More info, then Run anyway). On macOS, right-click the app and choose Open the first time.

### Run from source

You need [Node.js](https://nodejs.org) 20 or newer and [Rust](https://rustup.rs). The repo pins the Rust version in `rust-toolchain.toml`. On Windows you also need the Visual Studio C++ build tools; see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone <this-repo-url>
cd explorer-x
npm install
npm start      # runs the app with hot reload of the UI
npm test       # Rust tests (filesystem layer) + UI unit tests
```

## Keyboard shortcuts

| Action | Windows | macOS |
| --- | --- | --- |
| Copy / Cut / Paste | `Ctrl+C` / `X` / `V` | `Cmd+C` / `X` / `V` |
| Select all | `Ctrl+A` | `Cmd+A` |
| Focus address bar | `Ctrl+L` | `Cmd+L` |
| Search | `Ctrl+F` | `Cmd+F` |
| Show hidden files | `Ctrl+H` | `Cmd+H` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` | `Cmd+Z` / `Cmd+Shift+Z` |
| Rename | `F2` | `F2` |
| Copy path | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| Properties | `Alt+Enter` | `Cmd+I` |
| Preview pane | `Alt+P` | `Alt+P` |
| New tab | `Ctrl+T` | `Cmd+T` |
| Close tab | `Ctrl+W` | `Ctrl+W` (`Cmd+W` closes the window) |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Delete / Move to Trash | `Delete` | `Cmd+Backspace` |
| Open | `Enter` | `Enter` or `Cmd+↓` |
| Up one folder | `Alt+↑` or `Backspace` | `Cmd+↑` |
| Back / Forward | `Alt+←` / `Alt+→` | `Cmd+[` / `Cmd+]` |
| Refresh | `F5` | `F5` |
| Icon size | `Ctrl+Scroll` | `Cmd+Scroll` |

## Building installers

```bash
./build.sh win    # Windows installer + portable .exe  -> dist/
./build.sh mac    # macOS universal .dmg (must run on a Mac)
./build.sh all    # everything the current machine can build
```

macOS packages can only be built on macOS. The GitHub Actions workflow
([`build.yml`](.github/workflows/build.yml)) builds both platforms on every push.
Push a version tag to publish a release with the installers attached:

```bash
git tag v0.1.0 && git push --tags
```

## Use it as your default folder app

Finder (macOS) and `explorer.exe` (Windows) remain the system shells, but Explorer X can be the app that opens folders:

```bash
# macOS: needs duti (brew install duti); undo with the "undo" argument
./scripts/set-default-mac.sh
```
```powershell
# Windows (current user only); undo with -Undo
.\scripts\set-default-windows.ps1
```

Some entry points, such as desktop double-clicks on macOS and Win+E on Windows, are controlled by the OS and still open the built-in app.

## Project structure

```
ui/                     Frontend (plain HTML/CSS/JS, no build step)
├── index.html
├── styles.css
├── renderer.js         UI behavior: navigation, tabs, selection, menus, undo wiring
├── dialogs.js          Conflict, progress and properties dialogs
├── undo.js             Undo / redo history
├── format.js           Pure helpers (sizes, paths, icon keys)
├── bridge.js           Connects the UI to the Rust commands
└── test/               Node unit tests for the pure modules
src-tauri/
├── src/lib.rs          Tauri app: windows, commands, folder-open handling
├── src/fs_service.rs   Filesystem logic (unit tested)
├── tauri.conf.json     App, security and bundle config
├── Info.plist          Lets macOS offer Explorer X as a folder handler
└── capabilities/       Permissions granted to the UI
scripts/                Default-folder-app helpers, icon generator
build.sh                Cross-platform packaging script
```

The UI runs in the system webview (WebView2 on Windows, WKWebView on macOS) with a strict Content Security Policy. All filesystem access goes through a small set of Rust commands.

## Roadmap

- [x] Tabs
- [x] Native OS file icons (Windows and macOS; Linux uses built-in icons for now)
- [x] Preview pane and Properties dialog
- [x] Undo / redo for rename, create, move, copy and delete
- [x] Copy progress and name-conflict prompts
- [ ] Code signing and auto-update (needs signing keys; see [docs/RELEASING.md](docs/RELEASING.md))

Known limitations, all good first issues:

- Undoing a delete works on Windows and Linux. macOS has no public API to restore from the Trash, so use Put Back in Finder there.
- Undoing a copy that used Replace removes the new copy, but the replaced original stays in the Trash.
- Cancelling a multi-item copy keeps the items that already finished, and they cannot be undone as a group.
- Folder name conflicts replace rather than merge.
- Linux has no native icons yet (the icon library needs the main thread there).
- Drag-and-drop between windows and tab reordering are not implemented.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started and follow the [Code of Conduct](CODE_OF_CONDUCT.md). For security problems, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Explorer X contributors.
