$ErrorActionPreference = 'Stop'
$taskVsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$taskVsRoot = (& $taskVsWhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if (-not $taskVsRoot) { throw 'MSVC x64 build tools are required.' }
$taskVcVersion = [IO.File]::ReadAllText((Join-Path $taskVsRoot 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt')).Trim()
$taskVc = Join-Path $taskVsRoot ('VC/Tools/MSVC/' + $taskVcVersion)
$taskSdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$taskSdkVersion = (Get-ChildItem -LiteralPath (Join-Path $taskSdk 'Include') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'um/d3d12.h') } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
$taskInclude = Join-Path $taskSdk ('Include/' + $taskSdkVersion)
$taskLib = Join-Path $taskSdk ('Lib/' + $taskSdkVersion)
$env:INCLUDE = @((Join-Path $taskVc 'include'),(Join-Path $taskInclude 'ucrt'),(Join-Path $taskInclude 'shared'),(Join-Path $taskInclude 'um'),(Join-Path $taskInclude 'winrt')) -join ';'
$env:LIB = @((Join-Path $taskVc 'lib/x64'),(Join-Path $taskLib 'ucrt/x64'),(Join-Path $taskLib 'um/x64')) -join ';'
$taskCl = Join-Path $taskVc 'bin/Hostx64/x64/cl.exe'
