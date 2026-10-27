param(
    [int]$Port = 18872,
    [switch]$NoBrowser
)

Add-Type -AssemblyName System.Windows.Forms
$ErrorActionPreference = "Stop"

$script:AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:WebDir = Join-Path $script:AppDir "web"
$script:ConfigDir = Join-Path $script:AppDir '.runtime'
if($env:BRANCHFORGE_SESSION_TEST_DIR){
    $testConfig=[IO.Path]::GetFullPath($env:BRANCHFORGE_SESSION_TEST_DIR)
    $runtimeBoundary=[IO.Path]::GetFullPath((Join-Path $script:AppDir '.runtime'))+[IO.Path]::DirectorySeparatorChar
    if(-not $testConfig.StartsWith($runtimeBoundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Test profile must stay inside this workspace runtime.'}
    $script:ConfigDir=$testConfig
}
$env:PATH = (Join-Path $script:AppDir 'runtime') + ';' + $env:PATH
$script:ConfigPath = Join-Path $script:ConfigDir "settings.json"
$script:LogPath = Join-Path $script:ConfigDir "server.log"

if (-not (Test-Path -LiteralPath $script:ConfigDir)) {
    New-Item -ItemType Directory -Path $script:ConfigDir -Force | Out-Null
}

function Write-ServerLog {
    param([string]$Message)
    Add-Content -LiteralPath $script:LogPath -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message) -Encoding UTF8
}

function Load-Config {
    if (-not (Test-Path -LiteralPath $script:ConfigPath)) { return $null }
    try { return Get-Content -LiteralPath $script:ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

function Save-Config {
    param([string]$OutputDirectory)
    $json = [ordered]@{ output_directory = $OutputDirectory } | ConvertTo-Json
    [IO.File]::WriteAllText($script:ConfigPath, $json, (New-Object Text.UTF8Encoding($false)))
}

function Send-Bytes {
    param($Context, [byte[]]$Bytes, [string]$ContentType, [int]$StatusCode = 200)
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = $ContentType
    $Context.Response.ContentLength64 = $Bytes.Length
    $Context.Response.Headers["Cache-Control"] = "no-store"
    if ($Bytes.Length) { $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length) }
    $Context.Response.OutputStream.Close()
}

function Send-File {
    param($Context, [string]$FilePath)
    $stream = [IO.File]::OpenRead($FilePath)
    try {
        $Context.Response.StatusCode = 200
        $Context.Response.ContentType = Get-MimeType $FilePath
        $Context.Response.ContentLength64 = $stream.Length
        $Context.Response.Headers["Cache-Control"] = "no-store"
        $stream.CopyTo($Context.Response.OutputStream)
    } finally {
        $stream.Dispose()
        $Context.Response.OutputStream.Close()
    }
}

function Send-Json {
    param($Context, $Payload, [int]$StatusCode = 200)
    $json = $Payload | ConvertTo-Json -Depth 16 -Compress
    Send-Bytes $Context ([Text.Encoding]::UTF8.GetBytes($json)) "application/json; charset=utf-8" $StatusCode
}

function Read-RequestJson {
    param($Request)
    $reader = New-Object IO.StreamReader($Request.InputStream, [Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
}

function Read-RequestBytes {
    param($Request)
    $memory = New-Object IO.MemoryStream
    # Return one byte[] object, not millions of boxed bytes through the pipeline.
    try { $Request.InputStream.CopyTo($memory); return ,($memory.ToArray()) } finally { $memory.Dispose() }
}

function Decode-PathHeader {
    param($Request, [string]$Name = "X-Branch-Path")
    $encoded = [string]$Request.Headers[$Name]
    if (-not $encoded) { return "" }
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
}

function Write-AtomicBytes {
    param([string]$Path, [byte[]]$Bytes)
    $fullPath = [IO.Path]::GetFullPath($Path)
    $directory = [IO.Path]::GetDirectoryName($fullPath)
    if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    $temporary = Join-Path $directory (".{0}.{1}.tmp" -f [IO.Path]::GetFileName($fullPath), [Guid]::NewGuid().ToString("N"))
    try {
        [IO.File]::WriteAllBytes($temporary, $Bytes)
        Move-Item -LiteralPath $temporary -Destination $fullPath -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
    return $fullPath
}

function Write-AtomicText {
    param([string]$Path, [string]$Text)
    return Write-AtomicBytes $Path ([Text.Encoding]::UTF8.GetBytes($Text))
}

function Show-SaveFbx {
    param([string]$InitialPath)
    $dialog = New-Object Windows.Forms.SaveFileDialog
    $isGlb = [IO.Path]::GetExtension($InitialPath).ToLowerInvariant() -eq ".glb"
    $dialog.Title = if ($isGlb) { "导出 GLB 模型（内嵌贴图）" } else { "导出 UE 树枝 FBX" }
    $dialog.Filter = if ($isGlb) { "GLB 模型 (*.glb)|*.glb" } else { "FBX 模型 (*.fbx)|*.fbx" }
    $dialog.DefaultExt = if ($isGlb) { "glb" } else { "fbx" }
    if ($InitialPath) {
        $dialog.FileName = [IO.Path]::GetFileName($InitialPath)
        $directory = [IO.Path]::GetDirectoryName($InitialPath)
        if ($directory -and (Test-Path -LiteralPath $directory)) { $dialog.InitialDirectory = $directory }
    }
    if ($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    return ""
}

function Show-SaveProject {
    param([string]$SuggestedName)
    $dialog = New-Object Windows.Forms.SaveFileDialog
    $dialog.Title = "保存树鸭儿工程"
    $dialog.Filter = "树鸭儿工程 (*.branch.json)|*.branch.json|JSON (*.json)|*.json"
    $dialog.DefaultExt = "branch.json"
    $dialog.FileName = if ($SuggestedName) { $SuggestedName } else { "程序化树枝单元.branch.json" }
    if ($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    return ""
}

function Get-MimeType {
    param([string]$Path)
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".css" { return "text/css; charset=utf-8" }
        ".js" { return "text/javascript; charset=utf-8" }
        ".wasm" { return "application/wasm" }
        ".mjs" { return "text/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".png" { return "image/png" }
        ".svg" { return "image/svg+xml" }
        ".ico" { return "image/x-icon" }
        ".jpg" { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".webp" { return "image/webp" }
        default { return "application/octet-stream" }
    }
}

function Resolve-StaticFile {
    param([string]$UrlPath)
    $relative = if ($UrlPath -eq "/") { "index.html" } else { [Uri]::UnescapeDataString($UrlPath.TrimStart('/')).Replace('/', '\') }
    $candidate = [IO.Path]::GetFullPath((Join-Path $script:WebDir $relative))
    $root = [IO.Path]::GetFullPath($script:WebDir) + [IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { return "" }
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    return ""
}

# Plant unit packs live outside browser storage because the desktop host uses
# a fresh localhost port on each launch. Hash IDs to keep all paths in this library.
$script:PlantUnitDir = Join-Path $script:AppDir 'assets\plant-unit-library'
$script:BranchAssetDir = Join-Path $script:AppDir 'assets\branch-asset-library'
function Get-BranchAssetPath {
    param([string]$Id, [switch]$Summary)
    if (-not $Id -or $Id.Length -gt 160) { throw '次枝素材 ID 无效' }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $key = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Id)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    $suffix = if ($Summary) { '.meta.json' } else { '.branchasset.json' }
    return Join-Path $script:BranchAssetDir ($key + $suffix)
}
function Get-PlantUnitPath {
    param([string]$Id, [switch]$Summary)
    if (-not $Id -or $Id.Length -gt 160) { throw '植物素材 ID 无效' }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $key = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Id)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    $suffix = if ($Summary) { '.meta.json' } else { '.plantunits.json' }
    return Join-Path $script:PlantUnitDir ($key + $suffix)
}

. (Join-Path $script:AppDir 'scripts/pve-export-server.ps1')
. (Join-Path $script:AppDir 'scripts\project-library-server.ps1')
. (Join-Path $script:AppDir 'scripts/project-session-server.ps1')
. (Join-Path $script:AppDir 'scripts/project-files-server.ps1')
. (Join-Path $script:AppDir 'scripts/creative-library-server.ps1')
. (Join-Path $script:AppDir 'scripts/branch-prefab-server.ps1')
. (Join-Path $script:AppDir 'scripts/trunk-section-preset-server.ps1')
. (Join-Path $script:AppDir 'scripts/trunk-preset-server.ps1')
. (Join-Path $script:AppDir 'scripts/plant-pack-server.ps1')
. (Join-Path $script:AppDir 'scripts/unit-preparation-server.ps1')
$script:AppearancePath = Join-Path $script:ConfigDir 'appearance.json'
if ($env:BRANCHFORGE_SESSION_TEST_DIR) { $script:AppearancePath = Join-Path $script:SessionDir 'appearance.json' }

function Confirm-AppearanceSettings($Value) {
    if (-not $Value -or @('graphite','cream','forest') -notcontains [string]$Value.palette -or
        [string]$Value.background -notmatch '^#[0-9a-fA-F]{6}$' -or [string]$Value.ground -notmatch '^#[0-9a-fA-F]{6}$') {
        throw '外观设置无效，请选择配色及完整颜色值。'
    }
    $modifiedAt = if ($null -eq $Value.modified_at) { 0 } else { if ([string]$Value.modified_at -notmatch '^\d{1,16}$') { throw '外观设置时间无效' }; [long]$Value.modified_at }
    return [ordered]@{ palette = [string]$Value.palette; background = ([string]$Value.background).ToLowerInvariant(); ground = ([string]$Value.ground).ToLowerInvariant(); modified_at = $modifiedAt }
}

$config = Load-Config
$defaultDirectory = if ($config -and $config.output_directory -and (Test-Path -LiteralPath $config.output_directory)) {
    [string]$config.output_directory
} else { Join-Path $script:AppDir '导出' }
if (-not (Test-Path -LiteralPath $defaultDirectory)) { New-Item -ItemType Directory -Path $defaultDirectory -Force | Out-Null }

$listener = New-Object Net.HttpListener
$started = $false
for ($attempt = 0; $attempt -lt 20 -and -not $started; $attempt++) {
    $candidatePort = $Port + $attempt
    $listener.Prefixes.Clear()
    $listener.Prefixes.Add("http://localhost:$candidatePort/")
    try { $listener.Start(); $Port = $candidatePort; $started = $true } catch { if ($attempt -eq 19) { throw } }
}

$url = "http://localhost:$Port/"
Write-ServerLog "BranchForge server started at $url"
if (-not $NoBrowser) { Start-Process $url }

$running = $true
try {
    while ($running -and $listener.IsListening) {
        $context = $listener.GetContext()
        $path = $context.Request.Url.AbsolutePath
        try {
            if ($path -eq '/api/appearance' -and $context.Request.HttpMethod -eq 'GET') {
                $saved = Test-Path -LiteralPath $script:AppearancePath
                $appearance = if ($saved) { Confirm-AppearanceSettings (Get-Content -LiteralPath $script:AppearancePath -Raw -Encoding UTF8 | ConvertFrom-Json) }
                    else { [ordered]@{ palette = 'graphite'; background = '#0b100d'; ground = '#101711' } }
                Send-Json $context @{ success = $true; saved = $saved; settings = $appearance }; continue
            }
            if ($path -eq '/api/appearance' -and $context.Request.HttpMethod -eq 'POST') {
                try { $appearance = Confirm-AppearanceSettings (Read-RequestJson $context.Request) }
                catch { Send-Json $context @{ success = $false; message = '外观设置无效，请选择配色及完整颜色值。' } 400; continue }
                if (Test-Path -LiteralPath $script:AppearancePath) {
                    $previousAppearance = $null
                    try { $previousAppearance = Get-Content -LiteralPath $script:AppearancePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
                    if ($previousAppearance -and [long]$previousAppearance.modified_at -gt [long]$appearance.modified_at) {
                        Send-Json $context @{ success = $false; message = '设置已有更新，旧的保存请求已取消；请重新调整后保存。' } 409; continue
                    }
                }
                $bytes = [Text.Encoding]::UTF8.GetBytes(($appearance | ConvertTo-Json -Compress))
                $null = Write-AtomicBytes $script:AppearancePath $bytes
                Send-Json $context @{ success = $true; saved = $true; settings = $appearance }; continue
            }
            if($env:BRANCHFORGE_SESSION_TEST_DIR -and $context.Request.HttpMethod -eq 'GET' -and $path -eq '/api/acceptance/saved-project'){
                $acceptanceFile=Join-Path $script:ConfigDir 'native-editor-confirmed.branch.json'
                if(Test-Path -LiteralPath $acceptanceFile){Send-File $context $acceptanceFile}else{Send-Json $context @{message='No saved acceptance document'} 404}
                continue
            }
            if (Invoke-ProjectLibraryRoute $context $path) { continue }
            if (Invoke-ProjectSessionRoute $context $path) { continue }
            if (Invoke-ProjectFilesRoute $context $path) { continue }
            if (Invoke-CreativeLibraryRoute $context $path) { continue }
            if (Invoke-BranchPrefabRoute $context $path) { continue }
            if (Invoke-TrunkSectionPresetRoute $context $path) { continue }
            if (Invoke-TrunkPresetRoute $context $path) { continue }
            if (Invoke-PlantPackRoute $context $path) { continue }
            if (Invoke-UnitPreparationRoute $context $path) { continue }
            if ($context.Request.HttpMethod -eq "GET" -and $path -eq "/favicon.ico") {
                $context.Response.StatusCode = 204; $context.Response.Close(); continue
            }
            if ($context.Request.HttpMethod -eq "GET" -and $path -eq "/api/config") {
                Send-Json $context ([ordered]@{
                    success = $true
                    output_fbx = (Join-Path $defaultDirectory "程序化树枝单元.fbx")
                    engine = "branchforge-standalone"
                    version = "4.0.0"
                }); continue
            }
            if ($context.Request.HttpMethod -eq 'GET' -and $path -eq '/api/plant-units') {
                $items = @()
                if (Test-Path -LiteralPath $script:PlantUnitDir) {
                    $items = @(Get-ChildItem -LiteralPath $script:PlantUnitDir -Filter '*.meta.json' -File | ForEach-Object {
                        $summary=Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                        Add-PlantUnitThumbnailToSummary $summary
                    })
                }
                Send-Json $context @{ success = $true; items = $items }; continue
            }
            if ($context.Request.HttpMethod -eq 'GET' -and $path -eq '/api/branch-assets') {
                $items = @()
                if (Test-Path -LiteralPath $script:BranchAssetDir) {
                    $items = @(Get-ChildItem -LiteralPath $script:BranchAssetDir -Filter '*.meta.json' -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json })
                }
                Send-Json $context @{ success = $true; items = $items }; continue
            }
            if ($path -eq '/api/branch-asset' -and $context.Request.HttpMethod -eq 'GET') {
                $file = Get-BranchAssetPath ([string]$context.Request.QueryString['id'])
                if (Test-Path -LiteralPath $file -PathType Leaf) { Send-File $context $file }
                else { Send-Json $context @{ success = $false; message = '次枝不存在' } 404 }
                continue
            }
            if ($path -eq '/api/branch-asset' -and $context.Request.HttpMethod -eq 'POST') {
                if ($context.Request.ContentLength64 -gt 125829120) { throw '次枝素材超过 120 MB' }
                $bytes = Read-RequestBytes $context.Request
                if ($bytes.Length -gt 125829120) { throw '次枝素材超过 120 MB' }
                $json = [Text.Encoding]::UTF8.GetString($bytes)
                $asset = $json | ConvertFrom-Json
                if (-not [string]$asset.name -or @($asset.shape.branches).Count -lt 1 -or @($asset.shape.branches).Count -gt 2200) { throw '次枝素材缺少有效枝干' }
                $target = Get-BranchAssetPath ([string]$asset.id)
                $saved = Write-AtomicText $target $json
                $summary = @{ id = [string]$asset.id; name = [string]$asset.name; revision = [int]$asset.revision; thumbnail = [string]$asset.thumbnail; tags = @($asset.sample.authoring.recipe.tags); branches = @($asset.shape.branches).Count; leafCount = @($asset.sample.leaf_meshes).Count; organCount = @($asset.sample.authoring.tree_organs.units).Count }
                $null = Write-AtomicText (Get-BranchAssetPath ([string]$asset.id) -Summary) ($summary | ConvertTo-Json -Compress)
                Send-Json $context @{ success = $true; path = $saved }; continue
            }
            if ($path -eq '/api/branch-asset' -and $context.Request.HttpMethod -eq 'DELETE') {
                $assetId = [string]$context.Request.QueryString['id']
                foreach ($target in @((Get-BranchAssetPath $assetId), (Get-BranchAssetPath $assetId -Summary))) {
                    if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target }
                }
                Send-Json $context @{ success = $true }; continue
            }
            if ($context.Request.HttpMethod -eq 'GET' -and $path -eq '/api/plant-unit') {
                $file = Get-PlantUnitPath ([string]$context.Request.QueryString['id'])
                if (Test-Path -LiteralPath $file -PathType Leaf) { Send-File $context $file }
                else { Send-Json $context @{ success = $false; message = '素材不存在' } 404 }
                continue
            }
            if ($context.Request.HttpMethod -eq 'POST' -and $path -eq '/api/plant-unit') {
                if ($context.Request.ContentLength64 -gt 125829120) { throw '植物素材套装超过 120 MB' }
                $bytes = Read-RequestBytes $context.Request
                if ($bytes.Length -gt 125829120) { throw '植物素材套装超过 120 MB' }
                $json = [Text.Encoding]::UTF8.GetString($bytes)
                $pack = $json | ConvertFrom-Json
                if ($pack.format -ne 'BranchForgePlantUnits' -or $pack.version -ne 1 -or @($pack.units).Count -gt 64 -or -not [string]$pack.name) { throw '植物素材套装无效' }
                $target = Get-PlantUnitPath ([string]$pack.id)
                $summaryTarget = Get-PlantUnitPath ([string]$pack.id) -Summary
                $saved = Write-AtomicText $target $json
                $summary = [ordered]@{ id = [string]$pack.id; name = [string]$pack.name; count = @($pack.units).Count; revision = [int]$pack.revision; local = $true }
                $null = Write-AtomicText $summaryTarget ($summary | ConvertTo-Json -Compress)
                Send-Json $context @{ success = $true; path = $saved }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/pick-output") {
                $body = Read-RequestJson $context.Request
                $selected = Show-SaveFbx ([string]$body.current)
                if ($selected) { $defaultDirectory = [IO.Path]::GetDirectoryName($selected); Save-Config $defaultDirectory }
                Send-Json $context @{ success = $true; path = $selected }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/save-fbx") {
                $outputPath = Decode-PathHeader $context.Request
                if ([IO.Path]::GetExtension($outputPath).ToLowerInvariant() -ne ".fbx") { throw "FBX 输出路径无效" }
                $bytes = Read-RequestBytes $context.Request
                if ($bytes.Length -lt 256) { throw "FBX 数据无效" }
                $saved = Write-AtomicBytes $outputPath $bytes
                $defaultDirectory = [IO.Path]::GetDirectoryName($saved); Save-Config $defaultDirectory
                Send-Json $context @{ success = $true; path = $saved; bytes = $bytes.Length }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/save-texture") {
                $outputPath = Decode-PathHeader $context.Request
                if ([IO.Path]::GetExtension($outputPath).ToLowerInvariant() -ne ".png") { throw "纹理输出路径无效" }
                $bytes = Read-RequestBytes $context.Request
                if ($bytes.Length -lt 32) { throw "PNG 数据无效" }
                $saved = Write-AtomicBytes $outputPath $bytes
                Send-Json $context @{ success = $true; path = $saved; bytes = $bytes.Length }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/save-glb") {
                $outputPath = Decode-PathHeader $context.Request
                if ([IO.Path]::GetExtension($outputPath).ToLowerInvariant() -ne ".glb") { throw "GLB 输出路径无效" }
                $bytes = Read-RequestBytes $context.Request
                if ($bytes.Length -lt 20 -or [BitConverter]::ToUInt32($bytes, 0) -ne 0x46546C67 -or [BitConverter]::ToUInt32($bytes, 4) -ne 2 -or [BitConverter]::ToUInt32($bytes, 8) -ne $bytes.Length) { throw "GLB 数据无效" }
                $saved = Write-AtomicBytes $outputPath $bytes
                $defaultDirectory = [IO.Path]::GetDirectoryName($saved); Save-Config $defaultDirectory
                Send-Json $context @{ success = $true; path = $saved; bytes = $bytes.Length }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/save-sidecars") {
                $body = Read-RequestJson $context.Request
                $fbxPath = [IO.Path]::GetFullPath([string]$body.output_fbx)
                if ([IO.Path]::GetExtension($fbxPath).ToLowerInvariant() -notin @(".fbx", ".glb")) { throw "辅助文件目标无效" }
                $base = $fbxPath.Substring(0, $fbxPath.Length - 4)
                $projectPath = Write-AtomicText ($base + ".branch.json") ([string]$body.project_json)
                $manifestPath = Write-AtomicText ($base + ".manifest.json") ([string]$body.manifest_json)
                $ueScriptPath = ""
                $pcgPath = ""
                $materialPath = ""
                $validationPath = ""
                $recipePath = ""
                if ([string]$body.ue_import_script) { $ueScriptPath = Write-AtomicText ($base + ".ue-import.py") ([string]$body.ue_import_script) }
                if ([string]$body.pcg_csv) { $pcgPath = Write-AtomicText ($base + ".pcg.csv") ([string]$body.pcg_csv) }
                if ([string]$body.material_json) { $materialPath = Write-AtomicText ($base + ".materials.json") ([string]$body.material_json) }
                if ([string]$body.validation_json) { $validationPath = Write-AtomicText ($base + ".validation.json") ([string]$body.validation_json) }
                if ([string]$body.recipe_json) { $recipePath = Write-AtomicText ($base + ".recipe.json") ([string]$body.recipe_json) }
                Send-Json $context @{ success = $true; project_path = $projectPath; manifest_path = $manifestPath; ue_script_path = $ueScriptPath; pcg_path = $pcgPath; material_path = $materialPath; validation_path = $validationPath; recipe_path = $recipePath }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/save-pve-skeleton") {
                $body = Read-RequestJson $context.Request
                $outputPath = [IO.Path]::GetFullPath([string]$body.output_path)
                if (-not $outputPath.EndsWith('.pve-skeleton.json', [StringComparison]::OrdinalIgnoreCase)) { throw "PVE 骨架输出路径无效" }
                $skeleton = [string]$body.skeleton_json | ConvertFrom-Json
                $validation = [string]$body.validation_json | ConvertFrom-Json
                if ($skeleton.format -ne 'BranchForgePVESkeleton' -or [int]$skeleton.version -notin @(1, 2) -or @($skeleton.branches).Count -lt 1 -or @($validation.errors).Count -gt 0) { throw "PVE 骨架内容无效" }
                $reportPath = $outputPath.Substring(0, $outputPath.Length - 5) + '.validation.json'
                $saved = Write-AtomicText $outputPath ([string]$body.skeleton_json)
                $report = Write-AtomicText $reportPath ([string]$body.validation_json)
                Send-Json $context @{ success = $true; skeleton_path = $saved; validation_path = $report }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/save-pve-project") {
                $body = Read-ProjectSavePayload $context.Request 'project_json'
                $saved = Save-PveProject $body
                Send-Json $context @{ success=$true; path=$saved }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/export-pve-complete") {
                Send-Json $context (Start-PveExport (Read-RequestJson $context.Request)); continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/export-static-vegetation") {
                Send-Json $context (Start-PveExport (Read-RequestJson $context.Request) 'static'); continue
            }
            if ($context.Request.HttpMethod -eq "GET" -and $path -eq "/api/export-pve-status") {
                Send-Json $context (Read-PveJob $context.Request.QueryString['id']); continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/open-pve-output") {
                $body = Read-RequestJson $context.Request
                $job = Read-PveJob ([string]$body.job_id)
                if ($job.state -ne 'succeeded' -or -not (Test-Path -LiteralPath $job.output_dir -PathType Container)) { throw '完整包尚未成功生成' }
                Start-Process explorer.exe -ArgumentList ('"'+$job.output_dir+'"') | Out-Null
                Send-Json $context @{ success=$true }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/save-project") {
                $body = Read-ProjectSavePayload $context.Request 'project_json'
                $selected = Show-SaveProject ([string]$body.suggested_name)
                if ($selected) {
                    $selected = Write-AtomicText $selected ([string]$body.project_json)
                    try { Register-ProjectFile $selected $body } catch { Write-ServerLog ('Project saved; index failed: '+$_.Exception.Message) }
                }
                Send-Json $context @{ success = $true; path = $selected }; continue
            }
            if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/api/shutdown") {
                Send-Json $context @{ success = $true }; $running = $false; continue
            }
            if ($context.Request.HttpMethod -eq "GET") {
                $filePath = Resolve-StaticFile $path
                if ($filePath) { Send-File $context $filePath; continue }
            }
            Send-Json $context @{ success = $false; message = "Not found" } 404
        } catch {
            Write-ServerLog $_.Exception.ToString()
            try { Send-Json $context @{ success = $false; message = $_.Exception.Message } 500 } catch {}
        }
    }
} finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
    Write-ServerLog "BranchForge server stopped"
}
