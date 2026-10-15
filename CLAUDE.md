# Instructions for AI assistants

## Commit messages

Releases get their changelog from the git history: `./make.sh bump` turns the commits since the last
release tag into `CHANGELOG.md` (`scripts/changelog.js`). The first line of every commit you write is
therefore user-facing release-note text. Always write it as `type: description` or `type(scope): description`.

| Prefix | Use it for | Changelog section |
| --- | --- | --- |
| `feat:` | A new feature or option users can see | Added |
| `fix:` | A bug fix (`bug:` and `bugs:` work too) | Fixed |
| `perf:`, `refactor:`, `change:` | Faster or reworked behaviour users may notice | Changed |
| `remove:` | A feature that is gone | Removed |
| `deprecate:` | A feature that will go away soon | Deprecated |
| `security:` | A security fix | Security |
| `docs:`, `chore:`, `test:`, `ci:`, `build:`, `style:` | Work users do not need to hear about | Left out of the changelog |

Rules:

- **Pick the type by what the change does for the user**, not by which files changed. A new right-click
  option is `feat:` even if it touches Rust and JS. A change to `README.md`, `CONTRIBUTING.md`, tests,
  scripts, CI or dependencies is `docs:`, `test:`, `build:`, `ci:` or `chore:`.
- **Write the description for someone updating the app**: "fix: pinned folders no longer disappear after a
  restart", not "fix: nav bug" or "fix: update renderer.js". Imperative mood, lower case after the prefix,
  no final full stop, about 70 characters at most.
- **One change per commit.** Each commit becomes one bullet in the changelog. If a piece of work adds a
  feature and fixes a bug, make two commits. Do not bundle unrelated changes to save a commit.
- **Scope is optional.** Use it when it helps the reader: `ui`, `sidebar`, `search`, `zip`, `split-view`.
  It shows as "**sidebar:** ..." in the changelog.
- **Breaking changes** use `!`: `feat!: store pins as JSON`. They show as "**Breaking:** ..." even for the
  hidden types. Say what users must do in the commit body.
- **Details go in the body** after a blank line. Only the first line reaches the changelog.
- Never write vague subjects such as "update", "changes", "fixes" or "wip". They end up verbatim in the changelog.
- Do not add version bump or release commits by hand: `./make.sh bump` does that, and commits whose
  subject starts with "release", "bump" or "version" are skipped by the changelog.

Examples:

```
feat: import pins from File Explorer
feat(split-view): add a second pane for copying between folders
fix(sidebar): keep pinned folders in order after a restart
perf: calculate folder sizes in the background
remove: drop the Alt+P preview shortcut
docs: explain the commit message format
chore: update tauri to 2.12
```

## Keeping FEATURES.md current

[FEATURES.md](FEATURES.md) is the list of what the app can do. In the same commit that adds, changes or
removes a user-facing feature, add or edit its row there (feature, how to use it, and today's date in the
Added column; releases replace the date with a version). Use the same wording style as the existing rows.
Changes users cannot see (refactors, tests, tooling for developers) do not need a row.

## Releasing

Do not bump versions, edit `CHANGELOG.md` or create tags unless asked. When asked to cut a release, follow
[docs/RELEASING.md](docs/RELEASING.md): `./make.sh bump patch|minor|major` sets the version and writes the
changelog section, then the commit is reviewed and tagged by the user.
