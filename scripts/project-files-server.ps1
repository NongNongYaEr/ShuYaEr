# Saved-file references are metadata only. Read by registered ID, never an arbitrary request path.
$script:ProjectFilesPath = Join-Path $script:ConfigDir 'project-files.json'
if ($env:BRANCHFORGE_SESSION_TEST_DIR) { $script:ProjectFilesPath = Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'project-files.json' }
function Get-ProjectFileId([string]$FilePath) {
    $hasher=[Security.Cryptography.SHA256]::Create()
    try { return 'file-'+([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($FilePath).ToLowerInvariant())))).Replace('-','').ToLowerInvariant() } finally {$hasher.Dispose()}
}
function Read-ProjectFiles {
    if(Test-Path -LiteralPath $script:ProjectFilesPath){return @((Get-Content -LiteralPath $script:ProjectFilesPath -Raw -Encoding UTF8 | ConvertFrom-Json).items)}
    return @()
}
function Register-ProjectFile([string]$FilePath,$Metadata) {
    $full=[IO.Path]::GetFullPath($FilePath)
    $id=Get-ProjectFileId $full
    $name=if($Metadata.name){[string]$Metadata.name}else{[IO.Path]::GetFileName($full) -replace '\.branch\.json$',''}
    $item=@{id=$id;path=$full;name=$name;kind=if($Metadata.kind -in @('TREE','BRANCH','VINE')){[string]$Metadata.kind}else{'UNKNOWN'};savedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
    if($Metadata.thumbnail -match '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' -and ([string]$Metadata.thumbnail).Length -le 400000){$item.thumbnail=[string]$Metadata.thumbnail}
    if($Metadata.thumbnail_version -eq 'project-preview-v2'){$item.thumbnail_version='project-preview-v2'}
    $entries=@($item)+@(Read-ProjectFiles | Where-Object id -ne $id)
    Write-AtomicBytes $script:ProjectFilesPath ([Text.Encoding]::UTF8.GetBytes((@{items=$entries} | ConvertTo-Json -Depth 8 -Compress))) | Out-Null
}
function Get-SavedProjectFiles {
    $entries=@(Read-ProjectFiles)
    $known=@{};foreach($item in $entries){$known[$item.id]=$true}
    # Discover only the application's existing direct export copies. No recursive or external scan.
    $folder=Join-Path $script:AppDir '导出'
    if(Test-Path -LiteralPath $folder){foreach($file in Get-ChildItem -LiteralPath $folder -Filter '*.branch.json' -File){
        $id=Get-ProjectFileId $file.FullName
        if(-not $known.ContainsKey($id)){$entries+=@{id=$id;path=$file.FullName;name=$file.Name -replace '\.branch\.json$','';kind='UNKNOWN'}}
    }}
    return @($entries | ForEach-Object {
        $item=@{};foreach($property in $_.PSObject.Properties){$item[$property.Name]=$property.Value}
        if($_ -is [Collections.IDictionary]){$item=@{};foreach($key in $_.Keys){$item[$key]=$_[$key]}}
        $file=Get-Item -LiteralPath $item.path -ErrorAction SilentlyContinue
        $item.missing=-not ($file -and -not $file.PSIsContainer)
        $item.bytes=if($item.missing){0}else{$file.Length}
        $item.mtimeMs=if($item.missing){$item.savedAt}else{[DateTimeOffset]::new($file.LastWriteTimeUtc).ToUnixTimeMilliseconds()}
        $item
    } | Sort-Object mtimeMs -Descending)
}
function Invoke-ProjectFilesRoute($Context,[string]$Path) {
    if($Path -eq '/api/saved-projects' -and $Context.Request.HttpMethod -eq 'GET') {
        Send-Json $Context @{success=$true;items=@(Get-SavedProjectFiles)};return $true
    }
    if($Path -eq '/api/saved-project-document' -and $Context.Request.HttpMethod -eq 'GET') {
        $id=[string]$Context.Request.QueryString['id']
        $item=@(Get-SavedProjectFiles | Where-Object id -ceq $id | Select-Object -First 1)
        if(-not $item.Count -or $item[0].missing){Send-Json $Context @{success=$false;message='工程文件已移动或不存在，请重新选择文件。'} 404;return $true}
        Send-File $Context $item[0].path;return $true
    }
    return $false
}
