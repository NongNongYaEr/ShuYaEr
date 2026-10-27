# User recipes and organizational metadata are separate from formal plant assets.
$script:CreativeMetadataDir = Join-Path $script:ConfigDir 'creative-library'
$script:TreeRecipeDir = Join-Path $script:AppDir 'assets/tree-recipe-library'
if ($env:BRANCHFORGE_SESSION_TEST_DIR) {
    $script:CreativeMetadataDir = Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'creative-library'
    $script:TreeRecipeDir = Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'tree-recipes'
}
function Get-RecipeFile([string]$Id,[string]$Suffix) {
    if($Id -notmatch '^recipe-[a-f0-9]{32}$'){throw '配方 ID 无效'}
    return Join-Path $script:TreeRecipeDir ($Id+$Suffix)
}
function Get-TreeRecipes {
    if(-not(Test-Path -LiteralPath $script:TreeRecipeDir)){return @()}
    return @(Get-ChildItem -LiteralPath $script:TreeRecipeDir -Filter '*.meta.json' -File | ForEach-Object {
        try{Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json}catch{}
    } | Sort-Object updatedAt -Descending)
}
function Get-AssetProjectReferences([string]$Id) {
    $items=@((Get-ProjectCatalog).items)
    if(Test-Path -LiteralPath $script:TreeTemplateDir){$items+=@(Get-ChildItem -LiteralPath $script:TreeTemplateDir -Filter '*.meta.json' -File | ForEach-Object {try{Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json}catch{}})}
    $manifest=@{items=@();errors=@()};$paths=@{}
    foreach($item in $items){try{
        $file=Resolve-ProjectLibraryFile $item.path
        if($paths.ContainsKey($file)){continue};$paths[$file]=$true
        $manifest.items+=@{id=$item.id;name=$item.name;version=$item.version;path=$item.path;file=$file}
    }catch{$manifest.errors+=@{name=$item.name;message=$_.Exception.Message}}}
    foreach($item in @(Get-TreeRecipes)){$manifest.items+=@{id=$item.id;name=$item.name;kind='配方';file=(Get-RecipeFile $item.id '.branch.json')}}
    $manifestFile=Join-Path $script:CreativeMetadataDir ('refs-'+[Guid]::NewGuid().ToString('N')+'.json')
    Write-AtomicBytes $manifestFile ([Text.Encoding]::UTF8.GetBytes(($manifest | ConvertTo-Json -Depth 8 -Compress))) | Out-Null
    $process=$null
    try{
        $info=New-Object Diagnostics.ProcessStartInfo
        $info.FileName=Join-Path $script:AppDir 'runtime/node.exe'
        $worker=Join-Path $script:AppDir 'scripts/inspect-asset-references.mjs'
        $info.Arguments='"'+$worker+'" "'+$manifestFile+'" "'+$Id+'"'
        $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
        $info.StandardOutputEncoding=[Text.Encoding]::UTF8;$info.StandardErrorEncoding=[Text.Encoding]::UTF8
        $process=[Diagnostics.Process]::Start($info)
        $result=$process.StandardOutput.ReadToEnd();$errorText=$process.StandardError.ReadToEnd();$process.WaitForExit()
        if($process.ExitCode -ne 0){throw ('引用检查失败：'+$errorText)}
        return ($result | ConvertFrom-Json)
    }finally{if($process){$process.Dispose()};if(Test-Path -LiteralPath $manifestFile){Remove-Item -LiteralPath $manifestFile -Force}}
}
function Invoke-CreativeLibraryRoute($Context,[string]$Path) {
    $method=$Context.Request.HttpMethod
    if($Path -eq '/api/asset-organizer'){
        $file=Join-Path $script:CreativeMetadataDir 'asset-organizer.json';$items=@{}
        if(Test-Path -LiteralPath $file){$saved=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json;foreach($prop in $saved.items.psobject.Properties){$items[$prop.Name]=$prop.Value}}
        if($method -eq 'GET'){Send-Json $Context @{items=$items};return $true}
        if($method -ne 'POST'){throw '不支持的素材管理请求'}
        $body=Read-RequestJson $Context.Request;$id=[string]$body.id
        if(-not $id -or $id.Length -gt 160 -or $id -notmatch '^[a-zA-Z0-9_.-]+$'){throw '素材 ID 无效'}
        $tags=@($body.tags | Select-Object -First 12 | ForEach-Object {$tag=([string]$_).Trim();if($tag.Length -gt 24){$tag=$tag.Substring(0,24)};if($tag){$tag}} | Sort-Object -Unique)
        $items[$id]=@{favorite=[bool]$body.favorite;tags=$tags;lastUsed=[Math]::Max(0,[long]$body.lastUsed)}
        Write-AtomicBytes $file ([Text.Encoding]::UTF8.GetBytes((@{items=$items} | ConvertTo-Json -Depth 8 -Compress))) | Out-Null
        Send-Json $Context @{success=$true;item=$items[$id]};return $true
    }
    if($Path -eq '/api/asset-dependencies' -and $method -eq 'GET'){
        $id=[string]$Context.Request.QueryString['id'];if(-not $id -or $id -notmatch '^[a-zA-Z0-9_.-]{1,160}$'){throw '素材 ID 无效'}
        Send-Json $Context (Get-AssetProjectReferences $id);return $true
    }
    if($Path -eq '/api/tree-recipes' -and $method -eq 'GET'){Send-Json $Context @{items=@(Get-TreeRecipes)};return $true}
    if($Path -ne '/api/tree-recipe'){return $false}
    if($method -eq 'GET'){$file=Get-RecipeFile ([string]$Context.Request.QueryString['id']) '.branch.json';if(-not(Test-Path -LiteralPath $file)){throw '配方已不存在'};Send-File $Context $file;return $true}
    if($method -eq 'DELETE'){$id=[string]$Context.Request.QueryString['id'];foreach($suffix in @('.branch.json','.meta.json')){$file=Get-RecipeFile $id $suffix;if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}};Send-Json $Context @{success=$true};return $true}
    if($method -ne 'POST'){throw '不支持的配方请求'}
    $body=Read-ProjectSavePayload $Context.Request 'document' 209715200
    $id=[string]$body.id;$file=Get-RecipeFile $id '.branch.json';$metaFile=Get-RecipeFile $id '.meta.json'
    if((Test-Path -LiteralPath $file) -or (Test-Path -LiteralPath $metaFile)){throw '配方 ID 已存在，请另存新版本'}
    $doc=$body.document | ConvertFrom-Json
    if(-not $doc.settings -or -not $doc.authoring -or $doc.authoring.vine -or $doc.workspaces.active -eq 'BRANCH'){throw '请保存完整整树配方'}
    $name=([string]$body.name).Trim();if(-not $name -or $name.Length -gt 80){throw '配方名称须为 1–80 字'}
    $thumbnail=[string]$body.thumbnail;if($thumbnail.Length -gt 1500000 -or $thumbnail -notmatch '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$'){throw '配方预览无效'}
    $meta=@{id=$id;name=$name;thumbnail=$thumbnail;updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();count=@($doc.authoring.branch_instances).Count;sourceId=[string]$body.sourceId;tags=@($body.tags | Select-Object -First 12)}
    try{Write-AtomicBytes $file ([Text.Encoding]::UTF8.GetBytes([string]$body.document)) | Out-Null;Write-AtomicBytes $metaFile ([Text.Encoding]::UTF8.GetBytes(($meta | ConvertTo-Json -Depth 8 -Compress))) | Out-Null}
    catch{if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force};throw}
    Send-Json $Context @{success=$true;item=$meta};return $true
}
