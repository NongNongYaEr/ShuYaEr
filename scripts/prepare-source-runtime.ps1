param([string]$RuntimeSource)
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path -Parent $PSScriptRoot
if(-not $RuntimeSource){$RuntimeSource=Join-Path (Split-Path -Parent $sourceRoot) '01_精简EXE'}
$runtimeItem=Get-Item -LiteralPath (Resolve-Path -LiteralPath $RuntimeSource).Path
$portableExe=$null
if(-not $runtimeItem.PSIsContainer){$portableExe=$runtimeItem.FullName}
elseif(-not(Test-Path -LiteralPath (Join-Path $runtimeItem.FullName 'release-config.json'))){$portableExe=Join-Path $runtimeItem.FullName '树鸭儿.exe'}
if($portableExe){
 $pinFile=Join-Path $sourceRoot 'portable-runtime.json'
 if(-not(Test-Path -LiteralPath $pinFile)){throw 'A pinned portable-runtime.json is required for a single-file runtime source'}
 $pin=Get-Content -LiteralPath $pinFile -Raw -Encoding UTF8|ConvertFrom-Json
 if((Get-FileHash -LiteralPath $portableExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.exeSha256){throw 'Portable runtime EXE hash mismatch'}
 $prepared=Join-Path $sourceRoot ('.runtime/portable-bootstrap/'+$pin.exeSha256.Substring(0,16))
 $arguments='--prepare-only "'+$prepared+'"'
 $bootstrap=Start-Process -FilePath $portableExe -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
 if($bootstrap.ExitCode -ne 0){throw 'Single-file runtime preparation failed; existing user data was not overwritten'}
 $runtimeRoot=$prepared
}else{$runtimeRoot=$runtimeItem.FullName}
$wanted=Get-Content -LiteralPath (Join-Path $sourceRoot 'release-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$provided=Get-Content -LiteralPath (Join-Path $runtimeRoot 'release-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest=Get-Content -LiteralPath (Join-Path $runtimeRoot 'distribution-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($provided.version -ne $wanted.version -or $manifest.release -ne $wanted.version){throw 'Runtime/source version mismatch'}
$required=@($manifest.files|Where-Object {$_.path -match '^runtime/' -or $_.path -in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')})
if(-not($required|Where-Object {$_.path -eq 'runtime/node.exe'})){throw 'Node runtime is not listed'}
if(-not($required|Where-Object {$_.path -eq 'runtime/native/BranchForgeViewport.dll'})){throw 'DX12 runtime is not listed'}
$runtimePrefix=[IO.Path]::GetFullPath($runtimeRoot)+[IO.Path]::DirectorySeparatorChar
$sourcePrefix=[IO.Path]::GetFullPath($sourceRoot)+[IO.Path]::DirectorySeparatorChar
foreach($item in $required){
 $from=[IO.Path]::GetFullPath((Join-Path $runtimeRoot $item.path));$target=[IO.Path]::GetFullPath((Join-Path $sourceRoot $item.path))
 if(-not $from.StartsWith($runtimePrefix,[StringComparison]::OrdinalIgnoreCase) -or -not $target.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid runtime manifest path'}
 if((Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256){throw ('Runtime hash mismatch: '+$item.path)}
 if(Test-Path -LiteralPath $target){if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -eq $item.sha256){continue};throw ('Existing dependency differs; refusing overwrite: '+$item.path)}
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
 Copy-Item -LiteralPath $from -Destination $target
}
& (Join-Path $PSScriptRoot 'restore-sample-assets.ps1')
if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'Sample restoration failed'}
& (Join-Path $sourceRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'native-runtime-provenance.mjs') verify (Join-Path $sourceRoot 'runtime/native')
if($LASTEXITCODE -ne 0){throw 'Native source/runtime verification failed'}
Write-Output 'Runtime prepared. Run scripts/build-desktop.ps1 to build the desktop executable.'
