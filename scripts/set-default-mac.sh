#!/usr/bin/env bash
# Make Explorer X the app that opens folders on macOS (Finder stays the system shell).
#   ./scripts/set-default-mac.sh           set Explorer X as the folder handler
#   ./scripts/set-default-mac.sh undo      hand folders back to Finder
#
# Three mechanisms are used:
#   - A Finder Quick Action ("Open in Explorer X" in the right-click menu of folders), installed
#     to ~/Library/Services. This is the reliable one on recent macOS.
#   - NSFileViewer: the global "file viewer" default that apps consult for "Reveal in Finder"
#     and folder opens. Always works; takes effect after log out / log in.
#   - duti (LaunchServices public.folder handler): recent macOS releases reject this with
#     error -50 even for Finder, so a failure here is reported but not fatal.
set -uo pipefail

[ "$(uname -s)" = Darwin ] || { echo "This script is for macOS." >&2; exit 1; }

APP_ID="com.explorerx.desktop"
WORKFLOW="$HOME/Library/Services/Open in Explorer X.workflow"
if [ "${1:-}" = undo ]; then
  defaults delete -g NSFileViewer 2>/dev/null || true
  rm -rf "$WORKFLOW"
  if command -v duti >/dev/null; then duti -s com.apple.finder public.folder all 2>/dev/null || true; fi
  echo "Folders now open in Finder (log out and back in to apply everywhere)."
  exit 0
fi

[ -d "/Applications/Explorer X.app" ] || echo "Note: install Explorer X.app into /Applications first (open the .dmg and drag it in)." >&2

install_quick_action() {
  mkdir -p "$WORKFLOW/Contents"
  cat > "$WORKFLOW/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict><key>default</key><string>Open in Explorer X</string></dict>
      <key>NSMessage</key><string>runWorkflowAsService</string>
      <key>NSRequiredContext</key>
      <dict><key>NSApplicationIdentifier</key><string>com.apple.finder</string></dict>
      <key>NSSendFileTypes</key>
      <array><string>public.folder</string></array>
    </dict>
  </array>
</dict>
</plist>
PLIST
  cat > "$WORKFLOW/Contents/document.wflow" <<'WFLOW'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key><string>523</string>
  <key>AMApplicationVersion</key><string>2.10</string>
  <key>AMDocumentVersion</key><string>2</string>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>AMAccepts</key>
        <dict>
          <key>Container</key><string>List</string>
          <key>Optional</key><true/>
          <key>Types</key><array><string>com.apple.cocoa.string</string></array>
        </dict>
        <key>AMActionVersion</key><string>2.0.3</string>
        <key>AMApplication</key><array><string>Automator</string></array>
        <key>AMParameterProperties</key>
        <dict>
          <key>COMMAND_STRING</key><dict/>
          <key>CheckedForUserDefaultShell</key><dict/>
          <key>inputMethod</key><dict/>
          <key>shell</key><dict/>
          <key>source</key><dict/>
        </dict>
        <key>AMProvides</key>
        <dict>
          <key>Container</key><string>List</string>
          <key>Types</key><array><string>com.apple.cocoa.string</string></array>
        </dict>
        <key>ActionBundlePath</key><string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key><string>Run Shell Script</string>
        <key>ActionParameters</key>
        <dict>
          <key>COMMAND_STRING</key>
          <string>for f in "$@"; do open -b com.explorerx.desktop "$f"; done</string>
          <key>CheckedForUserDefaultShell</key><true/>
          <key>inputMethod</key><integer>1</integer>
          <key>shell</key><string>/bin/bash</string>
          <key>source</key><string></string>
        </dict>
        <key>BundleIdentifier</key><string>com.apple.RunShellScript</string>
        <key>CFBundleVersion</key><string>2.0.3</string>
        <key>CanShowSelectedItemsWhenRun</key><false/>
        <key>CanShowWhenRun</key><true/>
        <key>Category</key><array><string>AMCategoryUtilities</string></array>
        <key>Class Name</key><string>RunShellScriptAction</string>
        <key>InputUUID</key><string>7B1C0B7A-5C1D-4F0E-9E57-0A1B2C3D4E01</string>
        <key>Keywords</key><array><string>Shell</string><string>Script</string></array>
        <key>OutputUUID</key><string>7B1C0B7A-5C1D-4F0E-9E57-0A1B2C3D4E02</string>
        <key>UUID</key><string>7B1C0B7A-5C1D-4F0E-9E57-0A1B2C3D4E03</string>
        <key>UnlocalizedApplications</key><array><string>Automator</string></array>
        <key>arguments</key><dict/>
        <key>isViewVisible</key><integer>1</integer>
        <key>location</key><string>309.000000:253.000000</string>
        <key>nibPath</key><string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
      </dict>
      <key>isViewVisible</key><integer>1</integer>
    </dict>
  </array>
  <key>connectors</key><dict/>
  <key>workflowMetaData</key>
  <dict>
    <key>applicationBundleIDsByPath</key><dict/>
    <key>applicationPaths</key><array/>
    <key>inputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject.folder</string>
    <key>outputTypeIdentifier</key><string>com.apple.Automator.nothing</string>
    <key>presentationMode</key><integer>15</integer>
    <key>processesInput</key><false/>
    <key>serviceApplicationBundleID</key><string>com.apple.finder</string>
    <key>serviceApplicationPath</key><string>/System/Library/CoreServices/Finder.app</string>
    <key>serviceInputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject.folder</string>
    <key>serviceOutputTypeIdentifier</key><string>com.apple.Automator.nothing</string>
    <key>serviceProcessesInput</key><false/>
    <key>systemImageName</key><string>NSActionTemplate</string>
    <key>useAutomaticInputType</key><false/>
    <key>workflowTypeIdentifier</key><string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
WFLOW
  plutil -lint "$WORKFLOW/Contents/Info.plist" "$WORKFLOW/Contents/document.wflow" >/dev/null \
    || { echo "Quick Action files are invalid." >&2; return 1; }
  /System/Library/CoreServices/pbs -flush >/dev/null 2>&1 || true
  echo "Installed Quick Action: right-click a folder in Finder > Quick Actions > Open in Explorer X."
}
install_quick_action || true

defaults write -g NSFileViewer -string "$APP_ID" || { echo "Could not set NSFileViewer." >&2; exit 1; }
echo "Set NSFileViewer to $APP_ID."

if command -v duti >/dev/null; then
  duti -s "$APP_ID" public.folder all 2>/dev/null \
    || echo "Note: macOS refused the public.folder handler change (error -50); relying on NSFileViewer." >&2
else
  echo "Note: 'brew install duti' lets the script also try the public.folder handler." >&2
fi

echo "Folders will open in Explorer X after you log out and back in. Undo with: $0 undo"
