// Sets the app version everywhere it lives, so installer names and the app's "about" version
// match the git tag.   Usage: node scripts/set-version.js 0.2.0   (or: patch | minor | major)
// (CI runs this on tag builds with the tag name minus the leading "v".)
const fs = require('fs');
const path = require('path');

const { execSync } = require('child_process');
const parse = (v) => v.split('-')[0].split('.').map(Number);
const newer = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

// "patch" | "minor" | "major" bump from whichever is higher: package.json or the latest v* tag
// (CI stamps tag versions at build time, so package.json can lag behind the tags).
function resolve(arg) {
  if (!['patch', 'minor', 'major'].includes(arg)) return arg;
  let cur = require('../package.json').version;
  try {
    const tag = execSync('git describe --tags --abbrev=0 --match "v[0-9]*"', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().slice(1);
    if (/^\d+\.\d+\.\d+/.test(tag) && newer(tag, cur)) cur = tag;
  } catch { /* no tags yet */ }
  const [ma, mi, pa] = parse(cur);
  return arg === 'major' ? `${ma + 1}.0.0` : arg === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
}
const version = resolve(process.argv[2]);
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version || '')) {
  console.error('Usage: node scripts/set-version.js <major.minor.patch | patch | minor | major>   (got: ' + process.argv[2] + ')');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const edit = (file, fn) => {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after !== before) fs.writeFileSync(p, after);
  console.log((after === before ? 'unchanged ' : 'updated   ') + file);
};

// JSON files: replace only the "version" value, leaving formatting and line endings alone
const jsonVersion = (s) => s.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
edit('package.json', jsonVersion);
edit('src-tauri/tauri.conf.json', jsonVersion);
// package-lock.json repeats the root version at the top and under packages[""]
edit('package-lock.json', (s) => s.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`)
  .replace(/("packages"\s*:\s*\{\s*""\s*:\s*\{[^}]*?"version"\s*:\s*")[^"]*(")/, `$1${version}$2`));
// Cargo.toml: the [package] version is the only line that starts with `version =`
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = ".*"/m, `version = "${version}"`));
console.log('version ' + version);
