import test from 'node:test';
import assert from 'node:assert/strict';
import { UndoStack } from '../undo.js';
import { fmtSize, parentOf, joinPath, baseName, iconKey, plural, invertMoves, typeOf, parsePins } from '../format.js';

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
