# Pinned development SDK. Production redistributables are installed only by the separate desktop packager.
param([string]$ArchivePath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$toolchains=Join-Path $projectRoot '.runtime/toolchains'
New-Item -ItemType Directory -Path $toolchains -Force | Out-Null
$url='https://github.com/NVIDIA-RTX/Streamline/releases/download/v2.14.16/streamline-sdk-v2.14.16.zip'
$expected='32041e51db0cab709a271b72a352281b690c2abbd669a827809401a5dd23956b'
if(-not $ArchivePath){$ArchivePath=Join-Path $toolchains 'streamline-sdk-v2.14.16.zip'}
if(-not(Test-Path -LiteralPath $ArchivePath)){Invoke-WebRequest -Uri $url -OutFile $ArchivePath -UseBasicParsing}
if((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Official Streamline archive SHA256 mismatch.'}
$target=[IO.Path]::GetFullPath((Join-Path $toolchains 'streamline-sdk-v2.14.16'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($ArchivePath)
try{foreach($entry in $archive.Entries){
  if($entry.FullName -notmatch '^include/[^/]+\.h$|^docs/ProgrammingGuide(DLSS|ManualHooking|API)\.md$|^(license\.txt|3rd-party-licenses\.md)$|^bin/x64/(sl\.(common|interposer|dlss|reflex|pcl)\.dll|nvngx_dlss\.dll|nvngx_dlss\.license\.txt)$'){continue}
  $dest=[IO.Path]::GetFullPath((Join-Path $target $entry.FullName))
  if(-not $dest.StartsWith($target+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid archive member path.'}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$dest,$true)
}}finally{$archive.Dispose()}
$files=@(Get-ChildItem -LiteralPath (Join-Path $target 'bin/x64') -Filter '*.dll' | ForEach-Object {
  $signature=Get-AuthenticodeSignature -LiteralPath $_.FullName
  if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=NVIDIA Corporation'){throw ('Invalid NVIDIA signature: '+$_.Name)}
  [ordered]@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();signature='Valid NVIDIA Corporation'}
})
$record=[ordered]@{version='2.14.16';source=$url;archive_sha256=$expected;distribution='production';purpose='native editor viewport, DLSS and isolated device verification';files=$files}
[IO.File]::WriteAllText((Join-Path $target 'provenance.json'),($record|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output $target
