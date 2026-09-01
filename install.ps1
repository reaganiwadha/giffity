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
bun run install-local
