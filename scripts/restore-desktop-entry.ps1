# Restore only the explicitly recorded desktop/runtime files, never projects.
param([Parameter(Mandatory=$true)][string]$Archive)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$archivePath=[IO.Path]::GetFullPath($Archive)
$boundary=[IO.Path]::GetFullPath((Join-Path $root '归档/桌面入口'))+[IO.Path]::DirectorySeparatorChar
if(-not $archivePath.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive must stay inside this workspace desktop archives.'}
$record=Get-Content -LiteralPath (Join-Path $archivePath 'rollback.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($process in Get-Process){try{$executable=$process.Path}catch{continue};if($executable -and @((Join-Path $root '树鸭儿.exe'),(Join-Path $root '树鸭儿_专业视口版.exe')) -contains $executable){throw 'Save and close this editor before restoring its desktop files.'}}
foreach($item in $record.files){
 if($item.path -notmatch '^(树鸭儿(?:_专业视口版)?\.exe|runtime/native/[^/\\]+)$'){throw 'Invalid rollback file'}
 $backup=Join-Path $archivePath $item.path
 if((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256){throw 'Rollback checksum mismatch'}
}
$saved=Join-Path $root ('归档/桌面入口/恢复前-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
foreach($item in $record.files){
 $target=Join-Path $root $item.path;$current=Join-Path $saved $item.path
 if(Test-Path -LiteralPath $target){New-Item -ItemType Directory -Path (Split-Path -Parent $current) -Force | Out-Null;Copy-Item -LiteralPath $target -Destination $current}
 Copy-Item -LiteralPath (Join-Path $archivePath $item.path) -Destination $target -Force
}
$manifest=Join-Path $archivePath 'native-manifest-before.json'
if(Test-Path -LiteralPath $manifest){Copy-Item -LiteralPath $manifest -Destination (Join-Path $root 'runtime/native/manifest.json') -Force}
Write-Output 'Desktop rollback completed; project files and libraries were not changed.'
