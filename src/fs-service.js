// Pure Node filesystem helpers shared by the main process and tests.
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

async function listDir(dir, showHidden = false) {
  const names = await fs.readdir(dir);
  const out = [];
  await Promise.all(names.map(async (name) => {
    const full = path.join(dir, name);
    try {
      const st = await fs.lstat(full);
      let isDir = st.isDirectory();
      if (st.isSymbolicLink()) { try { isDir = (await fs.stat(full)).isDirectory(); } catch { /* broken link */ } }
      const hidden = name.startsWith('.');
      if (hidden && !showHidden) return;
      out.push({
        name, path: full, isDir, size: isDir ? null : st.size,
        mtime: st.mtimeMs, ctime: st.birthtimeMs,
        ext: isDir ? '' : path.extname(name).slice(1).toLowerCase(), hidden,
      });
    } catch { /* unreadable entry: skip */ }
  }));
  return out;
}

function uniqueName(name, existing) {
  if (!existing.has(name)) return name;
  const ext = path.extname(name), base = path.basename(name, ext);
  for (let i = 2; ; i++) {
    const cand = `${base} (${i})${ext}`;
    if (!existing.has(cand)) return cand;
  }
}

async function copyInto(srcs, destDir) {
  const existing = new Set(await fs.readdir(destDir));
  for (const s of srcs) {
    if (path.resolve(destDir).startsWith(path.resolve(s) + path.sep)) throw new Error('Cannot copy a folder into itself');
    const name = uniqueName(path.basename(s), existing);
    existing.add(name);
    await fs.cp(s, path.join(destDir, name), { recursive: true });
  }
}

async function moveInto(srcs, destDir) {
  const existing = new Set(await fs.readdir(destDir));
  for (const s of srcs) {
    if (path.dirname(s) === destDir) continue;
    if (path.resolve(destDir) === path.resolve(s) || path.resolve(destDir).startsWith(path.resolve(s) + path.sep)) {
      throw new Error('Cannot move a folder into itself');
    }
    const name = uniqueName(path.basename(s), existing);
    existing.add(name);
    const target = path.join(destDir, name);
    try { await fs.rename(s, target); }
    catch (e) {
      if (e.code !== 'EXDEV') throw e;
      await fs.cp(s, target, { recursive: true });
      await fs.rm(s, { recursive: true });
    }
  }
}

async function rename(p, newName) {
  if (/[\\/]/.test(newName) || !newName.trim()) throw new Error('Invalid name');
  const target = path.join(path.dirname(p), newName);
  let exists = true;
  try { await fs.access(target); } catch { exists = false; }
  if (exists) throw new Error('A file with that name already exists');
  await fs.rename(p, target);
  return target;
}

async function mkdir(dir, name = 'New folder') {
  const n = uniqueName(name, new Set(await fs.readdir(dir)));
  await fs.mkdir(path.join(dir, n));
  return path.join(dir, n);
}

async function newFile(dir, name = 'New file.txt') {
  const n = uniqueName(name, new Set(await fs.readdir(dir)));
  await fs.writeFile(path.join(dir, n), '');
  return path.join(dir, n);
}

async function search(root, query, limit = 500) {
  const q = query.toLowerCase(), res = [], stack = [root];
  while (stack.length && res.length < limit) {
    const d = stack.pop();
    let ents;
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.name.toLowerCase().includes(q)) res.push({ name: e.name, path: full, isDir: e.isDirectory() });
      if (e.isDirectory() && !e.isSymbolicLink()) stack.push(full);
      if (res.length >= limit) break;
    }
  }
  return res;
}

function drives() {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile('powershell', ['-NoProfile', '-Command',
        'Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json -Compress'],
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          resolve([].concat(JSON.parse(stdout)).map((d) => ({ name: d.Name + ':', path: d.Name + ':\\', free: d.Free, used: d.Used })));
        } catch { resolve([]); }
      });
    });
  }
  const list = [{ name: process.platform === 'darwin' ? 'Macintosh HD' : 'File System', path: '/' }];
  return fs.readdir(process.platform === 'darwin' ? '/Volumes' : '/mnt').then(
    (v) => list.concat(v.filter((n) => process.platform !== 'darwin' || n !== 'Macintosh HD')
      .map((n) => ({ name: n, path: path.join(process.platform === 'darwin' ? '/Volumes' : '/mnt', n) }))),
    () => list);
}

function quickAccess() {
  const h = os.homedir();
  const videos = process.platform === 'darwin' ? 'Movies' : 'Videos';
  return [['Home', ''], ['Desktop', 'Desktop'], ['Documents', 'Documents'], ['Downloads', 'Downloads'],
    ['Pictures', 'Pictures'], ['Music', 'Music'], ['Videos', videos]]
    .map(([name, sub]) => ({ name, path: path.join(h, sub) }));
}

module.exports = { listDir, copyInto, moveInto, rename, mkdir, newFile, search, drives, quickAccess, uniqueName };
