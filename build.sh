#!/usr/bin/env bash
# Build Explorer X (Tauri) installers.
#   ./build.sh            build for the current OS
#   ./build.sh win        Windows installer + portable .exe   (output in dist/)
#   ./build.sh mac        macOS universal .dmg + .zip          (must run on a Mac)
#   ./build.sh all        win, plus mac when running on a Mac
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]:-$0}")"

case "$(uname -s)" in
  Darwin) HOST=mac ;;
  MINGW*|MSYS*|CYGWIN*) HOST=win ;;
  *) HOST=linux ;;
esac
TARGET="${1:-$HOST}"

# Find Node even when the shell's PATH lacks it (nvm-windows, default installer, Homebrew).
if ! command -v node >/dev/null; then
  for d in "/c/Program Files/nodejs" "/c/nvm4w/nodejs" "$HOME/AppData/Local/nvm" \
           "/mnt/c/Program Files/nodejs" "/mnt/c/nvm4w/nodejs" /opt/homebrew/bin /usr/local/bin; do
    [ -x "$d/node" ] || [ -x "$d/node.exe" ] && { PATH="$d:$PATH"; break; }
  done
fi
command -v node >/dev/null || {
  echo "Node.js not found on PATH. Install it from https://nodejs.org (or run 'nvm use <version>'), then retry." >&2
  exit 1
}
echo "Using node $(node -v) from $(command -v node)"

# Rust (rustup puts cargo in ~/.cargo/bin). rust-toolchain.toml pins the version.
export PATH="$HOME/.cargo/bin:$PATH"
command -v cargo >/dev/null || {
  echo "Rust not found. Install it from https://rustup.rs, then retry." >&2
  exit 1
}
echo "Using $(rustc -V)"

# On Windows, npm/npx are bash scripts whose "#!/usr/bin/env bash" can resolve to the WSL
# launcher; the .cmd shims avoid that.
if [ "$HOST" = win ]; then NPM=npm.cmd; NPX=npx.cmd; else NPM=npm; NPX=npx; fi

echo "==> Installing dependencies"
"$NPM" install --no-audit --no-fund
echo "==> Running tests"
"$NPM" test

BUNDLE=src-tauri/target/release/bundle
rm -rf dist && mkdir -p dist

build_win() {
  echo "==> Building Windows (NSIS installer + portable exe)"
  "$NPX" tauri build --bundles nsis
  cp "$BUNDLE"/nsis/*.exe dist/
  VERSION=$(node -p "require('./package.json').version")
  cp src-tauri/target/release/explorer-x.exe "dist/Explorer X ${VERSION} portable.exe"
}

build_mac() {
  if [ "$HOST" != "mac" ]; then
    echo "!! macOS builds require running on a Mac. Skipping." >&2
    return 1
  fi
  echo "==> Building macOS (universal dmg + zip)"
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  "$NPX" tauri build --target universal-apple-darwin --bundles app,dmg
  M=src-tauri/target/universal-apple-darwin/release/bundle
  cp "$M"/dmg/*.dmg dist/
  ditto -c -k --keepParent "$M/macos/Explorer X.app" "dist/Explorer X.app.zip"
}

case "$TARGET" in
  win)  build_win ;;
  mac)  build_mac ;;
  all)  build_win; build_mac || echo "(mac build skipped; run './build.sh mac' on a Mac)" ;;
  *)    echo "Usage: $0 [win|mac|all]" >&2; exit 2 ;;
esac

echo "==> Done. Artifacts in dist/:"
ls -1 dist
