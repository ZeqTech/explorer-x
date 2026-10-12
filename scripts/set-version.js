// Sets the app version everywhere it lives, so installer names and the app's "about" version
// match the git tag.   Usage: node scripts/set-version.js 0.2.0
// (CI runs this on tag builds with the tag name minus the leading "v".)
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version || '')) {
  console.error('Usage: node scripts/set-version.js <major.minor.patch>   (got: ' + version + ')');
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
