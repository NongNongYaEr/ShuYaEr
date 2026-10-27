# Runtime-only recent snapshots and recovery drafts. Never write formal libraries.
$script:SessionDir = Join-Path $script:ConfigDir 'project-session'
if ($env:BRANCHFORGE_SESSION_TEST_DIR) { $script:SessionDir = [IO.Path]::GetFullPath($env:BRANCHFORGE_SESSION_TEST_DIR) }
function Get-SessionFile([string]$Id, [string]$Suffix) {
    if ($Id -notmatch '^(recent|draft)-[a-f0-9]{32}$') { throw '恢复工程 ID 无效' }
    return Join-Path $script:SessionDir ($Id + $Suffix)
}
function Get-SessionItems {
    if (-not (Test-Path -LiteralPath $script:SessionDir)) { return @() }
    return @(Get-ChildItem -LiteralPath $script:SessionDir -Filter '*.meta.json' -File | ForEach-Object {
        try {
            $item=Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
            if($item.kind -eq 'draft' -and $item.active -and $item.ownerPid){
                try{$null=[Diagnostics.Process]::GetProcessById([int]$item.ownerPid)}catch{$item.active=$false}
            }
            $item
        } catch { }
    } | Sort-Object updatedAt -Descending)
}
function Invoke-ProjectSessionRoute($Context, [string]$Path) {
    if ($Path -eq '/api/branch-thumbnails') {
        $cacheFile=Join-Path $script:ConfigDir 'branch-thumbnails.json'
        if($env:BRANCHFORGE_SESSION_TEST_DIR){$cacheFile=Join-Path $script:SessionDir 'branch-thumbnails.json'}
        $entries=@()
        if(Test-Path -LiteralPath $cacheFile){$entries=@((Get-Content -LiteralPath $cacheFile -Raw -Encoding UTF8 | ConvertFrom-Json).items)}
        if($Context.Request.HttpMethod -eq 'GET'){Send-Json $Context @{items=$entries};return $true}
        if($Context.Request.HttpMethod -eq 'POST'){
            $body=Read-RequestJson $Context.Request
            if(-not $body.id -or ([string]$body.id).Length -gt 160 -or $body.revision -lt 1 -or ([string]$body.thumbnail).Length -gt 400000 -or $body.thumbnail -notmatch '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'){throw '缩略图缓存无效'}
            $entry=@{id=[string]$body.id;revision=[long]$body.revision;thumbnail=[string]$body.thumbnail;thumbnail_revision=[long]$body.revision;thumbnail_render_version='sample-leaf-organ-v2'}
            if($body.thumbnail_render_version -eq 'project-preview-v2'){$entry.thumbnail_render_version='project-preview-v2'}
            $entries=@($entry)+@($entries | Where-Object id -ne $body.id | Select-Object -First 499)
            Write-AtomicBytes $cacheFile ([Text.Encoding]::UTF8.GetBytes((@{items=$entries} | ConvertTo-Json -Depth 8 -Compress))) | Out-Null
            Send-Json $Context @{success=$true};return $true
        }
        throw '不支持的缩略图请求'
    }
    if (-not $Path.StartsWith('/api/project-session')) { return $false }
    $method=$Context.Request.HttpMethod
    if ($Path -eq '/api/project-session' -and $method -eq 'GET') {
        Send-Json $Context @{success=$true;items=@(Get-SessionItems)};return $true
    }
    if ($Path -eq '/api/project-session/document' -and $method -eq 'GET') {
        $file=Get-SessionFile ([string]$Context.Request.QueryString['id']) '.branch.json'
        if (-not (Test-Path -LiteralPath $file)) { throw '恢复文件已不存在，请刷新最近工程' }
        Send-File $Context $file;return $true
    }
    if ($Path -eq '/api/project-session/document' -and $method -eq 'DELETE') {
        $id=[string]$Context.Request.QueryString['id']
        # Exactly two validated files; no recursive deletion.
        foreach ($suffix in @('.branch.json','.meta.json')) { $file=Get-SessionFile $id $suffix; if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
        Send-Json $Context @{success=$true};return $true
    }
    if ($Path -eq '/api/project-session/heartbeat' -and $method -eq 'POST') {
        $body=Read-RequestJson $Context.Request
        $file=Get-SessionFile ([string]$body.id) '.meta.json'
        if (Test-Path -LiteralPath $file) {
            $meta=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
            $meta | Add-Member -NotePropertyName active -NotePropertyValue ([bool]$body.active) -Force
            $meta | Add-Member -NotePropertyName heartbeatAt -NotePropertyValue ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Force
            Write-AtomicBytes $file ([Text.Encoding]::UTF8.GetBytes(($meta | ConvertTo-Json -Depth 12 -Compress))) | Out-Null
        }
        Send-Json $Context @{success=$true};return $true
    }
    if ($Path -eq '/api/project-session/document' -and $method -eq 'POST') {
        $body=Read-ProjectSavePayload $Context.Request 'document' 209715200
        $id=[string]$body.id;$file=Get-SessionFile $id '.branch.json'
        $doc=$body.document | ConvertFrom-Json
        if (-not $doc.settings -or -not $doc.authoring) { throw '恢复工程缺少设置或编辑数据' }
        if (-not (Test-Path -LiteralPath $script:SessionDir)) { New-Item -ItemType Directory -Path $script:SessionDir -Force | Out-Null }
        Write-AtomicBytes $file ([Text.Encoding]::UTF8.GetBytes([string]$body.document)) | Out-Null
        $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $name=[string]$body.name;if($name.Length -gt 120){$name=$name.Substring(0,120)}
        $meta=@{id=$id;name=$name;kind=if($id.StartsWith('draft-')){'draft'}else{'recent'};updatedAt=$now;heartbeatAt=$now;active=$id.StartsWith('draft-');ownerPid=$PID;bytes=(Get-Item -LiteralPath $file).Length}
        $meta.workspace=if($body.workspace -in @('TREE','BRANCH','VINE')){[string]$body.workspace}else{'UNKNOWN'}
        if($body.fileName -and ([string]$body.fileName).Length -le 2048){$meta.fileName=[string]$body.fileName}
        if($body.thumbnail -match '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' -and ([string]$body.thumbnail).Length -le 400000){$meta.thumbnail=[string]$body.thumbnail}
        if($body.thumbnail_version -eq 'project-preview-v2'){$meta.thumbnail_version='project-preview-v2'}
        Write-AtomicBytes (Get-SessionFile $id '.meta.json') ([Text.Encoding]::UTF8.GetBytes(($meta | ConvertTo-Json -Compress))) | Out-Null
        # Keep at most six recent snapshots, bounded to 512 MB. Recovery drafts
        # stay until recovered or explicitly removed; do not evict user work.
        $recent=@(Get-SessionItems | Where-Object kind -eq 'recent');$total=0L
        for($index=0;$index -lt $recent.Count;$index++) {
            $total += [long]$recent[$index].bytes
            if($index -ge 6 -or ($index -gt 0 -and $total -gt 536870912)) {
                foreach($suffix in @('.branch.json','.meta.json')) { Remove-Item -LiteralPath (Get-SessionFile ([string]$recent[$index].id) $suffix) -Force -ErrorAction SilentlyContinue }
            }
        }
        Send-Json $Context @{success=$true;item=$meta};return $true
    }
    throw '不支持的恢复工程请求'
}
