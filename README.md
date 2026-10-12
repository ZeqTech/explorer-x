<div align="center">

# 📁 Explorer X

**A fast, familiar file explorer for Windows and macOS: one app, one set of shortcuts, native feel on both.**

![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0067c0)
![Tauri](https://img.shields.io/badge/built%20with-Tauri%202-ffc131)
![Size](https://img.shields.io/badge/installer-~1%20MB-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-early%20release-orange)

</div>

Explorer X takes the workflow of Windows File Explorer (breadcrumb address bar, sortable details view, quick access sidebar, drag-and-drop) and makes it work the same way on a Mac, with Cmd shortcuts, Trash and Finder integration where it matters.

<!-- Add a screenshot here once you have one:
![Explorer X](docs/screenshot.png)
-->

## ✨ Features

| | |
|---|---|
| 🧭 **Navigation** | Back / forward / up, clickable breadcrumbs, type any path (`~` works) |
| 🗂️ **Tabs** | Each tab has its own folder and history. Middle-click a folder to open it in a new tab |
| 📌 **Pinned folders** | Pin any folder to the sidebar from the right-click menu |
| ↔️ **Resizable sidebar** | Drag the divider; double-click to reset. Width is remembered |
| 🖼️ **Views** | Details or icon view, sortable columns, adjustable icon size |
| 🎨 **Native icons** | The same file and folder icons your OS shows, plus image thumbnails in icon view |
| 👁️ **Preview pane** | Text, images, audio, video and folder summaries without opening anything (`Alt+P`) |
| ℹ️ **Properties** | Size (including folder totals), dates, attributes, location (`Alt+Enter`) |
| 🖱️ **Right-click menus** | Open, open in terminal, copy path / name, duplicate, pin, properties, show in Explorer / Finder, on files, folders, empty space and the sidebar |
| ✂️ **File operations** | Cut, copy, paste, rename, new folder / file, drag-and-drop (hold Ctrl/Alt to copy) |
| ↩️ **Undo / redo** | Rename, create, move, copy and delete can all be undone (`Ctrl+Z` / `Ctrl+Y`) |
| ⚠️ **Conflict prompts** | Replace, Skip or Keep both when a name already exists, with "do this for all" |
| ⏳ **Progress & cancel** | Big copies and moves show a progress bar and can be cancelled cleanly |
| 🗑️ **Safe delete** | Items go to the Recycle Bin / Trash, and "Replace" sends the old item there too |
| 🔎 **Search** | Recursive filename search in the current folder |
| ⌨️ **Type to select** | Start typing to jump to a file |
| 🌗 **Light & dark** | Follows your OS theme |
| 💾 **Remembers you** | Pins, view, sort order, icon size and sidebar width persist between launches |

## 🚀 Getting started

### Download

Grab the latest installer from the [Releases](../../releases) page:

- **Windows:** `Explorer X_x.y.z_x64-setup.exe` (installer, about 1 MB) or `Explorer X x.y.z portable.exe` (no install)
- **macOS:** `.dmg` (universal: Intel and Apple Silicon)

Windows needs the Microsoft WebView2 runtime, which is already included in Windows 10 (recent updates) and 11.

> Builds are not code-signed yet. On Windows, SmartScreen may show an "unknown publisher" warning (*More info → Run anyway*). On macOS, right-click the app and choose **Open** the first time.

### Run from source

Requires [Node.js](https://nodejs.org) 20+ and [Rust](https://rustup.rs) (the repo pins the version in `rust-toolchain.toml`). On Windows you also need the Visual Studio **C++ build tools**; see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone <this-repo-url>
cd explorer-x
npm install
npm start      # runs the app with hot reload of the UI
npm test       # Rust tests (filesystem layer) + UI unit tests
```

## ⌨️ Keyboard shortcuts

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

## 🛠️ Building installers

```bash
./build.sh win    # Windows installer + portable .exe  -> dist/
./build.sh mac    # macOS universal .dmg (must run on a Mac)
./build.sh all    # everything the current machine can build
```

macOS packages can only be built on macOS. The included GitHub Actions workflow
([`build.yml`](.github/workflows/build.yml)) builds **both** platforms on every push.
Push a version tag to publish a release with the installers attached:

```bash
git tag v0.1.0 && git push --tags
```

## 📂 Use it as your default folder app

Finder (macOS) and `explorer.exe` (Windows) remain the system shells, but Explorer X can be the app that opens folders:

```bash
# macOS: needs duti (brew install duti); undo with the "undo" argument
./scripts/set-default-mac.sh
```
```powershell
# Windows (current user only); undo with -Undo
.\scripts\set-default-windows.ps1
```

Some entry points (desktop double-clicks on macOS, Win+E on Windows) are controlled by the OS and will still use the built-in app.

## 🧱 Project structure

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

## 🗺️ Roadmap

- [x] Tabs
- [x] Native OS file icons (Windows and macOS; Linux uses built-in icons for now)
- [x] Preview pane and Properties dialog
- [x] Undo / redo for rename, create, move, copy and delete
- [x] Copy progress and name-conflict prompts
- [ ] Code signing and auto-update (needs signing keys; see [docs/RELEASING.md](docs/RELEASING.md))

Known limitations, all good first issues:

- Undoing a **delete** works on Windows and Linux. macOS has no public API to restore from the Trash, so use *Put Back* in Finder there.
- Undoing a copy that used **Replace** removes the new copy, but the replaced original stays in the Trash.
- Cancelling a multi-item copy keeps the items that already finished, and they cannot be undone as a group.
- Folder name conflicts replace rather than merge.
- Linux has no native icons yet (the icon library needs the main thread there).
- Drag-and-drop *between* windows and tab reordering are not implemented.

## 🤝 Contributing

Explorer X is fully open source and contributions are very welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Found a security problem? See [SECURITY.md](SECURITY.md).

## 📄 License

[MIT](LICENSE) © Explorer X contributors. Use it, change it, ship it.
