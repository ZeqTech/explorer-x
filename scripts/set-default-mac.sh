#!/usr/bin/env bash
# Make Explorer X the app that opens folders on macOS (Finder stays the system shell).
#   ./scripts/set-default-mac.sh           set Explorer X as the folder handler
#   ./scripts/set-default-mac.sh undo      hand folders back to Finder
set -euo pipefail

[ "$(uname -s)" = Darwin ] || { echo "This script is for macOS." >&2; exit 1; }
command -v duti >/dev/null || { echo "duti is required:  brew install duti" >&2; exit 1; }

APP_ID="com.explorerx.app"
if [ "${1:-}" = undo ]; then
  duti -s com.apple.finder public.folder all
  echo "Folders now open in Finder."
else
  [ -d "/Applications/Explorer X.app" ] || echo "Note: install Explorer X.app into /Applications first (open the .dmg and drag it in)." >&2
  duti -s "$APP_ID" public.folder all
  echo "Folders now open in Explorer X. Undo with: $0 undo"
fi
