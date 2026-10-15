# Contributing to Explorer X

Thanks for helping! Explorer X is MIT-licensed and everything happens in the open: issues, design discussion and pull requests are all welcome.

## Getting set up

You need [Node.js](https://nodejs.org) 20+ and [Rust](https://rustup.rs) (the exact version is pinned in `rust-toolchain.toml`, so `rustup` installs it for you). On Windows install the Visual Studio **C++ build tools**; on Linux see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm start        # run the app (the UI reloads when you edit ui/)
npm test         # Rust unit tests
```

## How the code is organised

| Where | What |
| --- | --- |
| `ui/` | The interface: plain HTML/CSS/JS, no bundler or framework |
| `ui/bridge.js` | The only place the UI talks to Rust (`window.fsapi`) |
| `src-tauri/src/fs_service.rs` | Filesystem logic. Pure Rust, no Tauri types, unit tested |
| `src-tauri/src/lib.rs` | Tauri commands, windows, OS integration |

Keep new filesystem behaviour in `fs_service.rs` with a test; keep `lib.rs` thin.

## Making a change

1. Open an issue first for anything big, so we can agree on the approach.
2. Branch from `main`, make your change in small commits with clear messages.
3. Run `npm test` and try the app on your OS. Mention which OS you tested.
4. Open a pull request and fill in the template.

## Commit messages

Releases get their changelog from the commit messages (`./make.sh bump`, see [docs/RELEASING.md](docs/RELEASING.md)), so the first line of each commit is what users will read. Start it with a type, a colon and a short description:

```
feat: import pins from File Explorer
fix(sidebar): keep pinned folders in order after a restart
perf: calculate folder sizes in the background
```

| Prefix | Use it for | Appears under |
| --- | --- | --- |
| `feat:` | A new feature or option users can see | Added |
| `fix:` (also `bug:`) | A bug fix | Fixed |
| `perf:`, `refactor:`, `change:` | Faster or reworked behaviour that users may notice | Changed |
| `remove:` | A feature that is gone | Removed |
| `deprecate:` | A feature that will go away soon | Deprecated |
| `security:` | A security fix | Security |
| `docs:`, `chore:`, `test:`, `ci:`, `build:`, `style:` | Work users do not need to hear about | Left out of the changelog |

A few rules keep the changelog readable:

- **Write for the person updating the app**, not for the code: "fix: pinned folders no longer disappear after a restart" beats "fix: nav bug". Use the imperative ("add", "fix"), start in lower case after the prefix, skip the final full stop, and keep the line under about 70 characters.
- **One change per commit.** Each commit becomes one bullet, so a commit that adds a feature and fixes two bugs should be three commits.
- **A scope is optional.** `fix(sidebar): ...` shows as "**sidebar:** ..." in the changelog. Use it when it helps, for example `ui`, `sidebar`, `search`, `zip`.
- **Breaking changes** get an exclamation mark, `feat!: ...`, and show up as "**Breaking:** ..." even for the hidden types. Explain what users must do in the commit body.
- **Details go in the body**, after a blank line. Only the first line reaches the changelog.
- Commits without a prefix still work: the first word decides ("Add..." goes under Added, "Fix..." under Fixed, "Remove..." under Removed) and anything else goes under Changed. A prefix is clearer, and it is the only way to keep a commit out of the changelog.

Squash-merged pull requests use the pull request title as the commit message, so give the title the same prefix.

### Guidelines

- **Windows and macOS are equal citizens.** Use `cfg!` / `#[cfg(...)]` for platform code, and keep shortcuts platform-correct (Ctrl vs Cmd).
- **Be careful with user files.** Destructive actions must be recoverable (Trash / Recycle Bin) or confirmed.
- **No new runtime dependencies without a reason.** The ~1 MB installer is a feature. Check the licence is MIT/Apache-2.0 compatible.
- **UI:** no inline styles or scripts (the Content Security Policy forbids them); add colours as CSS variables so light and dark themes both work.

## Reporting bugs

Use the bug report template. Include your OS and version, what you did, what you expected and what happened.

## Security issues

Please do not open a public issue; see [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
