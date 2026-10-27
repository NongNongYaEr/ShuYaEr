# Derived images are separate from saved geometry/materials and keyed by content.
$script:PlantUnitThumbnailVersion=2
$script:PlantUnitThumbnailHashes=@{}
$script:PlantUnitThumbnailSeedStamp=''
$script:PlantUnitThumbnailSeeds=@{}
$script:PlantUnitThumbnailPackageStamp=''
$script:PlantUnitThumbnailPackages=@{}
function Get-PlantUnitThumbnailSource([string]$Id) {
    if($Id -cmatch '^PACK_[a-f0-9]{64}$') {
        $catalogFile=Join-Path $script:PlantPackRoot 'catalog.json'
        if(-not(Test-Path -LiteralPath $catalogFile)){return $null}
        $info=Get-Item -LiteralPath $catalogFile;$stamp=$catalogFile+':'+[string]$info.LastWriteTimeUtc.Ticks+':'+[string]$info.Length
        if($stamp -ne $script:PlantUnitThumbnailPackageStamp){$catalog=Get-Content -LiteralPath $catalogFile -Raw -Encoding UTF8|ConvertFrom-Json;$script:PlantUnitThumbnailPackages=@{};foreach($item in $catalog.assets){if($item.type -eq 'units'){$script:PlantUnitThumbnailPackages[[string]$item.id]=$item}};$script:PlantUnitThumbnailPackageStamp=$stamp}
        $asset=$script:PlantUnitThumbnailPackages[$Id]
        if(-not $asset -or [string]$asset.root -cnotmatch '^[a-f0-9]{64}$'){return $null}
        return @{sourceKey=('package:'+[string]$asset.root)}
    }
    $file=Get-PlantUnitPath $Id
    if(-not(Test-Path -LiteralPath $file -PathType Leaf)){return $null}
    $info=Get-Item -LiteralPath $file;$stamp=[string]$info.LastWriteTimeUtc.Ticks+':'+[string]$info.Length
    $cached=$script:PlantUnitThumbnailHashes[$file]
    if(-not $cached -or $cached.stamp -ne $stamp){$stream=[IO.File]::OpenRead($file);$sha=[Security.Cryptography.SHA256]::Create();try{$hash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose();$stream.Dispose()};$cached=@{stamp=$stamp;hash=$hash};$script:PlantUnitThumbnailHashes[$file]=$cached}
    return @{sourceKey=('file:'+$cached.hash)}
}
function Get-PlantUnitThumbnailCachePath([string]$SourceKey) {
    if($SourceKey -cnotmatch '^(file|package):[a-f0-9]{64}$'){throw '叶花果预览来源无效'}
    return Join-Path (Join-Path $script:ConfigDir 'plant-unit-thumbnails') ('v'+$script:PlantUnitThumbnailVersion+'-'+$SourceKey.Replace(':','-')+'.json')
}
function Read-PlantUnitThumbnail([string]$SourceKey) {
    if(-not $SourceKey){return ''}
    $file=Get-PlantUnitThumbnailCachePath $SourceKey
    if(Test-Path -LiteralPath $file){try{$data=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;if($data.version -eq $script:PlantUnitThumbnailVersion -and $data.sourceKey -ceq $SourceKey){return [string]$data.thumbnail}}catch{}}
    $seedDir=Join-Path $script:AppDir 'web/assets/plant-unit-thumbnails';$indexFile=Join-Path $seedDir 'catalog.json'
    if(-not(Test-Path -LiteralPath $indexFile)){return ''}
    $stamp=[string](Get-Item -LiteralPath $indexFile).LastWriteTimeUtc.Ticks
    if($stamp -ne $script:PlantUnitThumbnailSeedStamp){$index=Get-Content -LiteralPath $indexFile -Raw -Encoding UTF8|ConvertFrom-Json;$script:PlantUnitThumbnailSeeds=@{};if($index.version -eq $script:PlantUnitThumbnailVersion){foreach($item in $index.items){$script:PlantUnitThumbnailSeeds[[string]$item.sourceKey]=$item}};$script:PlantUnitThumbnailSeedStamp=$stamp}
    $item=$script:PlantUnitThumbnailSeeds[$SourceKey]
    if($item -and [string]$item.file -cmatch '^[a-f0-9]{64}\.png$'){$image=Join-Path $seedDir ([string]$item.file);if(Test-Path -LiteralPath $image){return 'data:image/png;base64,'+[Convert]::ToBase64String([IO.File]::ReadAllBytes($image))}}
    return ''
}
function Add-PlantUnitThumbnailToSummary($Summary) {
    try{$source=Get-PlantUnitThumbnailSource ([string]$Summary.id)
    if($source){$Summary|Add-Member -MemberType NoteProperty -Name previewSourceKey -Value $source.sourceKey -Force;$thumbnail=Read-PlantUnitThumbnail $source.sourceKey;$Summary|Add-Member -MemberType NoteProperty -Name thumbnail -Value ([string]$thumbnail) -Force;$Summary|Add-Member -MemberType NoteProperty -Name thumbnailVersion -Value $script:PlantUnitThumbnailVersion -Force}}catch{Write-ServerLog ('叶花果预览暂不可用：'+[string]$Summary.id+' '+$_.Exception.Message)}
    return $Summary
}
function Invoke-PlantUnitThumbnailRoute($Context,[string]$Path) {
    if($Path -ne '/api/plant-unit-thumbnail'){return $false}
    if($Context.Request.HttpMethod -eq 'GET'){$id=[string]$Context.Request.QueryString['id'];$source=Get-PlantUnitThumbnailSource $id;if(-not $source){Send-Json $Context @{success=$false;message='叶花果素材不存在'} 404;return $true};Send-Json $Context @{success=$true;sourceKey=$source.sourceKey;thumbnail=(Read-PlantUnitThumbnail $source.sourceKey)};return $true}
    if($Context.Request.HttpMethod -ne 'POST'){throw '请求方法无效'}
    if($Context.Request.ContentLength64 -gt 1600000){throw '叶花果预览过大'}
    $body=Read-RequestJson $Context.Request;$source=Get-PlantUnitThumbnailSource ([string]$body.id)
    if(-not $source -or $source.sourceKey -cne [string]$body.sourceKey){Send-Json $Context @{success=$false;message='素材已有更新，请重新生成预览'} 409;return $true}
    $thumbnail=[string]$body.thumbnail
    if($thumbnail.Length -gt 1500000 -or $thumbnail -notmatch '^data:image/png;base64,([A-Za-z0-9+/=]+)$'){throw '叶花果预览格式无效'}
    $bytes=[Convert]::FromBase64String($Matches[1]);$stream=[IO.MemoryStream]::new($bytes,$false);$image=$null
    try{$image=[Drawing.Image]::FromStream($stream);if($image.Width -ne 512 -or $image.Height -ne 384){throw '叶花果预览尺寸无效'}}finally{if($image){$image.Dispose()};$stream.Dispose()}
    $cache=@{version=$script:PlantUnitThumbnailVersion;sourceKey=$source.sourceKey;thumbnail=$thumbnail}
    Write-AtomicBytes (Get-PlantUnitThumbnailCachePath $source.sourceKey) ([Text.Encoding]::UTF8.GetBytes(($cache|ConvertTo-Json -Compress)))|Out-Null
    Send-Json $Context @{success=$true;sourceKey=$source.sourceKey;thumbnail=$thumbnail};return $true
}
