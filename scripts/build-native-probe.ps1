param([string]$SdkPath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(-not $SdkPath){$SdkPath=Join-Path $projectRoot '.runtime/toolchains/streamline-sdk-v2.14.16'}
if(-not(Test-Path -LiteralPath (Join-Path $SdkPath 'include/sl.h'))){throw 'Pinned Streamline 2.14.16 SDK is required.'}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsRoot=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if(-not $vsRoot){throw 'MSVC x64 build tools are required.'}
$version=([IO.File]::ReadAllText((Join-Path $vsRoot 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt'))).Trim()
$vc=Join-Path $vsRoot ('VC/Tools/MSVC/'+$version)
$sdk=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$windowsVersion=(Get-ChildItem (Join-Path $sdk 'Include') -Directory | Where-Object {Test-Path (Join-Path $_.FullName 'um/d3d12.h')} | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1).Name
$include=Join-Path $sdk ('Include/'+$windowsVersion)
$libraries=Join-Path $sdk ('Lib/'+$windowsVersion)
$env:INCLUDE=(@((Join-Path $vc 'include'),(Join-Path $include 'ucrt'),(Join-Path $include 'shared'),(Join-Path $include 'um'),(Join-Path $include 'winrt')) -join ';')
$env:LIB=(@((Join-Path $vc 'lib/x64'),(Join-Path $libraries 'ucrt/x64'),(Join-Path $libraries 'um/x64')) -join ';')
$output=Join-Path $projectRoot '.runtime/native-probe'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$exe=Join-Path $output 'BfNativeProbe.exe'
& (Join-Path $vc 'bin/Hostx64/x64/cl.exe') /nologo /std:c++17 /O2 /EHsc /W4 /MT /DUNICODE /D_UNICODE ('/I'+(Join-Path $SdkPath 'include')) ('/Fe'+$exe) ('/Fo'+(Join-Path $output 'BfNativeProbe.obj')) (Join-Path $projectRoot 'native/render/BfNativeProbe.cpp') /link d3d12.lib dxgi.lib
if($LASTEXITCODE -ne 0){throw 'Native device probe build failed.'}
Write-Output $exe
