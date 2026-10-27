# User assemblies live beside the formal libraries, without changing them.
$script:BranchPrefabDir = Join-Path $script:AppDir 'assets/branch-prefab-library'
if($env:BRANCHFORGE_SESSION_TEST_DIR){$script:BranchPrefabDir=Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'branch-prefabs'}
$script:PrefabLayoutPath=Join-Path $script:ConfigDir 'prefab-layout.json'
if($env:BRANCHFORGE_SESSION_TEST_DIR){$script:PrefabLayoutPath=Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'prefab-layout.json'}
function Get-BranchPrefabFile([string]$Id,[string]$Suffix){
    if($Id -notmatch '^prefab-[a-f0-9]{32}$'){throw '预制枝干 ID 无效'}
    return Join-Path $script:BranchPrefabDir ($Id+$Suffix)
}
function Invoke-BranchPrefabRoute($Context,[string]$Path){
    $method=$Context.Request.HttpMethod
    if($Path -eq '/api/resource-center-preferences'){
        $preferencesFile=Join-Path (Split-Path -Parent $script:PrefabLayoutPath) 'resource-center-preferences.json'
        $preferences=@{}
        if(Test-Path -LiteralPath $preferencesFile){$saved=Get-Content -LiteralPath $preferencesFile -Raw -Encoding UTF8 | ConvertFrom-Json;foreach($entry in $saved.PSObject.Properties){$item=@{};foreach($field in $entry.Value.PSObject.Properties){$item[$field.Name]=$field.Value};$preferences[$entry.Name]=$item}}
        if($method -eq 'GET'){Send-Json $Context @{success=$true;items=$preferences};return $true}
        if($method -ne 'POST'){throw '不支持的资源偏好请求'}
        $body=Read-RequestJson $Context.Request;$key=[string]$body.key
        if(-not $key -or $key.Length -gt 240 -or $key -match '[\x00-\x1f]' -or $key -cin @('__proto__','constructor','prototype')){throw '资源标识无效'}
        if(-not $preferences.ContainsKey($key)) {if($preferences.Count -ge 10000){throw '资源整理记录已达上限'};$preferences[$key]=@{}}
        foreach($field in @('category','tags')){if($null -ne $body.patch.$field){$value=([string]$body.patch.$field).Trim();$limit=if($field -eq 'tags'){400}else{80};if($value.Length -gt $limit){throw '分类或标签过长'};$preferences[$key][$field]=$value}}
        if($null -ne $body.patch.favorite){$preferences[$key].favorite=[bool]$body.patch.favorite}
        if($null -ne $body.patch.lastUsed){$stamp=[long]$body.patch.lastUsed;if($stamp -lt 0){throw '使用时间无效'};$preferences[$key].lastUsed=$stamp}
        Write-AtomicBytes $preferencesFile ([Text.Encoding]::UTF8.GetBytes(($preferences|ConvertTo-Json -Depth 5 -Compress))) | Out-Null
        Send-Json $Context @{success=$true};return $true
    }
    if($Path -eq '/api/branch-prefab-layout'){
        if($method -eq 'GET'){$saved=Test-Path -LiteralPath $script:PrefabLayoutPath;$settings=if($saved){Get-Content -LiteralPath $script:PrefabLayoutPath -Raw -Encoding UTF8 | ConvertFrom-Json}else{@{height=280;folded=$false;focusLeft=$null;modified_at=0}};Send-Json $Context @{success=$true;saved=$saved;settings=$settings};return $true}
        if($method -ne 'POST'){throw '不支持的布局请求'}
        $body=Read-RequestJson $Context.Request
        if([double]$body.height -lt 160 -or [double]$body.height -gt 320 -or [long]$body.modified_at -lt 1){throw '布局偏好无效'}
        if(Test-Path -LiteralPath $script:PrefabLayoutPath){$previous=Get-Content -LiteralPath $script:PrefabLayoutPath -Raw -Encoding UTF8 | ConvertFrom-Json;if([long]$previous.modified_at -gt [long]$body.modified_at){throw '布局已有更新，请重新调整后保存'}}
        $settings=@{height=[double]$body.height;folded=[bool]$body.folded;focusLeft=$(if($null -ne $body.focusLeft){[bool]$body.focusLeft}else{$null});modified_at=[long]$body.modified_at}
        Write-AtomicBytes $script:PrefabLayoutPath ([Text.Encoding]::UTF8.GetBytes(($settings|ConvertTo-Json -Compress))) | Out-Null;Send-Json $Context @{success=$true};return $true
    }
    if($Path -eq '/api/branch-prefabs' -and $method -eq 'GET'){
        $items=@();if(Test-Path -LiteralPath $script:BranchPrefabDir){$items=@(Get-ChildItem -LiteralPath $script:BranchPrefabDir -Filter '*.meta.json' -File | ForEach-Object {try{Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json}catch{}} | Sort-Object createdAt -Descending)}
        Send-Json $Context @{items=$items};return $true
    }
    if($Path -eq '/api/branch-prefab-metadata' -and $method -eq 'POST'){
        $body=Read-RequestJson $Context.Request
        $file=Get-BranchPrefabFile ([string]$body.id) '.meta.json'
        if(-not(Test-Path -LiteralPath $file)){throw '预制枝干已不存在'}
        $meta=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach($key in @('name','category','tags')){if($null -ne $body.$key){$value=([string]$body.$key).Trim();$limit=if($key -eq 'tags'){400}else{80};if($value.Length -gt $limit -or ($key -eq 'name' -and -not $value)){throw '名称或分类过长'};$meta | Add-Member -NotePropertyName $key -NotePropertyValue $value -Force}}
        foreach($key in @('archived','favorite')){if($null -ne $body.$key){$meta | Add-Member -NotePropertyName $key -NotePropertyValue ([bool]$body.$key) -Force}}
        Write-AtomicBytes $file ([Text.Encoding]::UTF8.GetBytes(($meta | ConvertTo-Json -Depth 8 -Compress))) | Out-Null
        Send-Json $Context @{success=$true};return $true
    }
    if($Path -ne '/api/branch-prefab'){return $false}
    if($method -eq 'GET'){$file=Get-BranchPrefabFile ([string]$Context.Request.QueryString['id']) '.prefab.json';if(-not(Test-Path -LiteralPath $file)){throw '预制枝干已不存在'};Send-File $Context $file;return $true}
    if($method -eq 'DELETE'){$id=[string]$Context.Request.QueryString['id'];foreach($suffix in @('.prefab.json','.meta.json')){$file=Get-BranchPrefabFile $id $suffix;if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}};Send-Json $Context @{success=$true};return $true}
    if($method -ne 'POST'){throw '不支持的预制枝干请求'}
    $body=Read-ProjectSavePayload $Context.Request 'document' 209715200
    $id=[string]$body.id;$file=Get-BranchPrefabFile $id '.prefab.json';$metaFile=Get-BranchPrefabFile $id '.meta.json'
    if((Test-Path -LiteralPath $file) -or (Test-Path -LiteralPath $metaFile)){throw '预制枝干已存在，请另存新版本'}
    $doc=$body.document | ConvertFrom-Json
    $packed=$doc.kind -eq 'branchforge-prefab-archive'
    if($doc.version -ne 1 -or $doc.id -ne $id){throw '预制枝干数据无效'}
    if($packed){
        if($doc.familyId -notmatch '^prefab-[a-f0-9]{32}$' -or $doc.revision -lt 1 -or $doc.revision -gt 100000 -or $doc.root -notmatch '^r-[a-f0-9]{64}$' -or -not $doc.resources.PSObject.Properties[$doc.root]){throw '预制枝干版本或资源表无效'}
        if(Test-Path -LiteralPath $script:BranchPrefabDir){foreach($existing in Get-ChildItem -LiteralPath $script:BranchPrefabDir -Filter '*.meta.json' -File){$m=Get-Content -LiteralPath $existing.FullName -Raw -Encoding UTF8 | ConvertFrom-Json;$family=if($m.familyId){$m.familyId}else{$m.id};$revision=if($m.revision){[int]$m.revision}else{1};if($family -eq $doc.familyId -and $revision -ge $doc.revision){throw '此版本已存在，请刷新后再发布'}}}
    }elseif($doc.kind -ne 'branchforge-branch-prefab' -or $doc.operation.type -ne 'DUPLICATE' -or @($doc.operation.targets).Count -ne 1 -or @($doc.operation.records).Count -lt 1 -or @($doc.operation.records).Count -gt 30000){throw '预制枝干数据无效'}
    $name=([string]$body.name).Trim();if(-not $name -or $name.Length -gt 80 -or $name -ne $doc.name){throw '预制枝干名称须为 1–80 字'}
    $thumbnail=[string]$body.thumbnail;if($thumbnail.Length -gt 1500000 -or $thumbnail -notmatch '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$'){throw '预制枝干缩略图无效'}
    $meta=@{id=$id;familyId=$(if($packed){$doc.familyId}else{$id});revision=$(if($packed){[int]$doc.revision}else{1});name=$name;thumbnail=$thumbnail;createdAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();counts=$doc.counts;archived=$false;favorite=$false;category='';tags=''}
    try{Write-AtomicBytes $file ([Text.Encoding]::UTF8.GetBytes([string]$body.document)) | Out-Null;Write-AtomicBytes $metaFile ([Text.Encoding]::UTF8.GetBytes(($meta | ConvertTo-Json -Depth 8 -Compress))) | Out-Null}
    catch{if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force};throw}
    Send-Json $Context @{success=$true;item=$meta};return $true
}
