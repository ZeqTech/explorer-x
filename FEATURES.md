# Features

A running list of what Explorer X can do and when each feature arrived, so it is easy to see what the
app has without reading the code. Add a row whenever a user-facing feature is added, changed or removed
(see [CLAUDE.md](CLAUDE.md)). `CHANGELOG.md` records releases; this file describes the app as it is now.

The **Added** column holds a release version, or a date for work not released yet.

## Browsing

| Feature | How to use it | Added |
| --- | --- | --- |
| Address bar and breadcrumbs | Click a folder name to jump to it, or click the bar to type a path (`~` works) | initial |
| Breadcrumb dropdowns | Click the `›` between folders in the address bar to list the folders at that level and jump to one | 2026-10-15 |
| Back, forward, up | Toolbar buttons, `Alt+Left`, `Alt+Right`, `Alt+Up`, `Backspace` | initial |
| Tabs | `Ctrl+T` new tab, `Ctrl+W` close, `Ctrl+Tab` cycle, middle-click a folder to open it in a new tab | initial |
| Remembers tabs and split view | Open tabs, the active tab and the split pane come back when you start the app again | 2026-10-15 |
| Details and icon views | The **View** button; the slider or `Ctrl+scroll` changes icon size | initial |
| Sorting | Click a column header or use the **Sort** menu | initial |
| Native file icons and image thumbnails | Automatic | initial |
| Preview pane | `Alt+P`: text, images, audio, video, folder summary | initial |
| Properties | `Alt+Enter` or right-click | initial |
| Type-ahead | Type a few letters to jump to a matching file | initial |
| Search | The search box searches the current folder and everything below it | initial |
| Free space | The status bar shows free and total space of the drive you are browsing | 2026-10-15 |
| Folder size in the status bar | Select one folder to see its total size (calculated in the background) | 2026-10-15 |
| Show hidden items | **Hidden** button or `Ctrl+H` | initial |
| Keyboard navigation in the sidebar | `F6` moves focus between the file list, the second pane and the sidebar (`Shift+F6` goes back). In the sidebar: arrows, `Home`/`End`, `Enter` to open, `Delete` to unpin, `F2` to rename a pin, `Alt+Up`/`Alt+Down` to reorder, `Shift+F10` for the menu | 2026-10-15 |
| Keyboard navigation in the split pane | With the second pane focused: arrows (with `Shift` to extend), `Enter`, `Backspace`, `Delete`, `Ctrl+A`, `Ctrl+C`/`X`/`V` | 2026-10-15 |
| Filter by type, size or date | The **Filter** button opens a bar: type (folders, images, video, audio, documents, archives, code, programs), size and modified date. Works on folders and on search results; closing the bar or opening another folder clears it | 2026-10-15 |
| Sort folders by size | Sort by **Size**: folder sizes are calculated in the background | 2026-10-15 |
| Split view | **Split** button or `Ctrl+\`: a second pane with its own folder; drag files between panes or use Copy to / Move to other pane | 2026-10-15 |
| Saved searches | **Save** next to the search box adds the search to the sidebar | 2026-10-15 |

## Sidebar and pins

| Feature | How to use it | Added |
| --- | --- | --- |
| Pins | Right-click a folder, or drag a folder onto the sidebar | initial / 2026-10-15 |
| Import pins from File Explorer | Right-click the sidebar (Windows) | 2026-10-15 |
| Reorder pins | Drag a pin, or **Move up** / **Move down** in its menu | 2026-10-15 |
| Rename pins | **Rename pin…** in the pin's menu | 2026-10-15 |
| Missing-pin indicator | A pin whose folder is gone is struck through | 2026-10-15 |
| Copy / paste pins as JSON | Right-click the sidebar | 2026-10-15 |
| Pin shortcuts | `Ctrl+1` to `Ctrl+9` open the first nine pins | 2026-10-15 |
| Recent folders | The **Recent** section lists folders you visited lately | 2026-10-15 |
| Undo for pin changes | `Ctrl+Z` / `Ctrl+Y` also undo and redo pinning, unpinning, reordering, renaming and importing pins | 2026-10-15 |
| Collapsible sidebar sections | Click a heading (Pinned, Recent, Saved searches, Quick access, This computer) to fold it; a folded heading shows how many items it holds. Folded sections are remembered. With the keyboard, `Left` / `Right` fold and unfold the highlighted section | 2026-10-15 |
| Resizable sidebar | Drag the divider; double-click to reset | initial |

## File operations

| Feature | How to use it | Added |
| --- | --- | --- |
| Cut, copy, paste, rename, delete | Toolbar, right-click menu and the usual shortcuts | initial |
| Drag and drop | Drag to move; hold `Ctrl` or `Alt` to copy | initial |
| Conflict handling | Replace, Skip or Keep both, with "do this for all" | initial |
| Progress and cancel for large copies and moves | Appears automatically | initial |
| Undo and redo | `Ctrl+Z` and `Ctrl+Y` | initial |
| Delete to Recycle Bin / Trash | `Delete` | initial |
| Batch rename | Select several items and choose **Rename…**: find and replace, numbering, live preview | 2026-10-15 |
| Compress and extract ZIP | Right-click: **Compress to ZIP**, **Extract to folder**. Large archives show progress and can be cancelled; a cancelled job leaves nothing behind | 2026-10-15 |
| Find duplicate files | Right-click a folder or empty space: **Find duplicate files here** | 2026-10-15 |
| Copy to… and Move to… | Right-click: pick a destination from pins, recent folders and the second pane, or type a path. Works on search results | 2026-10-15 |
| Bulk actions on search results | Select search hits and cut, copy, delete, compress, copy paths, batch rename (within one folder) or **Open containing folder**; the results stay in place afterwards | 2026-10-15 |
| Open with… | Right-click a file: on Windows this opens the system app picker; on macOS and Linux you type the application | 2026-10-15 |
| Open terminal here | Right-click | initial |

## Keyboard shortcuts

| Feature | How to use it | Added |
| --- | --- | --- |
| See every shortcut | **More ▾** then **Keyboard shortcuts…**, or `F1`: all actions grouped, with their keys and a search box | 2026-10-15 |
| Change shortcuts | In that dialog click **+** (or **Set a shortcut**) next to an action and press the keys. A key belongs to one action, so it is taken from the action that had it. **×** removes a key, **↺** restores an action's default, **Reset all** restores everything. Changes are saved at once | 2026-10-15 |
| Shortcuts for more actions | Compress, Copy to, Move to, Open with, New text file, Duplicate, Open terminal here, Find duplicates, Pin this folder, Filter bar and Switch view have no key until you give them one | 2026-10-15 |
| Button tooltips follow your keys | Hover a toolbar button to see its current shortcut | 2026-10-15 |

## Releases

| Feature | How to use it | Added |
| --- | --- | --- |
| Version bump and changelog | `./make.sh bump patch\|minor\|major` | 2026-10-15 |
| Changelog preview | `./make.sh changelog` | 2026-10-15 |
