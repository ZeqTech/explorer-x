# Make Explorer X handle the "open" action for folders on Windows (current user only).
# explorer.exe stays your shell (taskbar, desktop, Start menu); Windows protects some
# defaults (e.g. Win+E), so not every entry point will switch.
#
#   .\set-default-windows.ps1                 set (auto-detects the installed app)
#   .\set-default-windows.ps1 -ExePath "D:\Apps\Explorer X.exe"
#   .\set-default-windows.ps1 -Undo           restore the Windows default
param(
  [string]$ExePath,
  [switch]$Undo
)

$keys = @('HKCU:\Software\Classes\Directory\shell\open', 'HKCU:\Software\Classes\Drive\shell\open')

if ($Undo) {
  foreach ($k in $keys) { Remove-Item -Path $k -Recurse -ErrorAction SilentlyContinue }
  Write-Host 'Restored the Windows default for folders.'
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

foreach ($k in $keys) {
  New-Item -Path "$k\command" -Force | Out-Null
  Set-ItemProperty -Path "$k\command" -Name '(default)' -Value "`"$ExePath`" `"%1`""
}
Write-Host "Folders now open in Explorer X ($ExePath). Undo with: .\set-default-windows.ps1 -Undo"
