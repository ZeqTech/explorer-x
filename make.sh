#!/usr/bin/env bash
# Usage:
#   ./make.sh            build for the current OS
#   ./make.sh win        Windows installer + portable .exe  (output in dist/)
#   ./make.sh mac        macOS .dmg + .zip (x64 + arm64)    (must run on a Mac)
#   ./make.sh all        win, plus mac when running on a Mac
cd "$(dirname "${BASH_SOURCE[0]:-$0}")" || exit 1

# Re-use the shell already running this script rather than resolving "bash" via PATH,
# which on Windows can pick the WSL launcher (C:\Windows\system32\bash.exe).
SHELL_BIN="${BASH:-sh}"

# Skip tests for local builds by default; run `SKIP_TESTS=0 ./make.sh` to include them.
export SKIP_TESTS="${SKIP_TESTS:-1}"
case "$1" in
    win|mac|all) exec "$SHELL_BIN" ./build.sh "$1" ;;
    "")          exec "$SHELL_BIN" ./build.sh ;;
    *)           echo "Usage: $0 [win|mac|all]" >&2; exit 2 ;;
esac
