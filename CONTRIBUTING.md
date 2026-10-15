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
