param()
$ErrorActionPreference='Stop'
function Get-SampleSha256([string]$file){$stream=[IO.File]::OpenRead($file);$hasher=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose();$stream.Dispose()}}
$sourceRoot=Split-Path -Parent $PSScriptRoot
$manifestFile=Join-Path $sourceRoot 'sample-resources/manifest.json'
if(-not(Test-Path -LiteralPath $manifestFile)){return}
$manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if($manifest.version -ne 2){throw 'Unsupported sample manifest'}
$sourcePrefix=[IO.Path]::GetFullPath($sourceRoot)+[IO.Path]::DirectorySeparatorChar
$packedPrefix=[IO.Path]::GetFullPath((Join-Path $sourceRoot 'sample-resources'))+[IO.Path]::DirectorySeparatorChar
$blocks=@{};foreach($block in $manifest.blocks){if($block.id -notmatch '^[a-f0-9]{64}$' -or $blocks.ContainsKey($block.id)){throw 'Invalid sample block'};$blocks[$block.id]=$block}
foreach($item in $manifest.files){
 $target=[IO.Path]::GetFullPath((Join-Path $sourceRoot $item.path))
 if(-not $target.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid sample resource path'}
 if(Test-Path -LiteralPath $target){if((Get-SampleSha256 $target) -eq $item.sha256){continue};throw ('Sample already exists with local changes; refusing overwrite: '+$item.path)}
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
 $staging=$target+'.restore-'+[Guid]::NewGuid().ToString('N')
 try{
  $outputFile=[IO.File]::Create($staging)
  try{foreach($id in $item.blocks){
   $block=$blocks[$id];if(-not $block){throw 'Missing sample block'}
   $packed=[IO.Path]::GetFullPath((Join-Path $packedPrefix $block.packed));if(-not $packed.StartsWith($packedPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid packed block path'}
   $packedFile=[IO.File]::OpenRead($packed)
   try{
    $offset=0L;$length=$packedFile.Length
    if($null -ne $block.packedOffset){$offset=[long]$block.packedOffset}
    if($null -ne $block.packedBytes){$length=[long]$block.packedBytes}
    if($offset -lt 0 -or $length -le 0 -or $length -gt 1048576 -or $offset -gt $packedFile.Length - $length){throw 'Invalid compressed block range'}
    $packedBytes=New-Object byte[] ([int]$length);$packedFile.Position=$offset;$read=0
    while($read -lt $length){$count=$packedFile.Read($packedBytes,$read,[int]($length-$read));if($count -le 0){throw 'Truncated compressed block'};$read+=$count}
   }finally{$packedFile.Dispose()}
   $hasher=[Security.Cryptography.SHA256]::Create();try{$packedHash=[BitConverter]::ToString($hasher.ComputeHash($packedBytes)).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
   if($packedHash -ne $block.packedSha256){throw 'Compressed block hash mismatch'}
   $inputFile=[IO.MemoryStream]::new($packedBytes,$false);$decoder=[IO.Compression.GZipStream]::new($inputFile,[IO.Compression.CompressionMode]::Decompress);$memory=[IO.MemoryStream]::new()
   try{$decoder.CopyTo($memory);$raw=$memory.ToArray();$hasher=[Security.Cryptography.SHA256]::Create();try{$rawHash=[BitConverter]::ToString($hasher.ComputeHash($raw)).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()};if($raw.Length -ne $block.bytes -or $rawHash -ne $id){throw 'Sample block hash mismatch'};$outputFile.Write($raw,0,$raw.Length)}finally{$memory.Dispose();$decoder.Dispose();$inputFile.Dispose()}
  }}finally{$outputFile.Dispose()}
  if((Get-Item -LiteralPath $staging).Length -ne $item.bytes -or (Get-SampleSha256 $staging) -ne $item.sha256){throw ('Sample verification failed: '+$item.path)}
  [IO.File]::Move($staging,$target)
 }finally{if(Test-Path -LiteralPath $staging){Remove-Item -LiteralPath $staging}}
}
Write-Output ('Verified sample files: '+$manifest.files.Count)
