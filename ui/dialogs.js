// Modal dialogs: name conflicts, long-operation progress, file properties.
// DOM only; all data comes in as arguments so renderer.js stays the single place that talks to Rust.

import { fmtSize, fmtDateTime, plural } from './format.js';

/** Tiny element builder: el('div', { className: 'x', onclick: fn }, 'text', childEl). */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) node[k] = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node[k] = v;
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

const host = () => document.getElementById('modal');

/** Shows `content` in the modal overlay. Returns a function that closes it. */
function show(content, { onEscape } = {}) {
  const m = host();
  m.textContent = '';
  m.append(content);
  m.hidden = false;
  const onKey = (ev) => {
    if (ev.key === 'Escape' && onEscape) { ev.preventDefault(); ev.stopPropagation(); onEscape(); return; }
    // text fields in the dialog must still receive their own keys (Enter to confirm, typing)
    if (m.contains(ev.target) && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
    // keep typing inside a dialog from triggering file-list shortcuts
    ev.stopPropagation();
  };
  document.addEventListener('keydown', onKey, true);
  return () => { m.hidden = true; m.textContent = ''; document.removeEventListener('keydown', onKey, true); };
}

/** True while any dialog is open (the file list ignores shortcuts then). */
export const dialogOpen = () => !host().hidden;

// ---- name conflicts ---------------------------------------------------------

/**
 * Asks what to do about each conflict. Resolves to { [srcPath]: 'replace' | 'skip' | 'keep' },
 * or null if the user cancels the whole operation.
 */
export function conflictDialog(conflicts, destName) {
  return new Promise((resolve) => {
    const result = {};
    let i = 0;
    let close = () => {};
    const finish = (value) => { close(); resolve(value); };

    const ask = () => {
      const c = conflicts[i];
      const remaining = conflicts.length - i;
      const apply = el('input', { type: 'checkbox', id: 'applyAll' });
      const choose = (choice) => {
        if (apply.checked) for (let j = i; j < conflicts.length; j++) result[conflicts[j].src] = choice;
        else result[c.src] = choice;
        i = apply.checked ? conflicts.length : i + 1;
        if (i >= conflicts.length) finish(result); else ask();
      };
      const keepBtn = el('button', { className: 'primary', onclick: () => choose('keep') }, 'Keep both');
      const body = el('div', { className: 'dlg' },
        el('h3', {}, c.existingIsDir ? 'A folder with this name already exists' : 'A file with this name already exists'),
        el('p', {}, '“', el('b', {}, c.name), '” already exists in ', destName || 'the destination folder', '.'),
        c.existingIsDir || c.srcIsDir
          ? el('p', { className: 'muted' }, 'Replace moves the existing item to the Trash and puts the new one in its place.')
          : el('p', { className: 'muted' }, 'Replace moves the existing file to the Trash; Keep both names the new one “' + c.name.replace(/(\.[^.]*)?$/, ' (2)$1') + '”.'),
        remaining > 1 ? el('label', { className: 'check' }, apply, ' Do this for all ' + remaining + ' remaining conflicts') : null,
        el('div', { className: 'btns' },
          el('button', { onclick: () => finish(null) }, 'Cancel'),
          el('button', { onclick: () => choose('skip') }, 'Skip'),
          el('button', { onclick: () => choose('replace') }, 'Replace'),
          keepBtn));
      close = show(body, { onEscape: () => finish(null) });
      keepBtn.focus();
    };
    ask();
  });
}

// ---- text input -----------------------------------------------------------------

/**
 * Asks for a line of text (or several lines with `multiline`). Resolves to the entered string,
 * or null if cancelled. `validate(value)` may return an error message to keep the dialog open.
 */
export function promptDialog({ title, label, value = '', okText = 'OK', multiline = false, placeholder = '', validate }) {
  return new Promise((resolve) => {
    let close = () => {};
    const finish = (v) => { close(); resolve(v); };
    const input = multiline
      ? el('textarea', { className: 'field', rows: 8, value, placeholder, spellcheck: false })
      : el('input', { className: 'field', type: 'text', value, placeholder, spellcheck: false });
    const error = el('p', { className: 'error' }, '');
    const submit = () => {
      const msg = validate ? validate(input.value) : null;
      if (msg) { error.textContent = msg; return; }
      finish(input.value);
    };
    input.onkeydown = (ev) => { if (ev.key === 'Enter' && (!multiline || ev.ctrlKey)) { ev.preventDefault(); submit(); } };
    const ok = el('button', { className: 'primary', onclick: submit }, okText);
    const body = el('div', { className: 'dlg' },
      el('h3', {}, title), label ? el('p', { className: 'muted' }, label) : null, input, error,
      el('div', { className: 'btns' }, el('button', { onclick: () => finish(null) }, 'Cancel'), ok));
    close = show(body, { onEscape: () => finish(null) });
    input.focus(); input.select();
  });
}

// ---- keyboard shortcuts -----------------------------------------------------------------

/**
 * Lists every shortcut and lets the user change them. All data goes through `ctl`:
 *   rows()            -> [{ id, group, label, combos: [{ combo, label }], modified }]
 *   comboOf(event)    -> combo string, or null while only modifier keys are held
 *   check(combo)      -> message when the combo cannot be used, else null
 *   label(combo)      -> how to show a combo
 *   add(id, combo)    -> text about what happened ("Moved from ..."), may be empty
 *   remove(id, combo), reset(id), resetAll()
 *   fixed             -> [[keys, description]] shown as read-only help
 * Resolves when the dialog is closed.
 */
export function shortcutsDialog(ctl) {
  return new Promise((resolve) => {
    let close = () => {};
    let capturing = null; // id of the action waiting for a key press
    let message = '';
    let filter = '';
    const list = el('div', { className: 'keylist' });
    const status = el('p', { className: 'muted keystatus' }, '');
    const search = el('input', { className: 'field', type: 'text', placeholder: 'Search shortcuts', spellcheck: false });
    search.oninput = () => { filter = search.value.trim().toLowerCase(); render(); };

    const finish = () => { document.removeEventListener('keydown', onCapture, true); close(); resolve(); };
    // While an action is waiting for a key, every key press (except Esc, which cancels) is its new shortcut.
    function onCapture(ev) {
      if (!capturing || ev.key === 'Escape') return;
      ev.preventDefault(); ev.stopPropagation();
      const combo = ctl.comboOf(ev);
      if (!combo) return;
      const problem = ctl.check(combo);
      if (problem) { message = problem; render(); return; }
      const id = capturing; capturing = null;
      const moved = ctl.add(id, combo);
      message = ctl.label(combo) + ' is set.' + (moved ? ' ' + moved + '.' : '');
      render();
    }
    document.addEventListener('keydown', onCapture, true);

    function render() {
      list.textContent = '';
      const rows = ctl.rows().filter((r) => !filter || (r.label + ' ' + r.group + ' ' + r.combos.map((c) => c.label).join(' ')).toLowerCase().includes(filter));
      let group = null;
      for (const r of rows) {
        if (r.group !== group) { group = r.group; list.append(el('div', { className: 'duphead' }, group)); }
        const chips = r.combos.map((c) => el('span', { className: 'chip' },
          el('kbd', {}, c.label),
          el('button', { className: 'chipx', title: 'Remove this shortcut', onclick: () => { ctl.remove(r.id, c.combo); message = ''; render(); } }, '×')));
        const adding = capturing === r.id;
        const add = el('button', {
          className: 'addkey' + (adding ? ' on' : ''),
          title: 'Press a new key combination for this action',
          onclick: () => { capturing = adding ? null : r.id; message = adding ? '' : 'Press the new shortcut for “' + r.label + '” (Esc to cancel)'; render(); },
        }, adding ? 'Press keys…' : r.combos.length ? '+' : 'Set a shortcut');
        const reset = r.modified ? el('button', { className: 'chipx', title: 'Back to the default', onclick: () => { ctl.reset(r.id); message = ''; render(); } }, '↺') : null;
        list.append(el('div', { className: 'keyrow' + (r.modified ? ' changed' : '') },
          el('span', { className: 'keylabel' }, r.label),
          el('span', { className: 'keychips' }, ...chips, add, reset)));
      }
      if (!rows.length) list.append(el('p', { className: 'muted pad' }, 'No shortcuts match “' + filter + '”.'));
      status.textContent = message;
    }

    const fixed = el('details', { className: 'keyfixed' }, el('summary', {}, 'Keys that cannot be changed'),
      ...ctl.fixed.map(([k, d]) => el('div', { className: 'keyrow' }, el('span', { className: 'keychips' }, el('kbd', {}, k)), el('span', { className: 'muted' }, d))));
    const done = el('button', { className: 'primary', onclick: finish }, 'Done');
    const body = el('div', { className: 'dlg wide' },
      el('h3', {}, 'Keyboard shortcuts'),
      el('p', { className: 'muted' }, 'Click + (or Set a shortcut) and press the keys you want. A shortcut can only belong to one action, so it is taken away from the action that had it. Your changes are saved right away.'),
      search, list, status, fixed,
      el('div', { className: 'btns spread' },
        el('button', { onclick: () => { ctl.resetAll(); capturing = null; message = 'All shortcuts are back to their defaults.'; render(); } }, 'Reset all'),
        done));
    // Esc cancels a pending capture first, and only closes the dialog when nothing is pending
    close = show(body, { onEscape: () => { if (capturing) { capturing = null; message = ''; render(); } else finish(); } });
    render();
    search.focus();
  });
}

// ---- choose a folder -----------------------------------------------------------------

/**
 * Asks for a destination folder: type a path or click one of the `suggestions` ([{ label, path }]).
 * Resolves to the path as typed (the caller checks that it exists), or null if cancelled.
 */
export function chooseFolderDialog({ title, label, suggestions = [], okText = 'OK' }) {
  return new Promise((resolve) => {
    let close = () => {};
    const finish = (v) => { close(); resolve(v); };
    const seen = new Set();
    const unique = suggestions.filter((s) => s.path && !seen.has(s.path) && seen.add(s.path));
    const input = el('input', { className: 'field', type: 'text', placeholder: 'Type a folder path, or pick one below', spellcheck: false });
    const error = el('p', { className: 'error' }, '');
    const ok = el('button', { className: 'primary', onclick: () => { if (input.value.trim()) finish(input.value.trim()); else error.textContent = 'Choose a folder first.'; } }, okText);
    input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ok.click(); } };
    const list = el('div', { className: 'duplist short' }, unique.map((s) => el('div', {
      className: 'duprow', title: s.path,
      onclick: () => { input.value = s.path; error.textContent = ''; input.focus(); },
      ondblclick: () => finish(s.path),
    }, el('b', {}, s.label), el('span', { className: 'muted' }, s.path))));
    const body = el('div', { className: 'dlg wide' },
      el('h3', {}, title), label ? el('p', { className: 'muted' }, label) : null, input, error, unique.length ? list : null,
      el('div', { className: 'btns' }, el('button', { onclick: () => finish(null) }, 'Cancel'), ok));
    close = show(body, { onEscape: () => finish(null) });
    input.focus();
  });
}

