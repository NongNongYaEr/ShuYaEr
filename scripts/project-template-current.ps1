# Current-version replacement keeps the catalog identity stable. Backups are
# streamed copies, not parsed/serialized copies of potentially 200 MB projects.
function Publish-TemplateFile([string]$Staged, [string]$Target) {
    if ([IO.File]::Exists($Target)) { [IO.File]::Replace($Staged, $Target, [NullString]::Value) }
    else { [IO.File]::Move($Staged, $Target) }
}

function Save-CurrentTreeTemplate($Payload, $Document, [string]$DocumentText, [string]$Name, [string]$Notes) {
    $id = [string]$Payload.id
    $base = Get-TemplateBase $id
    $lockDir = Join-Path $script:AppDir '.runtime\template-save-locks'
    [IO.Directory]::CreateDirectory($lockDir) | Out-Null
    try { $saveLock = [IO.File]::Open((Join-Path $lockDir ($id+'.lock')), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw '另一个窗口正在保存此样板，请稍后重试' }
    try {
        $current = Get-ProjectLibraryItem $id
        if (-not $current -or $current.userSaved -ne $true -or $current.batch -or $current.managed -ne $true) { throw '只能覆盖自己保存的样板，正式来源样板请另存为新样板' }
        if ($current.path -ne "assets/tree-template-library/$id.branch.json" -or -not [IO.File]::Exists($base+'.branch.json')) { throw '当前样板文件位置异常，请另存为新样板' }
        if ($current.kind -ne $Payload.kind) { throw '工作区类型与当前样板不同，请保存为新样板' }
        if (-not $Payload.expectedSaveToken -or [string]$Payload.expectedSaveToken -cne [string]$current.saveToken) { throw '当前版本已被更新，或此工程缺少载入记录。请保留当前编辑另存新样板，或重新打开库中的当前版本后再保存' }
        $token = [string]$Payload.saveToken
        if ($token -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or $token -eq $current.saveToken) { throw '保存标记无效，请重新打开保存面板' }
        $version = if ($current.version) { [int]$current.version } else { 1 }
        $familyId = if ($current.familyId) { [string]$current.familyId } else { $id }
        $savedContexts = @($Document.authoring.workbench.project_save)
        if ($Document.workspaces.active -in @('TREE','VINE')) {
            $active = $Document.workspaces.([string]$Document.workspaces.active.ToLowerInvariant())
            if ($active) { $savedContexts += $active.authoring.workbench.project_save }
        }
        foreach ($saved in $savedContexts) {
            if ($saved.templateId -ne $id -or $saved.familyId -ne $familyId -or [int]$saved.version -ne $version -or $saved.userSaved -ne $true -or $saved.saveToken -cne $token) { throw '工程中的当前版本信息不一致，请重新打开保存面板' }
        }
        $imageBytes = $null
        if ($Payload.thumbnail) {
            if ([string]$Payload.thumbnail -notmatch '^data:image/jpeg;base64,([A-Za-z0-9+/=]+)$') { throw '样板缩略图必须为 JPEG' }
            $imageBytes = [Convert]::FromBase64String($Matches[1])
            if ($imageBytes.Length -gt 2097152) { throw '缩略图超过 2 MB' }
        }
        $backupRelative = "assets/tree-template-backups/$id/$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))-$([Guid]::NewGuid().ToString('N'))"
        $backup = Join-Path $script:AppDir $backupRelative
        [IO.Directory]::CreateDirectory($backup) | Out-Null
        $extensions = @('.branch.json','.jpg','.meta.json')
        $originals = @()
        # Finish every backup before publishing any replacement.
        foreach ($extension in $extensions) {
            if ([IO.File]::Exists($base+$extension)) {
                [IO.File]::Copy($base+$extension, (Join-Path $backup ($id+$extension)))
                $originals += $extension
            }
        }
        $meta = @{}
        foreach ($property in $current.PSObject.Properties) { $meta[$property.Name] = $property.Value }
        $meta.name=$Name; $meta.notes=$Notes; $meta.species=[string]$Payload.species; $meta.speciesName=[string]$Payload.speciesName
        $meta.binding=[string]$Payload.binding; $meta.version=$version; $meta.familyId=$familyId
        $meta.bytes=[Text.Encoding]::UTF8.GetByteCount($DocumentText); $meta.mtimeMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $meta.saveToken=$token; $meta.lastBackupPath="$backupRelative/$id.branch.json"
        if ($imageBytes) { $meta.previewPath="assets/tree-template-library/$id.jpg" }
        $published = @()
        try {
            $null = Write-AtomicText (Join-Path $backup 'next.branch.json') $DocumentText
            if ($imageBytes) { $null = Write-AtomicBytes (Join-Path $backup 'next.jpg') $imageBytes }
            $null = Write-AtomicText (Join-Path $backup 'next.meta.json') ($meta | ConvertTo-Json -Compress -Depth 20)
            foreach ($extension in @('.branch.json','.jpg','.meta.json')) {
                $staged = Join-Path $backup ('next'+$extension)
                if ([IO.File]::Exists($staged)) { Publish-TemplateFile $staged ($base+$extension); $published += $extension }
            }
        } catch {
            $failure = $_
            try {
                foreach ($extension in $published) {
                    if ($originals -contains $extension) {
                        $restore = Join-Path $backup ('restore'+$extension)
                        [IO.File]::Copy((Join-Path $backup ($id+$extension)), $restore, $true)
                        if ([IO.File]::Exists($base+$extension)) { [IO.File]::Replace($restore, $base+$extension, [NullString]::Value) }
                        else { [IO.File]::Move($restore, $base+$extension) }
                    } elseif ([IO.File]::Exists($base+$extension)) { [IO.File]::Delete($base+$extension) }
                }
            } catch { throw "保存失败，自动恢复未完成；覆盖前工程保存在 $backupRelative。$($_.Exception.Message)" }
            throw $failure
        } finally {
            foreach ($extension in $extensions) {
                $staged = Join-Path $backup ('next'+$extension)
                if ([IO.File]::Exists($staged)) { [IO.File]::Delete($staged) }
            }
        }
        Write-ServerLog ("Template save: replaced {0} V{1}; backup {2}" -f $id,$version,$backupRelative)
        return $meta
    } finally { $saveLock.Dispose() }
}
