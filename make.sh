#!/usr/bin/env bash
# Usage:
#   ./make.sh                     build for the current OS
#   ./make.sh win                 Windows installer + portable .exe  (output in dist/)
#   ./make.sh mac                 macOS .dmg (x64 + arm64)           (must run on a Mac)
#   ./make.sh all                 win, plus mac when running on a Mac
#   ./make.sh [target] --bump L   bump the version first (L = patch | minor | major | X.Y.Z), then build
#   ./make.sh bump L              bump the version and add its notes to the top of CHANGELOG.md
#                                 (created if missing), no build
#   ./make.sh changelog [opts]    preview the commits since the last release tag (saves nothing)
#                                 (opts: --version X.Y.Z, --from TAG, --to REF, --write)
cd "$(dirname "${BASH_SOURCE[0]:-$0}")" || exit 1

# Re-use the shell already running this script rather than resolving "bash" via PATH,
# which on Windows can pick the WSL launcher (C:\Windows\system32\bash.exe).
SHELL_BIN="${BASH:-sh}"

# Skip tests for local builds by default; run `SKIP_TESTS=0 ./make.sh` to include them.
export SKIP_TESTS="${SKIP_TESTS:-1}"

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" >&2; exit 2; }

# Sets the version everywhere (package.json, Cargo.toml, tauri.conf.json) and records the commits
# since the last tag in CHANGELOG.md. Nothing is committed or tagged; see docs/RELEASING.md.
bump() {
  [ -n "$1" ] || { echo "bump needs patch | minor | major | X.Y.Z" >&2; exit 2; }
  new=$(node scripts/set-version.js "$1" | sed -n 's/^version //p') || exit 1
  [ -n "$new" ] || exit 1
  node scripts/changelog.js --version "$new" --write >/dev/null || exit 1
  echo "Version is now $new and CHANGELOG.md has its notes."
  echo "Review, commit, then tag the commit:  git tag v$new && git push origin v$new"
}

# Pull "--bump L" out of the arguments wherever it appears.
args=(); level=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bump) level="$2"; shift 2 || usage ;;
    *)      args+=("$1"); shift ;;
  esac
done
set -- "${args[@]}"

case "$1" in
  bump)      bump "$2"; exit ;;
  changelog) shift; exec node scripts/changelog.js "$@" ;;
esac

[ -n "$level" ] && { bump "$level" || exit 1; }

case "$1" in
    win|mac|all) exec "$SHELL_BIN" ./build.sh "$1" ;;
    "")          exec "$SHELL_BIN" ./build.sh ;;
    *)           usage ;;
esac