// ---- batch rename -----------------------------------------------------------------

/**
 * Renames several items with a live preview. `plan(options)` returns [{ from, to, error? }]
 * (see planRename). Resolves to the plan to apply, or null if cancelled.
 */
export function batchRenameDialog(count, plan) {
  return new Promise((resolve) => {
    let close = () => {};
    const finish = (v) => { close(); resolve(v); };
    const find = el('input', { className: 'field', type: 'text', placeholder: 'Text to find', spellcheck: false });
    const replace = el('input', { className: 'field', type: 'text', placeholder: 'Replace with', spellcheck: false });
    const template = el('input', { className: 'field', type: 'text', value: '{name}', spellcheck: false });
    const start = el('input', { className: 'field', type: 'number', value: '1', min: '0' });
    const list = el('div', { className: 'renamelist' });
    const summary = el('p', { className: 'muted' }, '');
    const ok = el('button', { className: 'primary' }, 'Rename');
    let current = [];
    const update = () => {
      current = plan({ find: find.value, replace: replace.value, template: template.value, start: Math.max(0, parseInt(start.value, 10) || 0) });
      list.textContent = '';
      for (const r of current) {
        list.append(el('div', { className: 'rrow' + (r.error ? ' bad' : r.to === r.from ? ' same' : '') },
          el('span', { className: 'old' }, r.from), el('span', { className: 'arrow' }, '→'),
          el('span', { className: 'new' }, r.to + (r.error ? '  — ' + r.error : ''))));
      }
      const changed = current.filter((r) => r.to !== r.from).length, bad = current.filter((r) => r.error).length;
      summary.textContent = bad ? plural(bad, 'name') + ' cannot be used.' : changed ? plural(changed, 'item') + ' will be renamed.' : 'Nothing to rename yet.';
      ok.disabled = bad > 0 || changed === 0;
    };
    ok.onclick = () => finish(current.filter((r) => r.to !== r.from));
    for (const i of [find, replace, template, start]) i.oninput = update;
    const field = (label, input) => el('label', { className: 'lrow' }, el('span', {}, label), input);
    const body = el('div', { className: 'dlg wide' },
      el('h3', {}, 'Rename ' + plural(count, 'item')),
      field('Find', find), field('Replace with', replace),
      field('New name', template), field('Start numbering at', start),
      el('p', { className: 'muted' }, 'In the new name, {name} is the original name and {n} is a counter ({n:3} pads it to 3 digits). Extensions are kept.'),
      list, summary,
      el('div', { className: 'btns' }, el('button', { onclick: () => finish(null) }, 'Cancel'), ok));
    close = show(body, { onEscape: () => finish(null) });
    update(); find.focus();
  });
}

