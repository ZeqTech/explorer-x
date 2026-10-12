<div align="center">

# 📁 Explorer X

**A fast, familiar file explorer for Windows and macOS: one app, one set of shortcuts, native feel on both.**

![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0067c0)
![Electron](https://img.shields.io/badge/built%20with-Electron-47848f)
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
| 📌 **Pinned folders** | Pin any folder to the sidebar from the right-click menu |
| ↔️ **Resizable sidebar** | Drag the divider; double-click to reset. Width is remembered |
| 🖼️ **Views** | Details or icon view, sortable columns, adjustable icon size |
| 🔍 **Thumbnails** | Image previews right in the icon view |
| ✂️ **File operations** | Cut, copy, paste, rename, new folder / file, drag-and-drop (hold Ctrl/Alt to copy) |
| 🗑️ **Safe delete** | Items go to the Recycle Bin / Trash, never permanently deleted |
| 🔎 **Search** | Recursive filename search in the current folder |
| ⌨️ **Type to select** | Start typing to jump to a file |
| 🌗 **Light & dark** | Follows your OS theme |
| 💾 **Remembers you** | Pins, view, sort order, icon size and sidebar width persist between launches |

## 🚀 Getting started

### Download

Grab the latest installer from the [Releases](../../releases) page:

- **Windows:** `Explorer X Setup x.y.z.exe` (installer) or `Explorer X x.y.z.exe` (portable, no install)
- **macOS:** `.dmg` (Intel and Apple Silicon)

> Builds are not code-signed yet. On Windows, SmartScreen may show an "unknown publisher" warning (*More info → Run anyway*). On macOS, right-click the app and choose **Open** the first time.

### Run from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone <this-repo-url>
cd explorer-x
npm install
npm start
```

## ⌨️ Keyboard shortcuts

| Action | Windows | macOS |
| --- | --- | --- |
| Copy / Cut / Paste | `Ctrl+C` / `X` / `V` | `Cmd+C` / `X` / `V` |
| Select all | `Ctrl+A` | `Cmd+A` |
| Focus address bar | `Ctrl+L` | `Cmd+L` |
| Search | `Ctrl+F` | `Cmd+F` |
| Show hidden files | `Ctrl+H` | `Cmd+H` |
| Rename | `F2` | `F2` |
| Delete / Move to Trash | `Delete` | `Cmd+Backspace` |
| Open | `Enter` | `Enter` or `Cmd+↓` |
| Up one folder | `Alt+↑` or `Backspace` | `Cmd+↑` |
| Back / Forward | `Alt+←` / `Alt+→` | `Cmd+[` / `Cmd+]` |
| Refresh | `F5` | `F5` |
| Icon size | `Ctrl+Scroll` | `Cmd+Scroll` |

## 🛠️ Building installers

```bash
./build.sh win    # Windows installer + portable .exe  -> dist/
./build.sh mac    # macOS .dmg + .zip (must run on a Mac)
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
.scriptsset-default-windows.ps1
```

Some entry points (desktop double-clicks on macOS, Win+E on Windows) are controlled by the OS and will still use the built-in app.

## 🧱 Project structure

```
src/
├── main.js         Electron main process and IPC handlers
├── preload.js      Sandboxed bridge exposed to the UI
├── fs-service.js   Filesystem logic (unit tested)
├── renderer.js     UI behavior
├── index.html      Layout
└── styles.css      Theme and styling
test/               Filesystem service tests  (npm test)
build.sh            Cross-platform packaging script
```

The renderer runs sandboxed with context isolation and a strict Content Security Policy; all filesystem access goes through a small, explicit IPC API.

## 🗺️ Roadmap

- [ ] Tabs
- [ ] Native OS file icons
- [ ] Preview pane and Properties dialog
- [ ] Undo / redo for move, rename and delete
- [ ] Copy progress and name-conflict prompts
- [ ] Code signing and auto-update

## 🤝 Contributing

Issues and pull requests are welcome. Please run `npm test` before submitting.

## 📄 License

No license has been chosen yet. Add a `LICENSE` file (for example MIT) before accepting contributions.
