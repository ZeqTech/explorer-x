#!/usr/bin/env bash
# Build Explorer X (Tauri) installers.
#   ./build.sh            build for the current OS
#   ./build.sh win        Windows installer + portable .exe   (output in dist/)
#   ./build.sh mac        macOS universal .dmg                (must run on a Mac)
#   ./build.sh all        win, plus mac when running on a Mac
# Env: SKIP_TESTS=1 skips the test run; MAC_TARGET=aarch64-apple-darwin builds one Mac arch only.
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
# Homebrew's rustup is keg-only; put its proxies ahead of a standalone Homebrew "rust" rustc,
# which ignores rust-toolchain.toml and lacks the cross-compile targets.
for d in /opt/homebrew/opt/rustup/bin /usr/local/opt/rustup/bin; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
command -v cargo >/dev/null || {
  echo "Rust not found. Install it from https://rustup.rs, then retry." >&2
  exit 1
}
echo "Using $(rustc -V)"

# On Windows, npm/npx are bash scripts whose "#!/usr/bin/env bash" can resolve to the WSL
# launcher; the .cmd shims avoid that.
if [ "$HOST" = win ]; then NPM=pnpm.cmd; else NPM=pnpm; fi

echo "==> Installing dependencies"
"$NPM" install
if [ "${SKIP_TESTS:-0}" = 1 ]; then
  echo "==> Skipping tests (SKIP_TESTS=1)"
else
  echo "==> Running tests"
  "$NPM" test
fi

BUNDLE=src-tauri/target/release/bundle

# The version being built. Installer names come from tauri.conf.json, so it must match package.json.
VERSION=$(node -p "require('./package.json').version")
CONF_VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
if [ "$VERSION" != "$CONF_VERSION" ]; then
  echo "Version mismatch: package.json says $VERSION but src-tauri/tauri.conf.json says $CONF_VERSION." >&2
  echo "Run: node scripts/set-version.js $VERSION" >&2
  exit 1
fi
echo "==> Building version $VERSION"

# Empty dist/ rather than deleting it: the folder itself can be busy (open in a terminal or an
# editor), which made "rm -rf dist" fail with "Device or resource busy".
mkdir -p dist
in_use=()
for f in dist/* dist/.[!.]*; do
  [ -e "$f" ] || continue
  rm -rf "$f" 2>/dev/null || in_use+=("$f")
done
if [ "${#in_use[@]}" -gt 0 ]; then
  echo "Could not clear dist/ because these are in use (is Explorer X running from dist/?):" >&2
  printf '  %s\n' "${in_use[@]}" >&2
  echo "Close the program using them and run the build again." >&2
  exit 1
fi

build_win() {
  echo "==> Building Windows (NSIS installer + portable exe)"
  # Installers from earlier versions are left behind in the bundle folder; remove them so only the
  # one for this version exists.
  rm -rf "$BUNDLE/nsis"
  "$NPM" exec tauri build --bundles nsis
  cp "$BUNDLE"/nsis/*"_${VERSION}_"*.exe dist/
  cp src-tauri/target/release/explorer-x.exe "dist/Explorer X ${VERSION}.exe"
}

build_mac() {
  if [ "$HOST" != "mac" ]; then
    echo "!! macOS builds require running on a Mac. Skipping." >&2
    return 1
  fi
  # MAC_TARGET=aarch64-apple-darwin (or x86_64-apple-darwin) builds one architecture in about
  # half the time; the default is a universal binary that runs on both.
  MAC_TARGET="${MAC_TARGET:-universal-apple-darwin}"
  echo "==> Building macOS ($MAC_TARGET, dmg)"
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  M=src-tauri/target/$MAC_TARGET/release/bundle
  rm -rf "$M/dmg" # older versions' disk images would otherwise be copied too
  "$NPM" exec tauri build --target "$MAC_TARGET" --bundles dmg
  cp "$M"/dmg/*"_${VERSION}_"*.dmg dist/
}

case "$TARGET" in
  win)  build_win ;;
  mac)  build_mac ;;
  all)  build_win; build_mac || echo "(mac build skipped; run './build.sh mac' on a Mac)" ;;
  *)    echo "Usage: $0 [win|mac|all]" >&2; exit 2 ;;
esac

echo "==> Done. Artifacts in dist/:"
ls -1 dist
