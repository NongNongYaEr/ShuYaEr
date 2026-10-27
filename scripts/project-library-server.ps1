# Dot-sourced by the desktop HTTP server. Catalog IDs, never client file paths,
# select legacy files; only generated template IDs can be deleted.
$script:ProjectCatalogPath = Join-Path $script:AppDir 'assets\project-library\catalog.json'
$script:TreeTemplateDir = Join-Path $script:AppDir 'assets\tree-template-library'
. (Join-Path $PSScriptRoot 'project-template-current.ps1')

function Read-ProjectSavePayload($Request, [string]$DocumentField, [int64]$MaxBytes = 0) {
    $bytes = Read-RequestBytes $Request
    if ($MaxBytes -gt 0 -and $bytes.Length -gt $MaxBytes) { throw '样板工程超过 200 MB' }
    if ($Request.Headers['X-BranchForge-Save'] -ne '1') { return [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json }
    $lineEnd = 0
    while ($lineEnd -lt $bytes.Length -and $lineEnd -lt 12 -and $bytes[$lineEnd] -ne 10) { $lineEnd++ }
    $headerLength = 0
    if ($lineEnd -ge 12 -or $lineEnd -ge $bytes.Length -or -not [int]::TryParse([Text.Encoding]::ASCII.GetString($bytes,0,$lineEnd),[ref]$headerLength)) { throw '保存数据头无效' }
    $offset = $lineEnd + 1
    if ($headerLength -lt 2 -or $headerLength -gt 3145728 -or $offset+$headerLength -ge $bytes.Length) { throw '保存信息长度无效' }
    $payload = [Text.Encoding]::UTF8.GetString($bytes,$offset,$headerLength) | ConvertFrom-Json
    $offset += $headerLength
    $payload | Add-Member -NotePropertyName $DocumentField -NotePropertyValue ([Text.Encoding]::UTF8.GetString($bytes,$offset,$bytes.Length-$offset)) -Force
    return $payload
}

function Get-ProjectCatalog {
    if (Test-Path -LiteralPath $script:ProjectCatalogPath) {
        $stamp = (Get-Item -LiteralPath $script:ProjectCatalogPath).LastWriteTimeUtc.Ticks
        if (-not $script:ProjectCatalogCache -or $stamp -ne $script:ProjectCatalogStamp) {
            $script:ProjectCatalogCache = Get-Content -LiteralPath $script:ProjectCatalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $script:ProjectCatalogStamp = $stamp
        }
        return $script:ProjectCatalogCache
    }
    return @{items=@(); errors=@(); scannedAt=$null}
}
function Get-TemplateBase([string]$Id) {
    if ($Id -notmatch '^template-[a-f0-9]{32}$') { throw '样板 ID 无效' }
    return Join-Path $script:TreeTemplateDir $Id
}
function Set-TemplateOrigin($Item) {
    # The original registered set carries batch metadata. Older user saves did
    # not yet write userSaved; expose their ownership without rewriting files.
    if ($null -eq $Item.userSaved) { $Item | Add-Member -NotePropertyName userSaved -NotePropertyValue ([bool]($Item.managed -and -not $Item.batch)) }
    if (-not $Item.saveToken) {
        $stamp = if ($Item.mtimeMs) { [string]$Item.mtimeMs } else { [string](Get-Item -LiteralPath ((Get-TemplateBase $Item.id)+'.meta.json')).LastWriteTimeUtc.Ticks }
        $Item | Add-Member -NotePropertyName saveToken -NotePropertyValue ('legacy-'+$stamp) -Force
    }
    return $Item
}
function Get-ProjectLibraryItem([string]$Id) {
    if ($Id -match '^template-[a-f0-9]{32}$') {
        $meta = (Get-TemplateBase $Id) + '.meta.json'
        if (Test-Path -LiteralPath $meta) { return Set-TemplateOrigin (Get-Content -LiteralPath $meta -Raw -Encoding UTF8 | ConvertFrom-Json) }
    } else {
        return @((Get-ProjectCatalog).items | Where-Object { $_.id -ceq $Id }) | Select-Object -First 1
    }
    return $null
}
function Resolve-ProjectLibraryFile([string]$Relative, [switch]$Preview) {
    if (-not $Relative -or [IO.Path]::IsPathRooted($Relative)) { throw '工程路径无效' }
    $full = [IO.Path]::GetFullPath((Join-Path $script:AppDir $Relative))
    $valid = $false
    foreach ($folder in @('初始样本', 'web\previews', 'assets\tree-template-library')) {
        $root = [IO.Path]::GetFullPath((Join-Path $script:AppDir $folder)) + [IO.Path]::DirectorySeparatorChar
        if ($full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $valid = $true }
    }
    if (-not $valid) { throw '文件不在工程库目录中' }
    if ($Preview) { if ($full -notmatch '\.(png|jpg|jpeg|webp)$') { throw '预览类型无效' } }
    elseif (-not $full.EndsWith('.branch.json', [StringComparison]::OrdinalIgnoreCase)) { throw '工程类型无效' }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw '文件已移动，请刷新目录' }
    return $full
}
function Invoke-ProjectLibraryRoute($Context, [string]$Path) {
    $method = $Context.Request.HttpMethod
    if ($Path -eq '/api/project-library' -and $method -eq 'GET') {
        $catalog = Get-ProjectCatalog
        $items = @($catalog.items)
        if (Test-Path -LiteralPath $script:TreeTemplateDir) {
            $items += @(Get-ChildItem -LiteralPath $script:TreeTemplateDir -Filter '*.meta.json' -File | ForEach-Object { Set-TemplateOrigin (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json) })
        }
        Send-Json $Context @{ success=$true; items=$items; scannedAt=$catalog.scannedAt; errors=@($catalog.errors) }; return $true
    }
    if ($Path -eq '/api/project-library/scan' -and $method -eq 'POST') {
        $node = (Get-Command node -ErrorAction Stop).Source
        $result = & $node (Join-Path $script:AppDir 'scripts\index-project-library.mjs') 2>&1
        if ($LASTEXITCODE -ne 0) { throw "扫描失败：$result" }
        Send-Json $Context @{ success=$true }; return $true
    }
    if ($Path -in @('/api/project-document', '/api/project-preview') -and $method -eq 'GET') {
        $item = Get-ProjectLibraryItem ([string]$Context.Request.QueryString['id'])
        if (-not $item) { Send-Json $Context @{success=$false;message='工程不在目录中，请刷新'} 404; return $true }
        if ($Path -eq '/api/project-preview') {
            if (-not $item.previewPath) { Send-Json $Context @{success=$false;message='尚无预览'} 404; return $true }
            $file = Resolve-ProjectLibraryFile $item.previewPath -Preview
        } else { $file = Resolve-ProjectLibraryFile $item.path }
        Send-File $Context $file; return $true
    }
    if ($Path -eq '/api/tree-template' -and $method -eq 'POST') {
        Write-ServerLog ("Template save: receiving {0} bytes" -f $Context.Request.ContentLength64)
        if ($Context.Request.ContentLength64 -gt 209715200) { throw '样板工程超过 200 MB' }
        $payload = Read-ProjectSavePayload $Context.Request 'document' 209715200
        Write-ServerLog 'Template save: request decoded'
        $docText = [string]$payload.document
        $doc = $docText | ConvertFrom-Json
        Write-ServerLog 'Template save: project validated'
        if (-not $doc.settings -or -not $doc.authoring -or -not [string]$payload.name) { throw '样板缺少有效工程数据或名称' }
        if ($payload.kind -notin @('TREE','VINE')) { throw '请切换到整树或藤蔓工作区再保存样板' }
        $name = ([string]$payload.name).Trim()
        if (-not $name -or $name.Length -gt 120) { throw '样板名称须为 1–120 字' }
        $notes = ([string]$payload.notes).Trim()
        if ($notes.Length -gt 2000) { throw '备注最多 2000 字' }
        $saveMode = if ($payload.mode) { [string]$payload.mode } else { 'NEW' }
        if ($saveMode -notin @('NEW','VERSION','CURRENT')) { throw '样板保存方式无效' }
        if ($saveMode -eq 'CURRENT') {
            $meta = Save-CurrentTreeTemplate $payload $doc $docText $name $notes
            Send-Json $Context @{success=$true;item=$meta}; return $true
        }
        $id = if ($payload.id) { [string]$payload.id } else { 'template-' + [Guid]::NewGuid().ToString('N') }
        $base = Get-TemplateBase $id
        foreach ($extension in @('.jpg','.branch.json','.meta.json')) {
            if (Test-Path -LiteralPath ($base+$extension)) { throw '这份保存请求已经存在，请刷新样板库后查看；不会覆盖已有工程' }
        }
        $version = 1; $familyId = $id; $parentId = ''
        if ($saveMode -eq 'VERSION') {
            $parent = Get-ProjectLibraryItem ([string]$payload.parentId)
            if (-not $parent -or $parent.userSaved -ne $true) { throw '只能为自己保存的样板追加版本；来源样板请另存为新样板' }
            $familyId = if ($parent.familyId) { [string]$parent.familyId } else { [string]$parent.id }
            $latestVersion = [int]$parent.version
            foreach ($metaFile in @(Get-ChildItem -LiteralPath $script:TreeTemplateDir -Filter '*.meta.json' -File)) {
                $existing = Get-Content -LiteralPath $metaFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($existing.familyId -eq $familyId) { $latestVersion = [Math]::Max($latestVersion,[int]$existing.version) }
            }
            if ([int]$parent.version -ne $latestVersion) { throw '此样板已有更新版本，请打开最新版本继续，或选择保存为新样板' }
            if ($parent.kind -ne $payload.kind) { throw '工作区类型与原样板不同，请保存为新样板' }
            $version = $latestVersion + 1; $parentId = [string]$parent.id
        }
        if ($payload.id) {
            $savedContext = $doc.authoring.workbench.project_save
            if ($savedContext.templateId -ne $id -or $savedContext.familyId -ne $familyId -or [int]$savedContext.version -ne $version -or $savedContext.userSaved -ne $true) { throw '工程中的样板版本信息不一致，请重新打开保存面板' }
        }
        $preview = ''
        $thumbnail = [string]$payload.thumbnail
        $imageBytes = $null
        if ($thumbnail) {
            if ($thumbnail -notmatch '^data:image/jpeg;base64,([A-Za-z0-9+/=]+)$') { throw '样板缩略图必须为 JPEG' }
            $imageBytes = [Convert]::FromBase64String($Matches[1])
            if ($imageBytes.Length -gt 2097152) { throw '缩略图超过 2 MB' }
            $preview = "assets/tree-template-library/$id.jpg"
        }
        try {
            if ($imageBytes) { $null = Write-AtomicBytes ($base + '.jpg') $imageBytes }
            $null = Write-AtomicText ($base + '.branch.json') $docText
            $meta = @{id=$id;name=$name;path="assets/tree-template-library/$id.branch.json";previewPath=$preview;species=[string]$payload.species;speciesName=[string]$payload.speciesName;kind=[string]$payload.kind;binding=[string]$payload.binding;bytes=[Text.Encoding]::UTF8.GetByteCount($docText);mtimeMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();version=$version;familyId=$familyId;parentId=$parentId;notes=$notes;userSaved=$true;recommended=$true;managed=$true;sourcePath=[string]$payload.sourcePath;sourceId=[string]$payload.sourceId}
            $meta.saveToken = if ($payload.saveToken) { [string]$payload.saveToken } else { [Guid]::NewGuid().ToString() }
            $null = Write-AtomicText ($base + '.meta.json') ($meta | ConvertTo-Json -Compress)
            Write-ServerLog ("Template save: committed {0} V{1}" -f $id,$version)
        } catch {
            foreach ($extension in @('.jpg','.branch.json','.meta.json')) { if (Test-Path -LiteralPath ($base+$extension)) { Remove-Item -LiteralPath ($base+$extension) } }
            throw
        }
        Send-Json $Context @{success=$true;item=$meta}; return $true
    }
    if ($Path -eq '/api/tree-template' -and $method -eq 'DELETE') {
        $deleteId = [string]$Context.Request.QueryString['id']
        $item = Get-ProjectLibraryItem $deleteId
        if (-not $item -or $item.userSaved -ne $true) { throw '来源样板受保护，只能删除自己保存的样板版本' }
        $base = Get-TemplateBase $deleteId
        foreach ($extension in @('.branch.json','.jpg','.meta.json')) {
            if (Test-Path -LiteralPath ($base+$extension) -PathType Leaf) { Remove-Item -LiteralPath ($base+$extension) }
        }
        Send-Json $Context @{success=$true}; return $true
    }
    return $false
}
