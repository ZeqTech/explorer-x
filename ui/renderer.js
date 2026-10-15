import { iconKey, fmtSize, fmtDate, fmtDateTime, typeOf, parentOf as parentOfSep, joinPath as joinPathSep, baseName, plural, invertMoves, parsePins } from './format.js';
import { UndoStack } from './undo.js';
import { el, conflictDialog, promptDialog, progressDialog, propertiesDialog, multiPropertiesDialog, dialogOpen } from './dialogs.js';

(() => {
  const api = window.fsapi;
  const $ = (id) => document.getElementById(id);
  const state = {
    cwd: null, history: [], hi: -1, entries: [], sel: new Set(), anchor: null,
    sortKey: 'name', sortDir: 1, view: 'details', showHidden: false, preview: false, cut: new Set(),
    mac: false, sep: '/', searchMode: false, pins: [], pinNames: {}, icon: 64, navw: 230,
  };

  // Per-user preferences, persisted in localStorage (best effort).
  const PREF_KEYS = ['pins', 'pinNames', 'icon', 'navw', 'view', 'sortKey', 'sortDir', 'showHidden', 'preview'];
  const savePrefs = () => {
    try { localStorage.setItem('explorerx', JSON.stringify(Object.fromEntries(PREF_KEYS.map((k) => [k, state[k]])))); } catch { /* ignore */ }
  };
  const loadPrefs = () => {
    try { const p = JSON.parse(localStorage.getItem('explorerx') || '{}'); for (const k of PREF_KEYS) if (k in p) state[k] = p[k]; } catch { /* ignore */ }
  };
  const fileUrl = (p) => api.fileUrl(p);
  const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);
  const applyLayout = () => {
    document.documentElement.style.setProperty('--icon', state.icon + 'px');
    document.documentElement.style.setProperty('--navw', state.navw + 'px');
    $('zoom').value = state.icon;
  };

  // Native OS icons: loaded when an item scrolls into view; the emoji below is shown until then
  // (and stays on platforms where no native icon is available).
  const nativeIcons = new Map(); // cache key -> Promise<data URL | null>
  const nativeIcon = (e) => {
    const k = iconKey(e);
    if (!nativeIcons.has(k)) nativeIcons.set(k, api.fileIcon(e.path, e.isDir).catch(() => null));
    return nativeIcons.get(k);
  };
  const fillIcon = (holder) => {
    const e = holder._entry;
    if (!e) return;
    nativeIcon(e).then((url) => {
      if (!url || !holder.isConnected) return;
      const img = document.createElement('img'); img.className = 'nicon'; img.alt = ''; img.src = url; img.draggable = false;
      holder.textContent = ''; holder.appendChild(img);
    });
  };
  const iconObserver = new IntersectionObserver((hits) => {
    for (const h of hits) if (h.isIntersecting) { iconObserver.unobserve(h.target); fillIcon(h.target); }
  }, { root: $('files'), rootMargin: '300px' });
  const lazyIcon = (holder, e) => { holder._entry = e; iconObserver.observe(holder); };

  const icon = (e) => (e.isDir ? '\u{1F4C1}' : { png: '\u{1F5BC}', jpg: '\u{1F5BC}', jpeg: '\u{1F5BC}', gif: '\u{1F5BC}', mp3: '\u{1F3B5}', wav: '\u{1F3B5}', mp4: '\u{1F39E}', mkv: '\u{1F39E}', zip: '\u{1F5DC}', pdf: '\u{1F4D5}' }[e.ext] || '\u{1F4C4}');
  const parentOf = (p) => parentOfSep(p, state.sep);
  const joinPath = (d, n) => joinPathSep(d, n, state.sep);
  const toast = (msg) => { $('selinfo').textContent = msg; };
  // A message that survives the next redraw (used when the caller refreshes right after).
  let pendingToast = null;
  const toastAfterRender = (msg) => { pendingToast = msg; };
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast('Error: ' + e.message); } };

  // ---- undo / redo ------------------------------------------------------
  const undoStack = new UndoStack();
  const updateUndoUi = () => {
    $('undo').disabled = !undoStack.canUndo;
    $('redo').disabled = !undoStack.canRedo;
    $('undo').title = undoStack.canUndo ? 'Undo ' + undoStack.undoLabel + ' (Ctrl+Z)' : 'Nothing to undo';
    $('redo').title = undoStack.canRedo ? 'Redo ' + undoStack.redoLabel + ' (Ctrl+Y)' : 'Nothing to redo';
  };
  const record = (entry) => { undoStack.push(entry); updateUndoUi(); };
  const doUndo = guard(async () => {
    let label = null;
    try { label = await undoStack.undo(); } finally { updateUndoUi(); await refresh(); }
    if (label) toast('Undid: ' + label);
  });
  const doRedo = guard(async () => {
    let label = null;
    try { label = await undoStack.redo(); } finally { updateUndoUi(); await refresh(); }
    if (label) toast('Redid: ' + label);
  });

  // Copies or moves `srcs` into `destDir` and records how to undo it. Resolves to [{from, to}].
  const activeOps = new Map(); // opId -> progress dialog
  api.onProgress((p) => { const d = activeOps.get(p.opId); if (d) d.update(p); });

  async function transfer(kind, srcs, destDir) {
    const verb = kind === 'move' ? 'Moving' : 'Copying';
    const label = (kind === 'move' ? 'Move ' : 'Copy ') + plural(srcs.length, 'item');

    // Names that already exist in the destination: ask what to do (Replace / Skip / Keep both).
    const conflicts = await api.findConflicts(srcs, destDir);
    let resolutions = null;
    if (conflicts.length) {
      resolutions = await conflictDialog(conflicts, baseName(destDir));
      if (!resolutions) { toastAfterRender('Cancelled'); return []; }
    }

    const opId = api.newOpId();
    const dlg = progressDialog({ title: verb + ' ' + plural(srcs.length, 'item') + '\u2026', onCancel: () => api.cancelOp(opId) });
    activeOps.set(opId, dlg);
    let done;
    try {
      done = await api[kind](srcs, destDir, resolutions, opId);
    } catch (e) {
      if (e.message === 'Cancelled') { toastAfterRender('Cancelled'); return []; }
      throw e;
    } finally {
      activeOps.delete(opId);
      dlg.close();
    }
    if (!done.length) return done;
    if (kind === 'move') {
      record({ label, undo: () => api.renameMany(invertMoves(done)), redo: () => api.renameMany(done) });
    } else {
      record({ label, undo: () => api.trash(done.map((m) => m.to)), redo: async () => { done = await api.copy(srcs, destDir, resolutions); } });
    }
    return done;
  }

  // ---- tabs --------------------------------------------------------------
  // Each tab has its own folder and back/forward history; sort, view and pins are shared.
  const tabs = [{ cwd: null, history: [], hi: -1 }];
  let activeTab = 0;
  const syncTab = () => { Object.assign(tabs[activeTab], { cwd: state.cwd, history: state.history, hi: state.hi }); renderTabs(); };

  function renderTabs() {
    const bar = $('tabs'); bar.textContent = '';
    tabs.forEach((t, i) => {
      const label = t.cwd ? baseName(t.cwd) : '…';
      const tab = document.createElement('div');
      tab.className = 'tab' + (i === activeTab ? ' active' : ''); tab.title = t.cwd || '';
      const name = document.createElement('span'); name.className = 'tabname'; name.textContent = label;
      const x = document.createElement('button'); x.className = 'tabclose'; x.textContent = '×'; x.title = 'Close tab (Ctrl+W)';
      x.onclick = (ev) => { ev.stopPropagation(); closeTab(i); };
      tab.onclick = () => switchTab(i);
      tab.onauxclick = (ev) => { if (ev.button === 1) { ev.preventDefault(); closeTab(i); } };
      tab.append(name, x);
      bar.appendChild(tab);
    });
    const plus = document.createElement('button'); plus.className = 'tabnew'; plus.textContent = '+'; plus.title = 'New tab (Ctrl+T)';
    plus.onclick = () => newTab();
    bar.appendChild(plus);
  }

  function loadTab(i) {
    activeTab = i;
    const t = tabs[i];
    state.history = t.history; state.hi = t.hi;
    renderTabs();
    return go(t.cwd, false);
  }
  function switchTab(i) { if (i !== activeTab && tabs[i]) { syncTab(); return loadTab(i); } }
  // Opens `path` (default: the current folder) in a new tab; `activate: false` opens it in the background.
  async function newTab(path = state.cwd, activate = true) {
    syncTab();
    tabs.push({ cwd: path, history: [path], hi: 0 });
    if (activate) await loadTab(tabs.length - 1); else renderTabs();
  }
  async function closeTab(i) {
    if (tabs.length === 1) return;
    syncTab();
    tabs.splice(i, 1);
    if (i < activeTab) { activeTab--; renderTabs(); return; }
    if (i === activeTab) await loadTab(Math.min(i, tabs.length - 1)); else renderTabs();
  }
  const cycleTab = (d) => switchTab((activeTab + d + tabs.length) % tabs.length);

  // ---- navigation -------------------------------------------------------
  async function go(dir, push = true) {
    try {
      state.entries = await api.list(dir, state.showHidden);
    } catch (e) { toast('Cannot open ' + dir + ': ' + e.message); return; }
    state.cwd = dir; state.sel.clear(); state.anchor = null; state.searchMode = false; $('search').value = '';
    if (push) { state.history = state.history.slice(0, state.hi + 1); state.history.push(dir); state.hi = state.history.length - 1; }
    document.title = dir.split(/[\\/]/).filter(Boolean).pop() || dir;
    render(); renderCrumbs(); renderNavActive(); syncTab();
  }
  const refresh = () => go(state.cwd, false);
  const back = () => { if (state.hi > 0) go(state.history[--state.hi], false); };
  const fwd = () => { if (state.hi < state.history.length - 1) go(state.history[++state.hi], false); };
  const up = () => { const p = parentOf(state.cwd); if (p && p !== state.cwd) go(p); };

  function renderCrumbs() {
    const c = $('crumbs'); c.textContent = '';
    const parts = state.cwd.split(/[\\/]/).filter(Boolean);
    const root = /^[A-Za-z]:/.test(state.cwd) ? '' : state.sep;
    let acc = root;
    const add = (label, p) => {
      const s = document.createElement('span'); s.textContent = label;
      s.onclick = (ev) => { ev.stopPropagation(); go(p); };
      c.appendChild(s);
    };
    if (root) add(state.sep, state.sep);
    parts.forEach((part, i) => {
      acc = i === 0 && !root ? part + state.sep : joinPath(acc || root, part);
      if (i > 0 || root) { const sep = document.createElement('i'); sep.textContent = '›'; c.appendChild(sep); }
      add(part, acc);
    });
    $('back').disabled = state.hi <= 0;
    $('fwd').disabled = state.hi >= state.history.length - 1;
    $('up').disabled = !parentOf(state.cwd) || parentOf(state.cwd) === state.cwd;
  }

  const pinLabel = (p) => state.pinNames[p] || baseName(p) || p;

  async function renderNav() {
    const nav = $('nav'); nav.textContent = '';
    const pinsMenu = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      showCustomMenu(ev.clientX, ev.clientY, [
        ['Import pins from File Explorer', guard(importPins), isWindows()],
        ['Copy pins as JSON', guard(exportPins), state.pins.length > 0],
        ['Paste pins from JSON…', guard(importPinsJson)],
      ]);
    };
    nav.oncontextmenu = pinsMenu;
    const section = (title, items, pinned) => {
      const h = document.createElement('h4'); h.textContent = title; nav.appendChild(h);
      h.oncontextmenu = pinsMenu;
      items.forEach((it, idx) => {
        const d = document.createElement('div'); d.textContent = it.name; d.title = it.path; d.dataset.path = it.path;
        if (pinned) { d.classList.add('pin'); if (idx < 9) d.title = it.path + '  (' + (state.mac ? '⌘' : 'Ctrl+') + (idx + 1) + ')'; }
        d.oncontextmenu = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          showCustomMenu(ev.clientX, ev.clientY, [
            ['Open', () => go(it.path)],
            ['Open in new tab', () => newTab(it.path)],
            ['Open in new window', guard(() => api.newWindow(it.path))],
            ['Open in terminal', () => doTerminal(it.path)],
            ['Copy path', () => doCopyPath([it.path])],
            null,
            [state.pins.includes(it.path) ? 'Unpin from sidebar' : 'Pin to sidebar', () => togglePin(it.path)],
            ...(pinned ? [
              ['Rename pin…', guard(() => renamePin(it.path))],
              ['Reset pin name', guard(() => setPinName(it.path, '')), !!state.pinNames[it.path]],
              ['Move up', () => movePin(it.path, -1), state.pins.indexOf(it.path) > 0],
              ['Move down', () => movePin(it.path, 1), state.pins.indexOf(it.path) < state.pins.length - 1],
            ] : []),
          ]);
        };
        d.onclick = () => {
          if (d.classList.contains('missing')) { toast('Folder not found: ' + it.path); return; }
          go(it.path);
        };
        d.ondragover = (ev) => ev.preventDefault();
        d.ondrop = guard(async (ev) => { ev.preventDefault(); ev.stopPropagation(); await dropOnto(it.path, ev); });
        if (pinned) wirePinReorder(d, it.path);
        nav.appendChild(d);
      });
    };
    if (state.pins.length) section('Pinned', state.pins.map((p) => ({ name: pinLabel(p), path: p })), true);
    section('Quick access', await api.quickAccess());
    section('This computer', await api.drives());
    renderNavActive();
    markMissingPins();
  }
  // Pins whose folder is gone (deleted, or a drive that is not connected) are struck through.
  // Checked after the sidebar is drawn so a slow network drive cannot hold it up.
  async function markMissingPins() {
    await Promise.all(state.pins.map(async (p) => {
      const ok = await api.isDir(p).catch(() => false);
      document.querySelectorAll('#nav div.pin').forEach((d) => {
        if (d.dataset.path !== p) return;
        d.classList.toggle('missing', !ok);
        if (!ok) d.title = 'Folder not found: ' + p;
      });
    }));
  }
  function renderNavActive() {
    document.querySelectorAll('#nav div').forEach((d) => d.classList.toggle('active', d.dataset.path === state.cwd));
  }
  // Reorder pins by dragging them within the Pinned section (or via Move up / Move down).
  let dragPin = null;
  function wirePinReorder(d, path) {
    d.draggable = true;
    d.ondragstart = (ev) => { dragPin = path; ev.dataTransfer.setData('text/x-explorerx-pin', path); ev.dataTransfer.effectAllowed = 'move'; };
    d.ondragend = () => { dragPin = null; clearPinMarks(); };
    d.ondragover = (ev) => {
      ev.preventDefault();
      if (!dragPin || dragPin === path) return;
      const after = ev.offsetY > d.clientHeight / 2;
      clearPinMarks(); d.classList.add(after ? 'drop-after' : 'drop-before');
    };
    d.ondragleave = () => d.classList.remove('drop-before', 'drop-after');
    d.ondrop = guard(async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (dragPin) {
        const from = dragPin, after = ev.offsetY > d.clientHeight / 2;
        dragPin = null; clearPinMarks();
        await reorderPin(from, path, after);
      } else await dropOnto(path, ev);
    });
  }
  const clearPinMarks = () => document.querySelectorAll('#nav .drop-before, #nav .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  async function reorderPin(from, target, after) {
    if (from === target) return;
    state.pins.splice(state.pins.indexOf(from), 1);
    state.pins.splice(state.pins.indexOf(target) + (after ? 1 : 0), 0, from);
    savePrefs(); await renderNav();
  }
  async function movePin(p, delta) {
    const i = state.pins.indexOf(p), j = i + delta;
    if (i < 0 || j < 0 || j >= state.pins.length) return;
    [state.pins[i], state.pins[j]] = [state.pins[j], state.pins[i]];
    savePrefs(); await renderNav();
  }
  const isWindows = () => !state.mac && state.sep === '\\';
  async function importPins() {
    toast('Reading File Explorer pins…');
    const found = await api.importExplorerPins();
    const fresh = found.filter((p) => !state.pins.includes(p));
    state.pins.push(...fresh);
    savePrefs(); await renderNav();
    toast(fresh.length ? 'Imported ' + fresh.length + ' pin(s) from File Explorer'
      : found.length ? 'All File Explorer pins are already pinned' : 'No pinned folders found in File Explorer');
  }
  async function togglePin(p) {
    const i = state.pins.indexOf(p);
    if (i >= 0) { state.pins.splice(i, 1); delete state.pinNames[p]; } else state.pins.push(p);
    savePrefs(); await renderNav();
  }
  async function setPinName(p, name) {
    name = name.trim();
    if (!name || name === baseName(p)) delete state.pinNames[p]; else state.pinNames[p] = name;
    savePrefs(); await renderNav();
  }
  async function renamePin(p) {
    const name = await promptDialog({ title: 'Rename pin', label: p, value: pinLabel(p), okText: 'Rename' });
    if (name != null) await setPinName(p, name);
  }
  // Pins travel as JSON through the clipboard (there is no file picker in the app).
  const exportPins = async () => {
    const list = state.pins.map((path) => (state.pinNames[path] ? { path, name: state.pinNames[path] } : { path }));
    await api.copyText(JSON.stringify({ pins: list }, null, 2));
    toast('Copied ' + plural(list.length, 'pin') + ' as JSON');
  };
  async function importPinsJson() {
    let parsed = [];
    const text = await promptDialog({
      title: 'Paste pins', label: 'Paste JSON copied with “Copy pins as JSON” (or a list of folder paths).',
      multiline: true, okText: 'Import',
      validate: (t) => { try { parsed = parsePins(t); return null; } catch (e) { return e.message; } },
    });
    if (text == null) return;
    let added = 0;
    for (const { path, name } of parsed) {
      if (!state.pins.includes(path)) { state.pins.push(path); added++; }
      if (name) state.pinNames[path] = name;
    }
    savePrefs(); await renderNav();
    toast(added ? 'Imported ' + plural(added, 'pin') : 'Those pins were already in the sidebar');
  }

  // ---- rendering --------------------------------------------------------
  function sorted() {
    const k = state.sortKey, dir = state.sortDir;
    return [...state.entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let r;
      if (k === 'name') r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      else if (k === 'size') r = (a.size || 0) - (b.size || 0);
      else if (k === 'ext') r = a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name);
      else r = a.mtime - b.mtime;
      return r * dir;
    });
  }

  let shown = [];
  function render() {
    const host = $('files'); host.textContent = '';
    shown = sorted();
    if (state.view === 'details') {
      const head = document.createElement('div'); head.className = 'row head';
      [['name', 'Name'], ['mtime', 'Date modified'], ['ext', 'Type'], ['size', 'Size']].forEach(([k, label], i) => {
        const s = document.createElement('span'); if (i === 3) s.className = 'num';
        s.textContent = label + (state.sortKey === k ? (state.sortDir > 0 ? ' ▲' : ' ▼') : '');
        s.onclick = () => { state.sortDir = state.sortKey === k ? -state.sortDir : 1; state.sortKey = k; $('sort').value = k; savePrefs(); render(); };
        head.appendChild(s);
      });
      host.appendChild(head);
    } else {
      const g = document.createElement('div'); g.className = 'grid'; g.id = 'grid'; host.appendChild(g);
    }
    const parent = state.view === 'details' ? host : $('grid');
    for (const e of shown) parent.appendChild(makeItem(e));
    if (!shown.length) { const m = document.createElement('div'); m.className = 'empty'; m.textContent = state.searchMode ? 'No matches.' : 'This folder is empty.'; host.appendChild(m); }
    updateStatus(); schedulePreview();
  }

  function makeItem(e) {
    const el = document.createElement('div');
    el.dataset.path = e.path; el.draggable = true;
    el.className = (state.view === 'details' ? 'row item' : 'tile') + (state.sel.has(e.path) ? ' sel' : '') + (state.cut.has(e.path) ? ' cut' : '');
    if (state.view === 'details') {
      const n = document.createElement('span'); n.className = 'nameCell';
      const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = icon(e); lazyIcon(ic, e);
      const t = document.createElement('span'); t.className = 'nm'; t.textContent = e.name;
      n.append(ic, t);
      const m = document.createElement('span'); m.textContent = e.mtime ? fmtDate(e.mtime) : '';
      const ty = document.createElement('span'); ty.textContent = typeOf(e);
      const sz = document.createElement('span'); sz.className = 'num'; sz.textContent = fmtSize(e.size);
      el.append(n, m, ty, sz);
    } else {
      const b = document.createElement('div'); b.className = 'big';
      if (IMG.has(e.ext)) {
        const im = document.createElement('img'); im.loading = 'lazy'; im.src = fileUrl(e.path);
        im.onerror = () => { im.remove(); b.textContent = icon(e); };
        b.appendChild(im);
      } else { b.textContent = icon(e); lazyIcon(b, e); }
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = e.name;
      el.append(b, nm);
    }
    el.onclick = (ev) => select(e, ev);
    el.ondblclick = guard(() => openEntry(e));
    el.onauxclick = (ev) => { if (ev.button === 1 && e.isDir) { ev.preventDefault(); newTab(e.path, false); } };
    el.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (!state.sel.has(e.path)) select(e, {}); showMenu(ev.clientX, ev.clientY, true); };
    el.ondragstart = (ev) => { if (!state.sel.has(e.path)) select(e, {}); ev.dataTransfer.setData('text/x-explorerx', JSON.stringify([...state.sel])); ev.dataTransfer.effectAllowed = 'copyMove'; };
    if (e.isDir) {
      el.ondragover = (ev) => { ev.preventDefault(); el.classList.add('drop'); };
      el.ondragleave = () => el.classList.remove('drop');
      el.ondrop = guard(async (ev) => { ev.preventDefault(); ev.stopPropagation(); el.classList.remove('drop'); await dropOnto(e.path, ev); });
    }
    return el;
  }

  async function dropOnto(dest, ev) {
    const raw = ev.dataTransfer.getData('text/x-explorerx'); if (!raw) return;
    const paths = JSON.parse(raw);
    await transfer(ev.ctrlKey || ev.altKey ? 'copy' : 'move', paths, dest);
    await refresh();
  }

  function updateStatus() {
    $('count').textContent = shown.length + ' item' + (shown.length === 1 ? '' : 's');
    if (pendingToast) { $('selinfo').textContent = pendingToast; pendingToast = null; return; }
    const n = state.sel.size;
    if (!n) { $('selinfo').textContent = ''; return; }
    const bytes = shown.filter((e) => state.sel.has(e.path) && !e.isDir).reduce((s, e) => s + e.size, 0);
    $('selinfo').textContent = n + ' selected' + (bytes ? ' · ' + fmtSize(bytes) : '');
  }

  function paintSel() {
    document.querySelectorAll('[data-path].row.item, [data-path].tile').forEach((n) => n.classList.toggle('sel', state.sel.has(n.dataset.path)));
    updateStatus(); schedulePreview();
  }

  function select(e, ev) {
    const mod = state.mac ? ev.metaKey : ev.ctrlKey;
    if (ev.shiftKey && state.anchor) {
      const a = shown.findIndex((x) => x.path === state.anchor), b = shown.findIndex((x) => x.path === e.path);
      state.sel = new Set(shown.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.path));
    } else if (mod) {
      state.sel.has(e.path) ? state.sel.delete(e.path) : state.sel.add(e.path); state.anchor = e.path;
    } else { state.sel = new Set([e.path]); state.anchor = e.path; }
    paintSel();
  }

  const selected = () => shown.filter((e) => state.sel.has(e.path));

  // ---- actions ----------------------------------------------------------
  async function openEntry(e) { if (e.isDir) await go(e.path); else await api.open(e.path); }

  const doCopy = guard(async (cut) => {
    const paths = selected().map((e) => e.path); if (!paths.length) return;
    await api.clipboardWrite(paths, cut); state.cut = cut ? new Set(paths) : new Set(); render();
    toast((cut ? 'Cut ' : 'Copied ') + paths.length + ' item(s)');
  });
  const doPaste = guard(async () => {
    const c = await api.clipboardRead(); if (!c || !c.paths.length) return;
    const done = await transfer(c.cut ? 'move' : 'copy', c.paths, state.cwd);
    if (c.cut && done.length) await api.clipboardWrite([], false); // a cancelled cut stays on the clipboard
    state.cut = new Set(); await refresh();
  });
  const doDelete = guard(async () => {
    const s = selected(); if (!s.length) return;
    const paths = s.map((e) => e.path);
    await api.trash(paths);
    record({ label: 'Delete ' + plural(paths.length, 'item'), undo: () => api.restoreTrashed(paths), redo: () => api.trash(paths) });
    await refresh();
  });
  const doTerminal = guard(async (p) => { await api.openTerminal(p); });
  const doCopyPath = guard(async (paths) => {
    paths = paths || (state.sel.size ? selected().map((e) => e.path) : [state.cwd]);
    await api.copyText(paths.join('\n'));
    toast(paths.length > 1 ? 'Copied ' + paths.length + ' paths' : 'Copied path');
  });
  const doCopyName = guard(async () => {
    const names = selected().map((e) => e.name); if (!names.length) return;
    await api.copyText(names.join('\n')); toast(names.length > 1 ? 'Copied ' + names.length + ' names' : 'Copied name');
  });
  // Copies each item next to the original; name collisions get " (2)", " (3)", ...
  const doDuplicate = guard(async () => {
    const s = selected(); if (!s.length) return;
    const byParent = new Map();
    for (const e of s) byParent.set(parentOf(e.path), [...(byParent.get(parentOf(e.path)) || []), e.path]);
    for (const [parent, paths] of byParent) await transfer('copy', paths, parent);
    await refresh();
  });
  const createNew = (isDir) => guard(async () => {
    const p = await (isDir ? api.mkdir(state.cwd) : api.newFile(state.cwd));
    record({ label: isDir ? 'New folder' : 'New file', undo: () => api.trash([p]), redo: () => api.createPath(p, isDir) });
    await refresh(); state.sel = new Set([p]); paintSel(); startRename();
  });
  const doNewFolder = createNew(true), doNewFile = createNew(false);

  function startRename() {
    const s = selected(); if (s.length !== 1) return;
    const el = document.querySelector('[data-path="' + CSS.escape(s[0].path) + '"] .nm'); if (!el) return;
    const inp = document.createElement('input'); inp.className = 'rename'; inp.value = s[0].name;
    el.replaceWith(inp); inp.focus();
    const dot = s[0].isDir ? -1 : s[0].name.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : inp.value.length);
    let done = false;
    const finish = guard(async (commit) => {
      if (done) return; done = true;
      if (commit && inp.value !== s[0].name) {
        const oldPath = s[0].path, oldName = s[0].name, newName = inp.value;
        const np = await api.rename(oldPath, newName);
        record({ label: 'Rename "' + oldName + '"', undo: () => api.rename(np, oldName), redo: () => api.rename(oldPath, newName) });
        state.sel = new Set([np]);
      }
      await refresh();
    });
    inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); };
    inp.onblur = () => finish(true);
    inp.onclick = inp.ondblclick = (ev) => ev.stopPropagation();
  }

  // ---- preview pane -----------------------------------------------------
  const VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']), AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
  let previewTimer = 0, previewToken = 0;
  const schedulePreview = () => { if (state.preview) { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 120); } };

  const metaList = (rows) => el('dl', { className: 'meta' }, rows.filter((r) => r[1]).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));

  async function updatePreview() {
    const host = $('preview');
    const token = ++previewToken;
    const put = (...nodes) => { if (token === previewToken) { host.textContent = ''; host.append(...nodes); } };
    const sel = selected();
    if (!sel.length) return put(el('p', { className: 'muted pad' }, 'Select a file to see its preview.'));
    if (sel.length > 1) {
      const bytes = sel.filter((e) => !e.isDir).reduce((s, e) => s + (e.size || 0), 0);
      return put(el('h4', { className: 'ptitle' }, plural(sel.length, 'item') + ' selected'), metaList([['Files', plural(sel.filter((e) => !e.isDir).length, 'file')], ['Folders', plural(sel.filter((e) => e.isDir).length, 'folder')], ['Size of files', bytes ? fmtSize(bytes) : '']]));
    }
    const e = sel[0];
    const rows = [['Type', typeOf(e)], ['Size', e.size != null ? fmtSize(e.size) : ''], ['Modified', e.mtime ? fmtDateTime(e.mtime) : ''], ['Created', e.ctime ? fmtDateTime(e.ctime) : ''], ['Location', parentOf(e.path)]];
    const title = el('h4', { className: 'ptitle' }, e.name);
    const fallback = el('div', { className: 'pbig' }, icon(e));
    fallback._entry = e; // filled with the native icon once it is on the page (see below)
    if (e.isDir) {
      const contents = el('dd', {}, 'Calculating\u2026');
      put(title, fallback, metaList(rows), el('dl', { className: 'meta' }, el('dt', {}, 'Contains'), contents));
      fillIcon(fallback);
      api.dirStats(e.path).then((s) => { if (token === previewToken) contents.textContent = plural(s.files, 'file') + ', ' + plural(s.folders, 'folder') + ' \u00B7 ' + fmtSize(s.size); }).catch(() => { contents.textContent = '\u2014'; });
      return;
    }
    let media = null;
    if (IMG.has(e.ext) || VIDEO.has(e.ext) || AUDIO.has(e.ext)) {
      const tag = IMG.has(e.ext) ? 'img' : VIDEO.has(e.ext) ? 'video' : 'audio';
      media = el(tag, { className: 'pmedia', src: fileUrl(e.path) });
      if (tag !== 'img') { media.controls = true; media.preload = 'metadata'; }
      media.onerror = () => { if (token === previewToken) { media.replaceWith(fallback); fillIcon(fallback); } };
    } else if (e.size) {
      const text = await api.textPreview(e.path, 6000).catch(() => null);
      if (token !== previewToken) return;
      if (text != null) media = el('pre', { className: 'ptext' }, text + (e.size > 6000 ? '\n\u2026' : ''));
    }
    put(title, media || fallback, metaList(rows));
    if (!media) fillIcon(fallback); // the icon may arrive before the pane is attached, so ask after put()
  }

  function togglePreview() {
    state.preview = !state.preview;
    $('preview').hidden = !state.preview; $('previewBtn').classList.toggle('on', state.preview);
    savePrefs(); if (state.preview) updatePreview();
  }

  // ---- properties ---------------------------------------------------------
  const doProperties = guard(async () => {
    const sel = selected();
    if (sel.length > 1) return multiPropertiesDialog(sel, { stats: api.dirStats });
    const props = await api.properties(sel.length ? sel[0].path : state.cwd);
    propertiesDialog(props, { stats: api.dirStats, onCopyPath: (p) => doCopyPath([p]), sep: state.sep });
  });

  // ---- context menu -----------------------------------------------------
  function showCustomMenu(x, y, items) { showMenu(x, y, false, items); }
  function showMenu(x, y, onItem, custom) {
    const m = $('menu'); m.textContent = ''; const one = state.sel.size === 1;
    const oneDir = one && selected()[0].isDir, pinned = oneDir && state.pins.includes(selected()[0].path);
    const items = custom || (onItem ? [
      ['Open', () => one && openEntry(selected()[0]), one],
      [pinned ? 'Unpin from sidebar' : 'Pin to sidebar', () => togglePin(selected()[0].path), oneDir],
      ['Open in new tab', () => newTab(selected()[0].path, false), oneDir],
      ['Open in new window', () => api.newWindow(selected()[0].path), oneDir],
      [state.mac ? 'Reveal in Finder' : 'Show in Explorer', () => api.reveal(selected()[0].path), one],
      ['Open in terminal', () => doTerminal(selected()[0].path), one],
      null, ['Cut', () => doCopy(true)], ['Copy', () => doCopy(false)],
      ['Copy path', () => doCopyPath()], ['Copy name', doCopyName], ['Duplicate', doDuplicate], null,
      ['Rename', startRename, one], [state.mac ? 'Move to Trash' : 'Delete', doDelete], null,
      ['Properties', doProperties],
    ] : [
      [state.pins.includes(state.cwd) ? 'Unpin this folder' : 'Pin this folder', () => togglePin(state.cwd)],
      ['Import pins from File Explorer', guard(importPins), isWindows()], null,
      ['New folder', doNewFolder], ['New text file', doNewFile], null,
      ['Open in terminal here', () => doTerminal(state.cwd)], ['Copy folder path', () => doCopyPath([state.cwd])], null,
      ['Paste', doPaste], ['Refresh', refresh], null,
      ['Properties', doProperties],
    ]);
    for (const it of items) {
      if (!it) { m.appendChild(document.createElement('hr')); continue; }
      if (it[2] === false) continue;
      const d = document.createElement('div'); d.textContent = it[0];
      d.onclick = () => { m.hidden = true; it[1](); }; m.appendChild(d);
    }
    m.hidden = false;
    m.style.left = Math.min(x, innerWidth - 200) + 'px'; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + 'px';
  }
  document.addEventListener('click', () => { $('menu').hidden = true; });
  $('files').oncontextmenu = (ev) => { ev.preventDefault(); state.sel.clear(); paintSel(); showMenu(ev.clientX, ev.clientY, false); };
  $('files').onclick = (ev) => { if (ev.target === $('files') || ev.target.id === 'grid') { state.sel.clear(); paintSel(); } };
  $('files').ondragover = (ev) => ev.preventDefault();
  $('files').ondrop = guard(async (ev) => { ev.preventDefault(); await dropOnto(state.cwd, ev); });

  // ---- toolbar ----------------------------------------------------------
  $('back').onclick = back; $('fwd').onclick = fwd; $('up').onclick = up; $('refresh').onclick = refresh;
  $('undo').onclick = doUndo; $('redo').onclick = doRedo;
  $('newFolder').onclick = doNewFolder; $('cut').onclick = () => doCopy(true); $('copy').onclick = () => doCopy(false);
  $('paste').onclick = doPaste; $('renameBtn').onclick = startRename; $('delete').onclick = doDelete;
  $('sort').onchange = (e) => { state.sortKey = e.target.value; state.sortDir = 1; savePrefs(); render(); };
  $('hidden').onclick = () => { state.showHidden = !state.showHidden; $('hidden').classList.toggle('on', state.showHidden); savePrefs(); refresh(); };
  $('previewBtn').onclick = togglePreview;
  $('view').onclick = () => { state.view = state.view === 'details' ? 'icons' : 'details'; $('view').textContent = 'View: ' + (state.view === 'details' ? 'Details' : 'Icons'); savePrefs(); render(); };

  const addr = $('address');
  $('crumbs').onclick = () => { addr.value = state.cwd; addr.hidden = false; addr.focus(); addr.select(); };
  addr.onkeydown = guard(async (ev) => {
    if (ev.key === 'Escape') addr.hidden = true;
    if (ev.key === 'Enter') {
      const p = addr.value.trim().replace(/^~(?=$|[\\/])/, await api.home());
      addr.hidden = true;
      if (await api.isDir(p)) go(p); else toast('Not a folder: ' + p);
    }
  });
  addr.onblur = () => { addr.hidden = true; };

  let searchTimer = 0;
  $('search').oninput = () => {
    clearTimeout(searchTimer);
    const q = $('search').value.trim();
    if (!q) { refresh(); return; }
    searchTimer = setTimeout(guard(async () => {
      toast('Searching…');
      const res = await api.search(state.cwd, q);
      state.searchMode = true; state.sel.clear();
      state.entries = res.map((r) => ({ ...r, size: null, mtime: 0, ext: r.isDir ? '' : (r.name.split('.').pop() || '').toLowerCase() }));
      render(); toast(res.length + ' result(s)');
    }), 250);
  };

  // ---- layout: sidebar resize, icon size ---------------------------------
  $('resizer').onmousedown = (ev) => {
    ev.preventDefault(); document.body.classList.add('resizing');
    const move = (e) => { state.navw = Math.max(140, Math.min(520, e.clientX)); applyLayout(); };
    const stop = () => { document.body.classList.remove('resizing'); removeEventListener('mousemove', move); removeEventListener('mouseup', stop); savePrefs(); };
    addEventListener('mousemove', move); addEventListener('mouseup', stop);
  };
  $('resizer').ondblclick = () => { state.navw = 230; applyLayout(); savePrefs(); };
  const setIcon = (n) => { state.icon = Math.max(32, Math.min(128, Math.round(n))); applyLayout(); savePrefs(); };
  $('zoom').oninput = (e) => setIcon(+e.target.value);
  $('files').addEventListener('wheel', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault(); setIcon(state.icon + (ev.deltaY < 0 ? 8 : -8));
  }, { passive: false });

  // ---- keyboard ---------------------------------------------------------
  let typed = '', typedTimer = 0;
  document.addEventListener('keydown', (ev) => {
    if (dialogOpen()) return;
    if (ev.target.tagName === 'INPUT' && ev.target.type !== 'range') return;
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key !== ' ') {
      typed += ev.key.toLowerCase(); clearTimeout(typedTimer); typedTimer = setTimeout(() => { typed = ''; }, 800);
      const hit = shown.find((e) => e.name.toLowerCase().startsWith(typed));
      if (hit) { select(hit, {}); const el = document.querySelector('[data-path="' + CSS.escape(hit.path) + '"]'); if (el) el.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    const mod = state.mac ? ev.metaKey : ev.ctrlKey, k = ev.key.toLowerCase();
    if (ev.altKey && k === 'p') { ev.preventDefault(); togglePreview(); }
    else if ((ev.altKey && ev.key === 'Enter') || (state.mac && ev.metaKey && k === 'i')) { ev.preventDefault(); doProperties(); }
    else if (mod && /^[1-9]$/.test(ev.key) && state.pins[+ev.key - 1]) { ev.preventDefault(); go(state.pins[+ev.key - 1]); }
    else if (mod && k === 't') { ev.preventDefault(); newTab(); }
    else if (ev.ctrlKey && k === 'w') { ev.preventDefault(); closeTab(activeTab); }
    else if (ev.ctrlKey && ev.key === 'Tab') { ev.preventDefault(); cycleTab(ev.shiftKey ? -1 : 1); }
    else if (mod && k === 'z') { ev.preventDefault(); if (ev.shiftKey) doRedo(); else doUndo(); }
    else if (mod && k === 'y') { ev.preventDefault(); doRedo(); }
    else if (mod && ev.shiftKey && k === 'c') doCopyPath();
    else if (mod && k === 'c') doCopy(false);
    else if (mod && k === 'x') doCopy(true);
    else if (mod && k === 'v') doPaste();
    else if (mod && k === 'a') { ev.preventDefault(); state.sel = new Set(shown.map((e) => e.path)); paintSel(); }
    else if (mod && k === 'l') { $('crumbs').click(); ev.preventDefault(); }
    else if (mod && k === 'f') { $('search').focus(); ev.preventDefault(); }
    else if (mod && k === 'h') { $('hidden').click(); ev.preventDefault(); }
    else if (mod && ev.shiftKey && k === 'n') doNewFolder();
    else if (ev.key === 'F2') startRename();
    else if (ev.key === 'F5') refresh();
    else if (ev.key === 'Delete' || (state.mac && ev.metaKey && ev.key === 'Backspace')) doDelete();
    else if (ev.key === 'Enter' || (state.mac && ev.metaKey && ev.key === 'ArrowDown')) { const s = selected(); if (s.length === 1) guard(openEntry)(s[0]); }
    else if (ev.key === 'Backspace' || (ev.altKey && ev.key === 'ArrowUp') || (state.mac && ev.metaKey && ev.key === 'ArrowUp')) up();
    else if (ev.altKey && ev.key === 'ArrowLeft' || (state.mac && ev.metaKey && ev.key === '[')) back();
    else if (ev.altKey && ev.key === 'ArrowRight' || (state.mac && ev.metaKey && ev.key === ']')) fwd();
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); if (!shown.length) return;
      const cur = shown.findIndex((e) => e.path === state.anchor);
      const next = Math.max(0, Math.min(shown.length - 1, cur < 0 ? 0 : cur + (ev.key === 'ArrowDown' ? 1 : -1)));
      select(shown[next], { shiftKey: ev.shiftKey });
      if (ev.shiftKey) state.anchor = state.anchor; // keep range anchor stable
      const el = document.querySelector('[data-path="' + CSS.escape(shown[next].path) + '"]'); if (el) el.scrollIntoView({ block: 'nearest' });
    }
  });

  // ---- boot -------------------------------------------------------------
  (async () => {
    const plat = await api.platform();
    state.mac = plat === 'darwin'; state.sep = plat === 'win32' ? '\\' : '/';
    if (state.mac) document.body.classList.add('mac');
    loadPrefs(); applyLayout();
    $('hidden').classList.toggle('on', state.showHidden);
    $('preview').hidden = !state.preview; $('previewBtn').classList.toggle('on', state.preview);
    $('sort').value = state.sortKey;
    $('view').textContent = 'View: ' + (state.view === 'details' ? 'Details' : 'Icons');
    updateUndoUi();
    await renderNav();
    await go(api.startPath() || await api.home());
    api.onOpenPath((p) => go(p));
  })();
})();