// ---- duplicate files -----------------------------------------------------------------

/**
 * Shows groups of identical files ([{ size, paths }]) and lets the user tick the copies to remove.
 * Every group keeps at least one file. Resolves to the ticked paths, or null if cancelled.
 */
export function duplicatesDialog(groups, { root = '' } = {}) {
  return new Promise((resolve) => {
    let close = () => {};
    const finish = (v) => { close(); resolve(v); };
    const boxes = []; // [{ box, path, size, group }]
    const summary = el('span', { className: 'muted' }, '');
    const ok = el('button', { className: 'primary' }, 'Move to Trash');
    const update = () => {
      const picked = boxes.filter((b) => b.box.checked);
      const bytes = picked.reduce((s, b) => s + b.size, 0);
      summary.textContent = picked.length ? plural(picked.length, 'file') + ' selected · frees ' + fmtSize(bytes) : 'Nothing selected';
      ok.disabled = !picked.length;
    };
    const list = el('div', { className: 'duplist' });
    groups.forEach((g, gi) => {
      const members = [];
      list.append(el('div', { className: 'duphead' }, plural(g.paths.length, 'copy').replace('copys', 'copies') + ' · ' + fmtSize(g.size) + ' each'));
      g.paths.forEach((path, i) => {
        const box = el('input', { type: 'checkbox', checked: i > 0 });
        const rec = { box, path, size: g.size };
        members.push(rec); boxes.push(rec);
        box.onchange = () => {
          // never let the last remaining copy be ticked
          if (members.every((m) => m.box.checked)) box.checked = false;
          update();
        };
        const shown = root && path.startsWith(root) ? '…' + path.slice(root.length) : path;
        list.append(el('label', { className: 'duprow', title: path }, box, el('span', {}, shown)));
      });
    });
    ok.onclick = () => finish(boxes.filter((b) => b.box.checked).map((b) => b.path));
    const wasted = groups.reduce((s, g) => s + g.size * (g.paths.length - 1), 0);
    const body = el('div', { className: 'dlg wide' },
      el('h3', {}, plural(groups.length, 'set') + ' of duplicate files'),
      el('p', { className: 'muted' }, 'Copies could free up ' + fmtSize(wasted) + '. Ticked files go to the Trash; the first copy in each set is kept by default.'),
      list,
      el('div', { className: 'btns spread' }, summary, el('span', {}, el('button', { onclick: () => finish(null) }, 'Cancel'), ' ', ok)));
    close = show(body, { onEscape: () => finish(null) });
    update(); ok.focus();
  });
}

