#!/usr/bin/env bash
# Build Explorer X installers.
#   ./build.sh            build for the current OS
#   ./build.sh win        Windows installer + portable .exe  (output in dist/)
#   ./build.sh mac        macOS .dmg + .zip (x64 + arm64)    (must run on a Mac)
#   ./build.sh all        win, plus mac when running on a Mac
set -euo pipefail
export CSC_IDENTITY_AUTO_DISCOVERY=false  # no code signing
cd "$(dirname "${BASH_SOURCE[0]}")"

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
  echo "PATH is: $PATH" >&2
  exit 1
}
echo "Using node $(node -v) from $(command -v node)"

# On Windows, npm/npx are bash scripts whose "#!/usr/bin/env bash" can resolve to the WSL
# launcher; the .cmd shims avoid that.
if [ "$HOST" = win ]; then NPM=npm.cmd; NPX=npx.cmd; else NPM=npm; NPX=npx; fi

echo "==> Installing dependencies"
"$NPM" install --no-audit --no-fund
echo "==> Running tests"
"$NPM" test

build_win() {
  echo "==> Building Windows (NSIS installer + portable)"
  "$NPX" electron-builder --win nsis portable --x64 --publish never
}

build_mac() {
  if [ "$HOST" != "mac" ]; then
    echo "!! macOS builds require running on a Mac (dmg tooling and code signing are macOS-only). Skipping." >&2
    return 1
  fi
  echo "==> Building macOS (dmg + zip, x64 + arm64)"
  "$NPX" electron-builder --mac dmg zip --x64 --arm64 --publish never
}

case "$TARGET" in
  win)  build_win ;;
  mac)  build_mac ;;
  all)  build_win; build_mac || echo "(mac build skipped; run './build.sh mac' on a Mac)" ;;
  *)    echo "Usage: $0 [win|mac|all]" >&2; exit 2 ;;
esac

echo "==> Done. Artifacts:"
ls -1 dist 2>/dev/null | grep -Ei '\.(exe|dmg|zip)$' || true
