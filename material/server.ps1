# V040-style local service entry. Tree material CPU jobs stay in the bundled
# Node worker/service module; the desktop owns this complete process tree.
param([int]$Port = 0,[Parameter(Mandatory=$true)][string]$OwnerToken)
$ErrorActionPreference = 'Stop'
if ($Port -lt 0 -or $Port -gt 65535 -or $OwnerToken -notmatch '^[0-9a-f]{32}$') { throw 'Invalid local service arguments.' }
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
& (Join-Path $PSScriptRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'server.mjs') --port $Port --owner-token $OwnerToken
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
