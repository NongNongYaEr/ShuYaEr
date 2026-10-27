# Build/publish the single official DX12 entry. Never terminate an editor.
param([string]$BuiltDirectory,[string]$OutputRoot,[string]$ShellPath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(-not $BuiltDirectory){$BuiltDirectory=Join-Path $projectRoot 'runtime/native'}
if(-not $OutputRoot){$OutputRoot=$projectRoot}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
$release=Get-Content -LiteralPath (Join-Path $projectRoot 'release-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$files=@('BranchForgeViewport.dll','EditorViewport.hlsl','build-provenance.json','sl.interposer.dll','sl.common.dll','sl.dlss.dll','sl.reflex.dll','sl.pcl.dll','nvngx_dlss.dll','NVIDIA-Streamline-license.txt','nvngx_dlss.license.txt','NVIDIA-third-party-licenses.md','nlohmann-json-LICENSE.MIT')
& (Join-Path $projectRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'native-runtime-provenance.mjs') verify $BuiltDirectory | Out-Null
if($LASTEXITCODE -ne 0){throw 'DX12 运行库未通过源码构建校验，停止发布；请先用当前源码重新构建。'}
foreach($name in $files){
 $source=Join-Path $BuiltDirectory $name
 if(-not(Test-Path -LiteralPath $source)){throw "Missing native runtime dependency: $name"}
 if($name -match '^(sl\.|nvngx_dlss\.dll$)' -and $name.EndsWith('.dll')){
  $signature=Get-AuthenticodeSignature -LiteralPath $source
  if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=NVIDIA Corporation'){throw "Invalid NVIDIA production signature: $name"}
 }
}
$entry=Join-Path $OutputRoot $release.entry
$alias=Join-Path $OutputRoot '树鸭儿_专业视口版.exe'
foreach($process in Get-Process){
 try{$executable=$process.Path}catch{continue}
 if($executable -and (@($entry,$alias) -contains $executable)){throw '请先保存并关闭这个目录中的树鸭儿，再更新正式入口；不会强制结束编辑器。'}
}
# A restricted build session may not enumerate desktop processes. Kernel file
# locks still protect an executable or DLL mapped by those processes.
foreach($target in @($entry,$alias)+@($files | Where-Object {$_ -like '*.dll'} | ForEach-Object {Join-Path $OutputRoot ('runtime/native/'+$_)})){
 if(-not(Test-Path -LiteralPath $target)){continue}
 try{$access=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$access.Dispose()}
 catch{throw ('程序文件仍在使用或不可写，请保存并完全退出使用此目录的树鸭儿后再更新；不会强制结束编辑器。文件：'+$target)}
}
if(-not $ShellPath){
 $stage=Join-Path $projectRoot ('.runtime/desktop-build/'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $stage -Force | Out-Null
 $ShellPath=Join-Path $stage $release.entry
 & (Join-Path $PSScriptRoot 'build-desktop.ps1') -OutputPath $ShellPath
}
if((Get-Item -LiteralPath $ShellPath).VersionInfo.FileVersion -ne ($release.version+'.0')){throw 'Desktop version mismatch'}
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$nativeRuntime=Join-Path $OutputRoot 'runtime/native'
New-Item -ItemType Directory -Path $nativeRuntime -Force | Out-Null
$changes=@()
foreach($name in $files){$changes+=@{source=(Join-Path $BuiltDirectory $name);relative=('runtime/native/'+$name)}}
$changes+=@{source=$ShellPath;relative=$release.entry}
if(Test-Path -LiteralPath $alias){$changes+=@{source=$ShellPath;relative='树鸭儿_专业视口版.exe'}}
$archive=Join-Path $OutputRoot ('归档/桌面入口/'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
$replaced=@();$planned=@()
foreach($item in $changes){
 $destination=Join-Path $OutputRoot $item.relative
 $before=if(Test-Path -LiteralPath $destination){(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()}else{''}
 $after=(Get-FileHash -LiteralPath $item.source -Algorithm SHA256).Hash.ToLowerInvariant()
 if($before -eq $after){continue}
 if($before){$backup=Join-Path $archive $item.relative;New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null;Copy-Item -LiteralPath $destination -Destination $backup; $replaced+=@{path=$item.relative;sha256=$before}}
 $planned+=@{source=$item.source;destination=$destination;before=$before}
}
if($replaced.Count){
 $oldManifest=Join-Path $nativeRuntime 'manifest.json'
 if(Test-Path -LiteralPath $oldManifest){Copy-Item -LiteralPath $oldManifest -Destination (Join-Path $archive 'native-manifest-before.json')}
 [IO.File]::WriteAllText((Join-Path $archive 'rollback.json'),(@{created=(Get-Date).ToString('o');files=$replaced}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
}
foreach($item in $planned){
 $destination=$item.destination;$before=$item.before;
 $temporary=$destination+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 Copy-Item -LiteralPath $item.source -Destination $temporary
 try{if($before){[IO.File]::Replace($temporary,$destination,[NullString]::Value)}else{[IO.File]::Move($temporary,$destination)}}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}

$manifest=[ordered]@{version=2;product_version=$release.version;channel=$release.channel;viewport_abi=$release.viewport_abi;streamline='2.14.16';ota_enabled=$false;main_viewport='DX12';failure_policy='retain-document-and-retry';entry=$release.entry;entry_sha256=(Get-FileHash -LiteralPath $entry -Algorithm SHA256).Hash.ToLowerInvariant();files=@($files|ForEach-Object{[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $nativeRuntime $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})}
[IO.File]::WriteAllText((Join-Path $nativeRuntime 'manifest.json'),($manifest|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output ([ordered]@{entry=$entry;version=$release.version;sha256=$manifest.entry_sha256;archive=if($replaced.Count){$archive}else{$null}}|ConvertTo-Json)
