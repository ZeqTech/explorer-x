const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const s = require('../src/fs-service');

(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-'));
  fs.writeFileSync(path.join(d, 'a.txt'), 'hi');
  fs.mkdirSync(path.join(d, 'sub'));
  assert.deepStrictEqual((await s.listDir(d)).map((e) => e.name).sort(), ['a.txt', 'sub']);
  await s.copyInto([path.join(d, 'a.txt')], d);
  assert(fs.existsSync(path.join(d, 'a (2).txt')));
  await s.moveInto([path.join(d, 'a (2).txt')], path.join(d, 'sub'));
  assert(fs.existsSync(path.join(d, 'sub', 'a (2).txt')));
  await assert.rejects(s.moveInto([path.join(d, 'sub')], path.join(d, 'sub')), /itself/);
  await s.rename(path.join(d, 'a.txt'), 'b.txt');
  await assert.rejects(s.rename(path.join(d, 'b.txt'), 'sub'), /exists/);
  assert.strictEqual((await s.search(d, 'a (2)')).length, 1);
  assert.strictEqual(path.basename(await s.mkdir(d)), 'New folder');
  assert.strictEqual(path.basename(await s.mkdir(d)), 'New folder (2)');
  fs.rmSync(d, { recursive: true });
  console.log('fs-service tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