// ---- progress -----------------------------------------------------------------

/**
 * Progress dialog for a long copy/move. It only appears if the operation is still running after
 * `delay` ms, so quick operations never flash a dialog. `onCancel` is called when Cancel is pressed.
 */
export function progressDialog({ title, onCancel, delay = 400 }) {
  const bar = el('div', { className: 'bar' }, el('div', { className: 'fill' }));
  const fill = bar.firstChild;
  const current = el('p', { className: 'cur' }, '');
  const numbers = el('p', { className: 'muted' }, 'Preparing…');
  const cancel = el('button', { onclick: () => { cancel.disabled = true; cancel.textContent = 'Cancelling…'; onCancel(); } }, 'Cancel');
  const body = el('div', { className: 'dlg' }, el('h3', {}, title), current, bar, numbers, el('div', { className: 'btns' }, cancel));

  let closer = null, closed = false;
  const timer = setTimeout(() => { if (!closed) closer = show(body); }, delay);
  return {
    update({ done, total, current: name }) {
      const pct = total ? Math.min(100, (done / total) * 100) : 0;
      fill.style.width = pct.toFixed(1) + '%';
      current.textContent = name;
      numbers.textContent = fmtSize(done) + ' of ' + fmtSize(total) + ' (' + Math.floor(pct) + '%)';
    },
    close() { closed = true; clearTimeout(timer); if (closer) closer(); },
    get visible() { return !!closer; },
  };
}

