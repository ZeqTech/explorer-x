// Connects the UI to the Rust backend. Exposes the same window.fsapi.
(() => {
  const { invoke, convertFileSrc } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  const call = async (cmd, args) => {
    try { return await invoke(cmd, args); }
    catch (e) { throw new Error(typeof e === 'string' ? e : (e && e.message) || String(e)); }
  };

  window.fsapi = {
    list: (dir, showHidden) => call('list_dir', { dir, showHidden: !!showHidden }),
    copy: (srcs, destDir) => call('copy_into', { srcs, destDir }),
    move: (srcs, destDir) => call('move_into', { srcs, destDir }),
    rename: (path, newName) => call('rename_path', { path, newName }),
    mkdir: (dir) => call('make_dir', { dir }),
    newFile: (dir) => call('new_file', { dir }),
    search: (root, query) => call('search', { root, query }),
    drives: () => call('drives'),
    quickAccess: () => call('quick_access'),
    trash: (paths) => call('trash_paths', { paths }),
    open: (path) => call('open_path', { path }),
    reveal: (path) => call('reveal_path', { path }),
    isDir: (path) => call('is_dir', { path }),
    home: () => call('home_dir'),
    platform: () => call('platform'),
    newWindow: (path) => call('new_window', { path }),
    clipboardWrite: (paths, cut) => call('clipboard_write', { paths, cut }),
    clipboardRead: () => call('clipboard_read'),
    copyText: (text) => call('clipboard_text', { text }),
    openTerminal: (path) => call('open_terminal', { path }),
    // URL the webview can use to display a local file (used for image thumbnails)
    fileUrl: (path) => convertFileSrc(path),
    // Folder this window was opened for, if any
    startPath: () => window.__START_PATH__ || null,
    // Fired when the OS asks the running app to open a folder (macOS)
    onOpenPath: (cb) => listen('open-path', (e) => cb(e.payload)),
  };
})();
