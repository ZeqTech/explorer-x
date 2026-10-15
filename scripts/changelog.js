// Lists the git commits between two releases as a Markdown changelog section.
//   node scripts/changelog.js                      commits since the latest v* tag, printed (and saved to
//                                                  CHANGELOG.md if that file does not exist yet)
//   node scripts/changelog.js --version 0.2.0      title the section "0.2.0" instead of "Unreleased"
//   node scripts/changelog.js --from v0.1.1 --to v0.1.2
//   node scripts/changelog.js --write              also put the section at the top of CHANGELOG.md
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const root = path.join(__dirname, '..');
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

const to = opt('to') || 'HEAD';
let from = opt('from');
if (!from) {
  // Latest release tag before `to`; if `to` is itself tagged, that tag doesn't count.
  let exact = '';
  try { exact = git('describe', '--tags', '--exact-match', '--match', 'v[0-9]*', to); } catch { /* not tagged */ }
  try { from = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', exact ? exact + '^' : to); }
  catch { from = ''; } // no earlier release: use the whole history
}

const range = from ? `${from}..${to}` : to;
const log = git('log', range, '--no-merges', '--format=%h%x09%s');
const lines = log ? log.split('\n') : [];
const version = opt('version') || 'Unreleased';
const date = new Date().toISOString().slice(0, 10);

let section = `## ${version} (${date})\n\n`;
section += lines.length
  ? lines.map((l) => { const [h, ...s] = l.split('\t'); return `- ${s.join('\t')} (${h})`; }).join('\n')
  : '_No changes._';
section += '\n';
if (from) section += `\nChanges since ${from}.\n`;

console.log(section);

const file = path.join(root, 'CHANGELOG.md');
const existed = fs.existsSync(file);
// --write always saves; otherwise the file is created when it does not exist yet (never overwritten).
if (args.includes('--write') || (!existed && !opt('from') && !opt('to'))) {
  let body = existed ? fs.readFileSync(file, 'utf8') : '# Changelog\n\n';
  // Re-running for the same version (or Unreleased) replaces that section instead of duplicating it.
  const start = body.indexOf(`## ${version} (`);
  if (start >= 0) {
    const next = body.indexOf('\n## ', start + 1);
    body = body.slice(0, start) + section + (next >= 0 ? body.slice(next) : '');
  } else if (body.startsWith('# Changelog')) {
    body = body.replace(/^# Changelog\n+/, (m) => m + section + '\n');
  } else {
    body = '# Changelog\n\n' + section + '\n' + body;
  }
  fs.writeFileSync(file, body);
  console.error((existed ? 'updated' : 'created') + ' CHANGELOG.md');
}
