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
    if (ev.key === 'Escape' && onEscape) { ev.preventDefault(); ev.stopPropagation(); onEscape(); }
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
