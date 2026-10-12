import { fmtSize, fmtDate, typeOf, parentOf as parentOfSep, joinPath as joinPathSep, baseName, plural, invertMoves } from './format.js';
import { UndoStack } from './undo.js';

(() => {
  const api = window.fsapi;
  const $ = (id) => document.getElementById(id);
  const state = {
    cwd: null, history: [], hi: -1, entries: [], sel: new Set(), anchor: null,
    sortKey: 'name', sortDir: 1, view: 'details', showHidden: false, cut: new Set(),
    mac: false, sep: '/', searchMode: false, pins: [], icon: 64, navw: 230,
  };

  // Per-user preferences, persisted in localStorage (best effort).
  const PREF_KEYS = ['pins', 'icon', 'navw', 'view', 'sortKey', 'sortDir', 'showHidden'];
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

  const icon = (e) => (e.isDir ? '\u{1F4C1}' : { png: '\u{1F5BC}', jpg: '\u{1F5BC}', jpeg: '\u{1F5BC}', gif: '\u{1F5BC}', mp3: '\u{1F3B5}', wav: '\u{1F3B5}', mp4: '\u{1F39E}', mkv: '\u{1F39E}', zip: '\u{1F5DC}', pdf: '\u{1F4D5}' }[e.ext] || '\u{1F4C4}');
  const parentOf = (p) => parentOfSep(p, state.sep);
  const joinPath = (d, n) => joinPathSep(d, n, state.sep);
  const toast = (msg) => { $('selinfo').textContent = msg; };
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
  async function transfer(kind, srcs, destDir) {
    const label = (kind === 'move' ? 'Move ' : 'Copy ') + plural(srcs.length, 'item');
    let done = await api[kind](srcs, destDir);
    if (!done.length) return done;
    if (kind === 'move') {
      record({ label, undo: () => api.renameMany(invertMoves(done)), redo: () => api.renameMany(done) });
    } else {
      record({ label, undo: () => api.trash(done.map((m) => m.to)), redo: async () => { done = await api.copy(srcs, destDir); } });
    }
    return done;
  }

  // ---- navigation -------------------------------------------------------
  async function go(dir, push = true) {
    try {
      state.entries = await api.list(dir, state.showHidden);
    } catch (e) { toast('Cannot open ' + dir + ': ' + e.message); return; }
    state.cwd = dir; state.sel.clear(); state.anchor = null; state.searchMode = false; $('search').value = '';
    if (push) { state.history = state.history.slice(0, state.hi + 1); state.history.push(dir); state.hi = state.history.length - 1; }
    document.title = dir.split(/[\\/]/).filter(Boolean).pop() || dir;
    render(); renderCrumbs(); renderNavActive();
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

  async function renderNav() {
    const nav = $('nav'); nav.textContent = '';
    const section = (title, items, pinned) => {
      const h = document.createElement('h4'); h.textContent = title; nav.appendChild(h);
      for (const it of items) {
        const d = document.createElement('div'); d.textContent = it.name; d.title = it.path; d.dataset.path = it.path;
        if (pinned) d.classList.add('pin');
        d.oncontextmenu = (ev) => {
          ev.preventDefault();
          showCustomMenu(ev.clientX, ev.clientY, [
            ['Open', () => go(it.path)],
            ['Open in new window', guard(() => api.newWindow(it.path))],
            ['Open in terminal', () => doTerminal(it.path)],
            ['Copy path', () => doCopyPath([it.path])],
            null,
            [state.pins.includes(it.path) ? 'Unpin from sidebar' : 'Pin to sidebar', () => togglePin(it.path)],
          ]);
        };
        d.onclick = () => go(it.path);
        d.ondragover = (ev) => ev.preventDefault();
        d.ondrop = guard(async (ev) => { ev.preventDefault(); await dropOnto(it.path, ev); });
        nav.appendChild(d);
      }
    };
    if (state.pins.length) section('Pinned', state.pins.map((p) => ({ name: p.split(/[\\/]/).filter(Boolean).pop() || p, path: p })), true);
    section('Quick access', await api.quickAccess());
    section('This computer', await api.drives());
    renderNavActive();
  }
  function renderNavActive() {
    document.querySelectorAll('#nav div').forEach((d) => d.classList.toggle('active', d.dataset.path === state.cwd));
  }
  async function togglePin(p) {
    const i = state.pins.indexOf(p);
    if (i >= 0) state.pins.splice(i, 1); else state.pins.push(p);
    savePrefs(); await renderNav();
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
    updateStatus();
  }

  function makeItem(e) {
    const el = document.createElement('div');
    el.dataset.path = e.path; el.draggable = true;
    el.className = (state.view === 'details' ? 'row item' : 'tile') + (state.sel.has(e.path) ? ' sel' : '') + (state.cut.has(e.path) ? ' cut' : '');
    if (state.view === 'details') {
      const n = document.createElement('span'); n.className = 'nameCell';
      const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = icon(e);
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
      } else b.textContent = icon(e);
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = e.name;
      el.append(b, nm);
    }
    el.onclick = (ev) => select(e, ev);
    el.ondblclick = guard(() => openEntry(e));
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
    const n = state.sel.size;
    if (!n) { $('selinfo').textContent = ''; return; }
    const bytes = shown.filter((e) => state.sel.has(e.path) && !e.isDir).reduce((s, e) => s + e.size, 0);
    $('selinfo').textContent = n + ' selected' + (bytes ? ' · ' + fmtSize(bytes) : '');
  }

  function paintSel() {
    document.querySelectorAll('[data-path].row.item, [data-path].tile').forEach((el) => el.classList.toggle('sel', state.sel.has(el.dataset.path)));
    updateStatus();
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
    await transfer(c.cut ? 'move' : 'copy', c.paths, state.cwd);
    if (c.cut) await api.clipboardWrite([], false);
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

  // ---- context menu -----------------------------------------------------
  function showCustomMenu(x, y, items) { showMenu(x, y, false, items); }
  function showMenu(x, y, onItem, custom) {
    const m = $('menu'); m.textContent = ''; const one = state.sel.size === 1;
    const oneDir = one && selected()[0].isDir, pinned = oneDir && state.pins.includes(selected()[0].path);
    const items = custom || (onItem ? [
      ['Open', () => one && openEntry(selected()[0]), one],
      [pinned ? 'Unpin from sidebar' : 'Pin to sidebar', () => togglePin(selected()[0].path), oneDir],
      ['Open in new window', () => api.newWindow(selected()[0].path), oneDir],
      [state.mac ? 'Reveal in Finder' : 'Show in Explorer', () => api.reveal(selected()[0].path), one],
      ['Open in terminal', () => doTerminal(selected()[0].path), one],
      null, ['Cut', () => doCopy(true)], ['Copy', () => doCopy(false)],
      ['Copy path', () => doCopyPath()], ['Copy name', doCopyName], ['Duplicate', doDuplicate], null,
      ['Rename', startRename, one], [state.mac ? 'Move to Trash' : 'Delete', doDelete],
    ] : [
      [state.pins.includes(state.cwd) ? 'Unpin this folder' : 'Pin this folder', () => togglePin(state.cwd)], null,
      ['New folder', doNewFolder], ['New text file', doNewFile], null,
      ['Open in terminal here', () => doTerminal(state.cwd)], ['Copy folder path', () => doCopyPath([state.cwd])], null,
      ['Paste', doPaste], ['Refresh', refresh],
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
    if (ev.target.tagName === 'INPUT' && ev.target.type !== 'range') return;
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key !== ' ') {
      typed += ev.key.toLowerCase(); clearTimeout(typedTimer); typedTimer = setTimeout(() => { typed = ''; }, 800);
      const hit = shown.find((e) => e.name.toLowerCase().startsWith(typed));
      if (hit) { select(hit, {}); const el = document.querySelector('[data-path="' + CSS.escape(hit.path) + '"]'); if (el) el.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    const mod = state.mac ? ev.metaKey : ev.ctrlKey, k = ev.key.toLowerCase();
    if (mod && k === 'z') { ev.preventDefault(); if (ev.shiftKey) doRedo(); else doUndo(); }
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
    $('sort').value = state.sortKey;
    $('view').textContent = 'View: ' + (state.view === 'details' ? 'Details' : 'Icons');
    updateUndoUi();
    await renderNav();
    await go(api.startPath() || await api.home());
    api.onOpenPath((p) => go(p));
  })();
})();
