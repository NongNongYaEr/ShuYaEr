param()
$ErrorActionPreference='Stop'
$materialBuildRoot=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'material-native-toolchain.ps1')
$materialBuildOut=Join-Path $materialBuildRoot '.runtime/material-native-build'
[IO.Directory]::CreateDirectory($materialBuildOut)|Out-Null
$materialBuildSource=Join-Path $materialBuildRoot 'native/material/TreeMaterialDX12.cpp'
& $taskCl /nologo /std:c++17 /O2 /EHsc /W4 /MT /LD /DUNICODE /D_UNICODE ('/I'+(Join-Path $materialBuildRoot 'native/vendor')) ('/Fe'+(Join-Path $materialBuildOut 'TreeMaterialDX12.dll')) ('/Fo'+(Join-Path $materialBuildOut 'TreeMaterialDX12.obj')) $materialBuildSource /link d3d12.lib dxgi.lib d3dcompiler.lib windowscodecs.lib ole32.lib user32.lib
if($LASTEXITCODE -ne 0){throw 'Material DX12 build failed'}
[pscustomobject]@{passed=$true;installed=$false;sourceSHA256=(Get-FileHash -LiteralPath $materialBuildSource -Algorithm SHA256).Hash.ToLowerInvariant();dll=(Join-Path $materialBuildOut 'TreeMaterialDX12.dll');sha256=(Get-FileHash -LiteralPath (Join-Path $materialBuildOut 'TreeMaterialDX12.dll') -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $materialBuildOut 'build.json') -Encoding UTF8
Get-Content -LiteralPath (Join-Path $materialBuildOut 'build.json') -Raw