// ---- properties ---------------------------------------------------------------

/**
 * Read-only properties for one item (`props` from the backend) or several.
 * `stats` is a function returning a promise of { size, files, folders } for a folder.
 */
export function propertiesDialog(props, { stats, onCopyPath, sep }) {
  const rows = [];
  const row = (label, value) => { const v = el('span', {}, value); rows.push(el('div', { className: 'prow' }, el('span', { className: 'plabel' }, label), v)); return v; };

  const p = props;
  row('Name', p.name);
  row('Type', p.isDir ? 'File folder' : p.ext ? p.ext.toUpperCase() + ' file' : 'File');
  row('Location', p.parent || sep);
  let sizeCell, contentsCell;
  if (p.isDir) {
    sizeCell = row('Size', 'Calculating…');
    contentsCell = row('Contains', p.items != null ? plural(p.items, 'item') + ' (calculating total…)' : '');
    stats(p.path).then((s) => {
      sizeCell.textContent = fmtSize(s.size) + ' (' + s.size.toLocaleString() + ' bytes)';
      contentsCell.textContent = plural(s.files, 'file') + ', ' + plural(s.folders, 'folder');
    }).catch(() => { sizeCell.textContent = 'Unavailable'; contentsCell.textContent = ''; });
  } else {
    row('Size', fmtSize(p.size) + ' (' + p.size.toLocaleString() + ' bytes)');
  }
  if (p.isSymlink) row('Link to', p.symlinkTarget || 'unknown');
  row('Created', fmtDateTime(p.ctime));
  row('Modified', fmtDateTime(p.mtime));
  row('Accessed', fmtDateTime(p.atime));
  row('Attributes', [p.readonly ? 'Read-only' : null, p.hidden ? 'Hidden' : null].filter(Boolean).join(', ') || 'None');

  let close = () => {};
  const done = () => close();
  const closeBtn = el('button', { className: 'primary', onclick: done }, 'Close');
  const body = el('div', { className: 'dlg props' },
    el('h3', {}, p.name + ' Properties'),
    ...rows,
    el('div', { className: 'btns' }, el('button', { onclick: () => onCopyPath(p.path) }, 'Copy path'), closeBtn));
  close = show(body, { onEscape: done });
  closeBtn.focus();
}

/** Properties for several items at once: just counts and the combined size. */
export function multiPropertiesDialog(items, { stats }) {
  const folders = items.filter((e) => e.isDir), files = items.filter((e) => !e.isDir);
  const total = el('span', {}, 'Calculating…');
  const contains = el('span', {}, '');
  let fileBytes = files.reduce((s, e) => s + (e.size || 0), 0), count = files.length, dirCount = 0;
  Promise.all(folders.map((f) => stats(f.path))).then((all) => {
    for (const s of all) { fileBytes += s.size; count += s.files; dirCount += s.folders; }
    total.textContent = fmtSize(fileBytes) + ' (' + fileBytes.toLocaleString() + ' bytes)';
    contains.textContent = plural(count, 'file') + ', ' + plural(dirCount + folders.length, 'folder') + ' (including the selected folders)';
  }).catch(() => { total.textContent = 'Unavailable'; });
  let close = () => {};
  const closeBtn = el('button', { className: 'primary', onclick: () => close() }, 'Close');
  const body = el('div', { className: 'dlg props' },
    el('h3', {}, plural(items.length, 'item') + ' selected'),
    el('div', { className: 'prow' }, el('span', { className: 'plabel' }, 'Selected'), el('span', {}, plural(files.length, 'file') + ', ' + plural(folders.length, 'folder'))),
    el('div', { className: 'prow' }, el('span', { className: 'plabel' }, 'Total size'), total),
    el('div', { className: 'prow' }, el('span', { className: 'plabel' }, 'Contains'), contains),
    el('div', { className: 'btns' }, closeBtn));
  close = show(body, { onEscape: () => close() });
  closeBtn.focus();
}
