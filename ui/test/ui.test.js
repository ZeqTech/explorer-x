import test from 'node:test';
import assert from 'node:assert/strict';
import { UndoStack } from '../undo.js';
import { fmtSize, parentOf, joinPath, baseName, iconKey, plural, invertMoves, typeOf, parsePins, planRename, splitExt, matchesFilter, NO_FILTER, filterActive } from '../format.js';

test('fmtSize', () => {
  assert.equal(fmtSize(null), '');
  assert.equal(fmtSize(0), '0 B');
  assert.equal(fmtSize(1023), '1023 B');
  assert.equal(fmtSize(1024), '1.0 KB');
  assert.equal(fmtSize(15 * 1024 * 1024), '15 MB');
  assert.equal(fmtSize(5 * 1024 ** 4), '5.0 TB');
});

test('paths', () => {
  assert.equal(parentOf('C:\\Users\\Owner', '\\'), 'C:\\Users');
  assert.equal(parentOf('C:\\Users', '\\'), 'C:\\');
  assert.equal(parentOf('C:\\', '\\'), null);
  assert.equal(parentOf('/home/me', '/'), '/home');
  assert.equal(parentOf('/home', '/'), '/');
  assert.equal(joinPath('C:\\', 'x', '\\'), 'C:\\x');
  assert.equal(joinPath('/a', 'b', '/'), '/a/b');
  assert.equal(baseName('C:\\Users\\Owner\\'), 'Owner');
  assert.equal(baseName('/'), '/');
});

test('misc helpers', () => {
  assert.equal(plural(1, 'item'), '1 item');
  assert.equal(plural(3, 'item'), '3 items');
  assert.equal(typeOf({ isDir: true }), 'File folder');
  assert.equal(typeOf({ isDir: false, ext: 'png' }), 'PNG file');
  assert.equal(typeOf({ isDir: false, ext: '' }), 'File');
  assert.deepEqual(invertMoves([{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }]), [{ from: 'd', to: 'c' }, { from: 'b', to: 'a' }]);
});

test('icon keys share icons by file type, except folders and per-file kinds', () => {
  assert.equal(iconKey({ isDir: true, ext: '', path: '/x' }), 'p:/x'); // special folders have their own icons
  assert.equal(iconKey({ isDir: false, ext: 'txt', path: '/a.txt' }), 'e:txt');
  assert.equal(iconKey({ isDir: false, ext: 'txt', path: '/b.txt' }), 'e:txt');
  assert.equal(iconKey({ isDir: false, ext: 'exe', path: '/a.exe' }), 'p:/a.exe');
});

test('undo stack: undo, redo, and redo is dropped by a new action', async () => {
  const log = [];
  const op = (name) => ({ label: name, undo: async () => log.push('undo ' + name), redo: async () => log.push('redo ' + name) });
  const s = new UndoStack();
  assert.equal(await s.undo(), null);
  s.push(op('A')); s.push(op('B'));
  assert.deepEqual([s.canUndo, s.canRedo, s.undoLabel], [true, false, 'B']);

  assert.equal(await s.undo(), 'B');
  assert.deepEqual([s.canRedo, s.redoLabel, s.undoLabel], [true, 'B', 'A']);
  assert.equal(await s.redo(), 'B');
  await s.undo(); await s.undo();
  assert.deepEqual(log, ['undo B', 'redo B', 'undo B', 'undo A']);

  s.push(op('C')); // new action clears what could be redone
  assert.equal(s.canRedo, false);
  assert.equal(await s.redo(), null);
});

test('undo stack: failing undo drops the entry and rethrows', async () => {
  const s = new UndoStack();
  s.push({ label: 'ok', undo: async () => {}, redo: async () => {} });
  s.push({ label: 'bad', undo: async () => { throw new Error('nope'); }, redo: async () => {} });
  await assert.rejects(s.undo(), /nope/);
  assert.equal(s.undoLabel, 'ok'); // the next undo moves on to the previous entry
  assert.equal(s.canRedo, false);
});

test('undo stack: history is capped', async () => {
  const s = new UndoStack(3);
  for (let i = 0; i < 5; i++) s.push({ label: String(i), undo: async () => {}, redo: async () => {} });
  assert.equal(s.past.length, 3);
  assert.equal(s.past[0].label, '2');
});


test('parsePins accepts JSON, arrays and plain path lists', () => {
  assert.deepEqual(parsePins('{"pins":[{"path":"/a","name":"A"},"/b"]}'), [{ path: '/a', name: 'A' }, { path: '/b' }]);
  assert.deepEqual(parsePins('["/x","/x","/y"]'), [{ path: '/x' }, { path: '/y' }]);
  assert.deepEqual(parsePins('"/one"\n\n/two\n'), [{ path: '/one' }, { path: '/two' }]);
  assert.throws(() => parsePins(''), /Nothing/);
  assert.throws(() => parsePins('{oops'), /valid JSON/);
  assert.throws(() => parsePins('{"a":1}'), /list of pins/);
  assert.throws(() => parsePins('[1, null]'), /No folder paths/);
});

