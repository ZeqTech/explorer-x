// Connects the UI to the Rust backend. Exposes window.fsapi.
(() => {
  const { invoke, convertFileSrc } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  const call = async (cmd, args) => {
    try { return await invoke(cmd, args); }
    catch (e) { throw new Error(typeof e === 'string' ? e : (e && e.message) || String(e)); }
  };

  let opSeq = 0;
  const newOpId = () => 'op' + Date.now() + '-' + (opSeq++);

  window.fsapi = {
    list: (dir, showHidden) => call('list_dir', { dir, showHidden: !!showHidden }),
    // copy/move resolve to [{from, to}] for each item that was copied/moved.
    // `resolutions` maps a source path to 'replace' | 'skip' | 'keep'; `opId` lets a progress UI
    // follow (onProgress) and cancel (cancelOp) the operation.
    copy: (srcs, destDir, resolutions, opId) => call('copy_into', { opId: opId || newOpId(), srcs, destDir, resolutions: resolutions || null }),
    move: (srcs, destDir, resolutions, opId) => call('move_into', { opId: opId || newOpId(), srcs, destDir, resolutions: resolutions || null }),
    newOpId,
    cancelOp: (opId) => call('cancel_op', { opId }),
    findConflicts: (srcs, destDir) => call('find_conflicts', { srcs, destDir }),
    onProgress: (cb) => listen('op-progress', (e) => cb(e.payload)),
    renameMany: (pairs) => call('rename_many', { pairs }),
    createPath: (path, isDir) => call('create_path', { path, isDir }),
    rename: (path, newName) => call('rename_path', { path, newName }),
    mkdir: (dir) => call('make_dir', { dir }),
    newFile: (dir) => call('new_file', { dir }),
    search: (root, query) => call('search', { root, query }),
    drives: () => call('drives'),
    quickAccess: () => call('quick_access'),
    importExplorerPins: () => call('import_explorer_pins'),
    trash: (paths) => call('trash_paths', { paths }),
    restoreTrashed: (paths) => call('restore_trashed', { paths }),
    properties: (path) => call('properties', { path }),
    dirStats: (path) => call('dir_stats', { path }),
    textPreview: (path, maxBytes) => call('text_preview', { path, maxBytes: maxBytes || 8192 }),
    fileIcon: (path, isDir) => call('file_icon', { path, isDir: !!isDir }),
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
