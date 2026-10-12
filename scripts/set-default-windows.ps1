# Make Explorer X handle the "open" action for folders on Windows (current user only).
# explorer.exe stays your shell (taskbar, desktop, Start menu); Windows protects some
# defaults (e.g. Win+E), so not every entry point will switch.
#
#   .\set-default-windows.ps1                 set (auto-detects the installed app)
#   .\set-default-windows.ps1 -ExePath "D:\Apps\Explorer X.exe"
#   .\set-default-windows.ps1 -ContextMenu    only add an "Open in Explorer X" right-click entry
#                                             (folders, drives and folder backgrounds); leaves
#                                             the default folder handler alone
#   .\set-default-windows.ps1 -Undo           restore the Windows default (also removes the entry)
# On Windows 11 the entry shows under "Show more options" (Shift+F10).
param(
  [string]$ExePath,
  [switch]$Undo,
  [switch]$ContextMenu
)

$keys = @('HKCU:\Software\Classes\Directory\shell\open', 'HKCU:\Software\Classes\Drive\shell\open')
# key -> argument Explorer passes (%1 = selected item, %V = folder whose background was clicked)
$menuKeys = [ordered]@{
  'HKCU:\Software\Classes\Directory\shell\ExplorerX'            = '%1'
  'HKCU:\Software\Classes\Drive\shell\ExplorerX'                = '%1'
  'HKCU:\Software\Classes\Directory\Background\shell\ExplorerX' = '%V'
}

if ($Undo) {
  foreach ($k in $keys) { Remove-Item -Path $k -Recurse -ErrorAction SilentlyContinue }
  foreach ($k in $menuKeys.Keys) { Remove-Item -Path $k -Recurse -ErrorAction SilentlyContinue }
  Write-Host 'Restored the Windows default for folders and removed the context-menu entry.'
  return
}

if (-not $ExePath) {
  # Where the Tauri installer puts it (per-user install), then an alternate location.
  $ExePath = @("$env:LOCALAPPDATA\Explorer X\explorer-x.exe", "$env:LOCALAPPDATA\Programs\Explorer X\explorer-x.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not (Test-Path $ExePath)) {
  Write-Error "Explorer X not found at '$ExePath'. Install it first or pass -ExePath."
  return
}

if (-not $ContextMenu) {
  foreach ($k in $keys) {
    New-Item -Path "$k\command" -Force | Out-Null
    Set-ItemProperty -Path "$k\command" -Name '(default)' -Value "`"$ExePath`" `"%1`""
  }
  Write-Host "Folders now open in Explorer X ($ExePath)."
}

foreach ($k in $menuKeys.Keys) {
  New-Item -Path "$k\command" -Force | Out-Null
  Set-ItemProperty -Path $k -Name '(default)' -Value 'Open in Explorer X'
  Set-ItemProperty -Path $k -Name 'Icon' -Value "`"$ExePath`""
  Set-ItemProperty -Path "$k\command" -Name '(default)' -Value "`"$ExePath`" `"$($menuKeys[$k])`""
}
Write-Host 'Added "Open in Explorer X" to the right-click menu. Undo with: .\set-default-windows.ps1 -Undo'