test('splitExt keeps folders and dotfiles whole', () => {
  assert.deepEqual(splitExt('a.b.txt', false), ['a.b', '.txt']);
  assert.deepEqual(splitExt('.gitignore', false), ['.gitignore', '']);
  assert.deepEqual(splitExt('v1.2', true), ['v1.2', '']);
});

test('planRename: find/replace, numbering and conflicts', () => {
  const files = [{ name: 'IMG_1.jpg' }, { name: 'IMG_2.jpg' }, { name: 'notes.txt' }];
  assert.deepEqual(planRename(files, { find: 'IMG', replace: 'Trip' }).map((r) => r.to), ['Trip_1.jpg', 'Trip_2.jpg', 'notes.txt']);
  assert.deepEqual(planRename(files, { template: 'Photo {n:3}', start: 7 }).map((r) => r.to), ['Photo 007.jpg', 'Photo 008.jpg', 'Photo 009.txt']);
  assert.equal(planRename(files, { template: 'same' }).filter((r) => r.error).length, 2);
  assert.equal(planRename([{ name: 'a.txt' }], { template: 'b', others: ['B.txt'] })[0].error, 'Already exists');
  assert.match(planRename([{ name: 'a.txt' }], { template: 'x/y' })[0].error, /not allowed/);
  assert.match(planRename([{ name: 'a.txt' }], { template: '{name}.' , find: '', replace: '' })[0].error || '', /dot|^$/);
  assert.equal(planRename([{ name: 'a.txt' }])[0].to, 'a.txt');
});

test('planRename rejects backslashes and trailing dots', () => {
  assert.match(planRename([{ name: 'a.txt' }], { template: 'x' + String.fromCharCode(92) + 'y' })[0].error, /not allowed/);
  assert.match(planRename([{ name: 'a' }], { template: 'x.' })[0].error, /dot or space/);
});

test('matchesFilter: type, size and date', () => {
  const now = new Date(2026, 9, 15, 15, 0, 0).getTime(); // 15 Oct 2026, 15:00
  const day = 86400000, MB = 1024 * 1024;
  const f = (o) => ({ ...NO_FILTER, ...o });
  const file = (ext, size, mtime = now) => ({ isDir: false, ext, size, mtime });
  const dir = { isDir: true, ext: '', size: null, mtime: now };

  assert.equal(filterActive(NO_FILTER), false);
  assert.equal(filterActive(f({ size: 'small' })), true);
  assert.equal(matchesFilter(file('png', 5), NO_FILTER, now), true);

  assert.equal(matchesFilter(file('PNG', 5), f({ type: 'images' }), now), true);
  assert.equal(matchesFilter(file('mp3', 5), f({ type: 'images' }), now), false);
  assert.equal(matchesFilter(dir, f({ type: 'images' }), now), false);
  assert.equal(matchesFilter(dir, f({ type: 'folders' }), now), true);
  assert.equal(matchesFilter(file('txt', 5), f({ type: 'folders' }), now), false);

  assert.equal(matchesFilter(file('a', 0), f({ size: 'empty' }), now), true);
  assert.equal(matchesFilter(file('a', 1), f({ size: 'small' }), now), true);
  assert.equal(matchesFilter(file('a', MB), f({ size: 'small' }), now), false);
  assert.equal(matchesFilter(file('a', MB), f({ size: 'medium' }), now), true);
  assert.equal(matchesFilter(file('a', 100 * MB), f({ size: 'large' }), now), true);
  assert.equal(matchesFilter(file('a', 2048 * MB), f({ size: 'huge' }), now), true);
  assert.equal(matchesFilter(dir, f({ size: 'small' }), now), false);

  assert.equal(matchesFilter(file('a', 1, now - 2 * 3600000), f({ date: 'today' }), now), true);
  assert.equal(matchesFilter(file('a', 1, now - 20 * 3600000), f({ date: 'today' }), now), false);
  assert.equal(matchesFilter(file('a', 1, now - 6 * day), f({ date: 'week' }), now), true);
  assert.equal(matchesFilter(file('a', 1, now - 8 * day), f({ date: 'week' }), now), false);
  assert.equal(matchesFilter(file('a', 1, now - 29 * day), f({ date: 'month' }), now), true);
  assert.equal(matchesFilter(file('a', 1, now - 400 * day), f({ date: 'older' }), now), true);
  assert.equal(matchesFilter(file('a', 1, now - 10 * day), f({ date: 'older' }), now), false);
  assert.equal(matchesFilter(file('a', 1, 0), f({ date: 'week' }), now), false);

  // all three at once
  assert.equal(matchesFilter(file('jpg', 3 * MB, now - day), f({ type: 'images', size: 'medium', date: 'week' }), now), true);
  assert.equal(matchesFilter(file('jpg', 3 * MB, now - 40 * day), f({ type: 'images', size: 'medium', date: 'week' }), now), false);
});
