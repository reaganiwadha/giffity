#!/usr/bin/env pwsh
# Build the giffity single binary and install it onto your PATH.
#   irm https://raw.githubusercontent.com/reaganiwadha/giffity/giffity-dev/install.ps1 | iex
# or, from a clone:  ./install.ps1
$ErrorActionPreference = 'Stop'

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host 'Installing bun...'
  Invoke-RestMethod bun.sh/install.ps1 | Invoke-Expression
  $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
}

npm install
bun run build-bun

$dest = if ($env:GIFFITY_BIN_DIR) { $env:GIFFITY_BIN_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\giffity' }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force 'dist-bin\giffity.exe' (Join-Path $dest 'giffity.exe')

Write-Host ''
Write-Host "Installed giffity -> $dest\giffity.exe"
if (($env:PATH -split ';') -notcontains $dest) {
  Write-Host "Add $dest to your PATH to use ``giffity`` directly."
}
