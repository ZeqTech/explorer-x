// Pure helpers shared by the UI (no DOM, no Tauri), so they can be unit tested with Node.

export function fmtSize(n) {
  if (n == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + units[i];
}

export function fmtDate(ms) {
  return new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtDateTime(ms) {
  return ms ? new Date(ms).toLocaleString([], { dateStyle: 'long', timeStyle: 'medium' }) : '—';
}

export function typeOf(e) {
  return e.isDir ? 'File folder' : e.ext ? e.ext.toUpperCase() + ' file' : 'File';
}

/** Parent folder of a path, or null at the top. `sep` is '\\' on Windows, '/' elsewhere. */
export function parentOf(p, sep) {
  const m = p.replace(/[\\/]+$/, '').match(/^(.*)[\\/][^\\/]*$/);
  if (!m) return null;
  if (/^[A-Za-z]:$/.test(m[1])) return m[1] + sep;
  return m[1] === '' ? sep : m[1];
}

export function joinPath(dir, name, sep) {
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function baseName(p) {
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

/** Cache key for a native file icon: icons depend on the file type, except for folders and a few kinds. */
const PER_FILE = new Set(['exe', 'lnk', 'ico', 'msi', 'url', 'app', 'scr', 'cur', 'appref-ms']);
export function iconKey(e) {
  if (e.isDir || PER_FILE.has(e.ext)) return 'p:' + e.path;
  return 'e:' + e.ext;
}

/** "3 items", "1 item" */
export function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

/** Swaps from/to so a list of moves can be undone. */
export function invertMoves(moves) {
  return moves.map((m) => ({ from: m.to, to: m.from })).reverse();
}

/**
 * Reads pins from pasted text: {"pins": [...]}, a bare array, or one path per line. Each pin is a
 * path string or { path, name }. Returns [{ path, name? }] with duplicates removed; throws a
 * readable Error when nothing usable is found.
 */
export function parsePins(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Nothing to import.');
  let list;
  if (/^[[{]/.test(t)) {
    let data;
    try { data = JSON.parse(t); } catch { throw new Error('That is not valid JSON.'); }
    list = Array.isArray(data) ? data : data && data.pins;
    if (!Array.isArray(list)) throw new Error('Expected a list of pins.');
  } else {
    list = t.split(/\r?\n/);
  }
  const seen = new Set(), out = [];
  for (const item of list) {
    const path = String(typeof item === 'string' ? item : item && item.path || '').trim().replace(/^"(.*)"$/, '$1');
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = item && typeof item === 'object' && typeof item.name === 'string' ? item.name.trim() : '';
    out.push(name ? { path, name } : { path });
  }
  if (!out.length) throw new Error('No folder paths found.');
  return out;
}

/** Splits "report.final.txt" into ["report.final", ".txt"]; folders and dotfiles keep their whole name. */
export function splitExt(name, isDir) {
  const i = name.lastIndexOf('.');
  return isDir || i <= 0 ? [name, ''] : [name.slice(0, i), name.slice(i)];
}

/**
 * Plans a batch rename. `items` is [{ name, isDir }] in the order they should be numbered;
 * `others` lists names that exist in the folder and are not being renamed.
 * Options: find / replace (plain text, applied to the name without its extension), template
 * ("Holiday {n:2} {name}": {name} is the name after find/replace, {n} a counter, {n:3} a counter
 * padded to 3 digits) and start (first counter value). Extensions are kept.
 * Returns [{ from, to, error? }]; `to` equals `from` when nothing changes.
 */
export function planRename(items, { find = '', replace = '', template = '{name}', start = 1, others = [] } = {}) {
  const tpl = template || '{name}';
  const out = items.map((it, i) => {
    const [stem, ext] = splitExt(it.name, it.isDir);
    const base = find ? stem.split(find).join(replace) : stem;
    const next = tpl.replace(/\{name\}/g, base).replace(/\{n(?::(\d+))?\}/g, (_, pad) => String(start + i).padStart(+pad || 0, '0')) + ext;
    return { from: it.name, to: next };
  });
  const existing = new Set(others.map((o) => o.toLowerCase()));
  const count = new Map();
  for (const r of out) count.set(r.to.toLowerCase(), (count.get(r.to.toLowerCase()) || 0) + 1);
  for (const r of out) {
    const key = r.to.toLowerCase();
    if (!r.to.trim() || r.to === '.' || r.to === '..') r.error = 'Name is empty';
    else if (/[\\/:*?"<>|\0]/.test(r.to)) r.error = 'Contains a character that is not allowed';
    else if (/[. ]$/.test(r.to)) r.error = 'Cannot end with a dot or space';
    else if (existing.has(key)) r.error = 'Already exists';
    else if (count.get(key) > 1) r.error = 'Same name as another item';
  }
  return out;
}
