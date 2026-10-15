// Builds a changelog section ("## 0.2.0 - 2026-10-15", then ### Added / Changed / Fixed ...) from the git
// commits between two releases.
//   node scripts/changelog.js                      preview the commits since the latest v* tag (nothing is saved)
//   node scripts/changelog.js --version 0.2.0      title the section "0.2.0" instead of "Unreleased"
//   node scripts/changelog.js --from v0.1.1 --to v0.1.2
//   node scripts/changelog.js --version 0.2.0 --write
//                                                  save it at the top of CHANGELOG.md, creating the file if needed
//                                                  (older versions stay below it). A version is required, so the
//                                                  file never contains an "Unreleased" section; `./make.sh bump` does this.
//
// Commits are sorted into Added / Changed / Fixed / Removed by their first word ("Add...", "Fix...",
// "Remove...") or by a conventional-commit prefix ("feat:", "fix:"); everything else is "Changed".
// Merge commits and release/version-bump commits are left out. When origin is a GitHub repository,
// commits link to GitHub and each section gets a "Full changelog" compare link.
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

// https://github.com/owner/repo, or '' when origin is missing or not on GitHub
let repoUrl = '';
try {
  // also accepts SSH host aliases such as git@github-work:owner/repo.git
  const m = git('remote', 'get-url', 'origin').match(/^(?:ssh:\/\/)?(?:[^@/]+@)?([^:/]+)(?::\d+)?[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (m && /github/i.test(m[1])) repoUrl = `https://github.com/${m[2]}/${m[3]}`;
} catch { /* no remote */ }

// ---- commits -> groups ---------------------------------------------------------------------
const ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
const CONVENTIONAL = /^(feat|fix|docs|chore|refactor|perf|test|style|build|ci)(\([^)]*\))?!?:\s*/i;
const SKIP = /^(release|bump|version)\b|^v?\d+\.\d+\.\d+\s*$/i;

function classify(subject) {
  const m = subject.match(CONVENTIONAL);
  const text = subject.replace(CONVENTIONAL, '');
  // capitalise plain words only, so "make.sh: ..." and "iOS ..." stay as written
  const t = /^[a-z]+(\s|$)/.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  if (m) {
    const kind = m[1].toLowerCase();
    return [kind === 'feat' ? 'Added' : kind === 'fix' ? 'Fixed' : 'Changed', t];
  }
  if (/^(fix(e[sd])?|bug|resolve[sd]?|patch(ed|es)?)\b/i.test(text)) return ['Fixed', t];
  if (/^(remove[sd]?|delete[sd]?|drop(ped|s)?)\b/i.test(text)) return ['Removed', t];
  if (/^deprecat/i.test(text)) return ['Deprecated', t];
  if (/^security\b/i.test(text)) return ['Security', t];
  if (/^(add(ed|s)?|new|introduce[sd]?|implement(ed|s)?|support(ed|s)?|allow(ed|s)?|enable[sd]?|create[sd]?)\b/i.test(text)) return ['Added', t];
  return ['Changed', t];
}

const range = from ? `${from}..${to}` : to;
const log = git('log', range, '--no-merges', '--format=%H%x09%h%x09%s');
const groups = Object.fromEntries(ORDER.map((g) => [g, []]));
for (const line of log ? log.split('\n') : []) {
  const [full, short, ...rest] = line.split('\t');
  const subject = rest.join('\t').trim();
  if (!subject || SKIP.test(subject)) continue;
  const [group, text] = classify(subject);
  groups[group].push(`- ${text} [${short}]`);// (${repoUrl ? `[${short}](${repoUrl}/commit/${full})` : short})`);
}

const version = opt('version') || 'Unreleased';
const date = new Date().toISOString().slice(0, 10);

let section = `## ${version} - ${date}\n\n`;
if (repoUrl && from) section += `Full changelog: ${repoUrl}/compare/${from}...${version === 'Unreleased' ? 'HEAD' : 'v' + version}\n\n`;
const filled = ORDER.filter((g) => groups[g].length);
section += filled.length ? filled.map((g) => `### ${g}\n\n${groups[g].join('\n')}\n`).join('\n') : '_No changes._\n';

console.log(section);

// ---- CHANGELOG.md -------------------------------------------------------------------------
const file = path.join(root, 'CHANGELOG.md');
const existed = fs.existsSync(file);
if (args.includes('--write')) {
  if (!opt('version')) { console.error('--write needs --version X.Y.Z (use ./make.sh bump to bump and write in one step)'); process.exit(1); }
  const text = existed ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '# Changelog\n\n';

  // everything before the first "## " heading stays as the file's intro; each "## " block is a release
  const first = text.search(/^## /m);
  const head = first < 0 ? text : text.slice(0, first);
  const nameOf = (s) => s.match(/^## (\S+)/)[1];
  const kept = (first < 0 ? '' : text.slice(first)).split(/^(?=## )/m).filter(Boolean)
    .filter((s) => nameOf(s) !== version); // re-running for a version replaces its section

  // the new section goes at the top, right under the intro
  const all = [section, ...kept].map((s) => s.replace(/\n+$/, '\n'));
  fs.writeFileSync(file, head.replace(/\n*$/, '\n\n') + all.join('\n'));
  console.error((existed ? 'updated' : 'created') + ' CHANGELOG.md');
}
