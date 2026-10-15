# Features

A running list of what Explorer X can do and when each feature arrived, so it is easy to see what the
app has without reading the code. Add a row whenever a user-facing feature is added, changed or removed
(see [CLAUDE.md](CLAUDE.md)). `CHANGELOG.md` records releases; this file describes the app as it is now.

The **Added** column holds a release version, or a date for work not released yet.

## Browsing

| Feature | How to use it | Added |
| --- | --- | --- |
| Address bar and breadcrumbs | Click a folder name to jump to it, or click the bar to type a path (`~` works) | initial |
| Back, forward, up | Toolbar buttons, `Alt+Left`, `Alt+Right`, `Alt+Up`, `Backspace` | initial |
| Tabs | `Ctrl+T` new tab, `Ctrl+W` close, `Ctrl+Tab` cycle, middle-click a folder to open it in a new tab | initial |
| Details and icon views | The **View** button; the slider or `Ctrl+scroll` changes icon size | initial |
| Sorting | Click a column header or use the **Sort** menu | initial |
| Native file icons and image thumbnails | Automatic | initial |
| Preview pane | `Alt+P`: text, images, audio, video, folder summary | initial |
| Properties | `Alt+Enter` or right-click | initial |
| Type-ahead | Type a few letters to jump to a matching file | initial |
| Search | The search box searches the current folder and everything below it | initial |
| Show hidden items | **Hidden** button or `Ctrl+H` | initial |
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
| Compress and extract ZIP | Right-click: **Compress to ZIP**, **Extract to folder** | 2026-10-15 |
| Find duplicate files | Right-click a folder or empty space: **Find duplicate files here** | 2026-10-15 |
| Open terminal here | Right-click | initial |

## Releases

| Feature | How to use it | Added |
| --- | --- | --- |
| Version bump and changelog | `./make.sh bump patch\|minor\|major` | 2026-10-15 |
| Changelog preview | `./make.sh changelog` | 2026-10-15 |
