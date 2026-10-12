# Security Policy

Explorer X reads, copies, moves and deletes files on your computer, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting instead: on the repository go to **Security → Report a vulnerability**. Include what you found, how to reproduce it and the OS and version you used. You will get a response as soon as a maintainer can look at it.

## Supported versions

Only the latest release receives fixes while the project is pre-1.0.

## Design notes

- The UI runs in the system webview under a strict Content Security Policy (no inline scripts, no remote content).
- The UI can only reach the filesystem through the Rust commands registered in `src-tauri/src/lib.rs`.
- Deletions go to the system Trash / Recycle Bin.
- Release builds are not code-signed yet; verify downloads come from the project's GitHub Releases page.
