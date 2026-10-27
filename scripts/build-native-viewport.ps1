param([string]$SdkPath,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(-not $SdkPath){$SdkPath=Join-Path $projectRoot '.runtime/toolchains/streamline-sdk-v2.14.16'}
if(-not $OutputDirectory){$OutputDirectory=Join-Path $projectRoot '.runtime/native-editor'}
if(-not(Test-Path -LiteralPath (Join-Path $SdkPath 'include/sl.h'))){throw 'Run prepare-native-sdk.ps1 first.'}
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
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
& (Join-Path $vc 'bin/Hostx64/x64/cl.exe') /nologo /std:c++17 /O2 /EHsc /W4 /MT /LD /DUNICODE /D_UNICODE ('/I'+(Join-Path $SdkPath 'include')) ('/I'+(Join-Path $projectRoot 'native/vendor')) ('/Fe'+(Join-Path $OutputDirectory 'BranchForgeViewport.dll')) ('/Fo'+(Join-Path $OutputDirectory 'EditorViewport.obj')) (Join-Path $projectRoot 'native/render/EditorViewport.cpp') /link d3d12.lib dxgi.lib d3dcompiler.lib windowscodecs.lib ole32.lib user32.lib
if($LASTEXITCODE -ne 0){throw 'Native editor viewport build failed.'}
& (Join-Path $vc 'bin/Hostx64/x64/cl.exe') /nologo /std:c++17 /O2 /EHsc /W4 /MT /DUNICODE /D_UNICODE ('/Fe'+(Join-Path $OutputDirectory 'BfViewportVerify.exe')) ('/Fo'+(Join-Path $OutputDirectory 'ViewportVerify.obj')) (Join-Path $projectRoot 'native/render/ViewportVerify.cpp') /link user32.lib
if($LASTEXITCODE -ne 0){throw 'Off-desktop viewport verification runner build failed.'}
& (Join-Path $vc 'bin/Hostx64/x64/cl.exe') /nologo /std:c++17 /O2 /EHsc /W4 /MT /DUNICODE /D_UNICODE ('/I'+(Join-Path $projectRoot 'native/vendor')) ('/Fe'+(Join-Path $OutputDirectory 'BfViewportSequenceVerify.exe')) ('/Fo'+(Join-Path $OutputDirectory 'ViewportSequenceVerify.obj')) (Join-Path $projectRoot 'native/render/ViewportSequenceVerify.cpp') /link user32.lib
if($LASTEXITCODE -ne 0){throw 'Off-desktop viewport sequence runner build failed.'}
Copy-Item -LiteralPath (Join-Path $projectRoot 'native/render/EditorViewport.hlsl') -Destination $OutputDirectory -Force
foreach($name in @('sl.interposer.dll','sl.common.dll','sl.dlss.dll','sl.reflex.dll','sl.pcl.dll','nvngx_dlss.dll')){
 $source=Join-Path $SdkPath ('bin/x64/'+$name)
 if((Get-AuthenticodeSignature -LiteralPath $source).Status -ne 'Valid'){throw "Invalid NVIDIA signature: $name"}
 Copy-Item -LiteralPath $source -Destination $OutputDirectory -Force
}
Copy-Item -LiteralPath (Join-Path $SdkPath 'license.txt') -Destination (Join-Path $OutputDirectory 'NVIDIA-Streamline-license.txt') -Force
Copy-Item -LiteralPath (Join-Path $SdkPath 'bin/x64/nvngx_dlss.license.txt') -Destination $OutputDirectory -Force
Copy-Item -LiteralPath (Join-Path $SdkPath '3rd-party-licenses.md') -Destination (Join-Path $OutputDirectory 'NVIDIA-third-party-licenses.md') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'native/vendor/nlohmann/LICENSE.MIT') -Destination (Join-Path $OutputDirectory 'nlohmann-json-LICENSE.MIT') -Force
& (Join-Path $projectRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'native-runtime-provenance.mjs') create $OutputDirectory $version $windowsVersion | Out-Null
if($LASTEXITCODE -ne 0){throw 'Native source/build verification failed.'}
Write-Output (Join-Path $OutputDirectory 'BranchForgeViewport.dll')
