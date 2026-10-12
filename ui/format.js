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
