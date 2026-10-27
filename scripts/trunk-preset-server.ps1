$script:TrunkPresetDir = Join-Path $script:AppDir 'assets/trunk-presets'
if ($env:BRANCHFORGE_SESSION_TEST_DIR) { $script:TrunkPresetDir = Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'trunk-presets' }
$script:TrunkPresetBodyLimit = 24 * 1024 * 1024

function Get-TrunkPresetFolder([string]$Kind) {
    if ($Kind -cnotin @('detail', 'combination', 'bark', 'profile', 'root')) { throw '预设库类型无效' }
    return Join-Path $script:TrunkPresetDir $Kind
}
function Get-TrunkPresetPath([string]$Kind, [string]$Id) {
    if ($Id -cnotmatch '\Atrunk-preset-[a-f0-9]{32}\z') { throw '预设 ID 无效' }
    return Join-Path (Get-TrunkPresetFolder $Kind) ($Id + '.trunkpreset.json')
}
function Invoke-TrunkPresetValidation($Data) {
    $folder = Join-Path $script:AppDir '.runtime/trunk-preset-requests'
    $null = New-Item -ItemType Directory -Path $folder -Force
    $id = [Guid]::NewGuid().ToString('N')
    $inputFile = Join-Path $folder ($id + '.input.json')
    $outputFile = Join-Path $folder ($id + '.output.json')
    try {
        [IO.File]::WriteAllText($inputFile, ($Data | ConvertTo-Json -Depth 32 -Compress), (New-Object Text.UTF8Encoding $false))
        $node = Join-Path $script:AppDir 'runtime/node.exe'
        $loader = ([Uri](Join-Path $script:AppDir 'vendor-loader.mjs')).AbsoluteUri
        $cli = Join-Path $script:AppDir 'scripts/trunk-preset-cli.mjs'
        $null = & $node --no-warnings --experimental-loader $loader $cli $inputFile $outputFile 2>&1
        if (-not (Test-Path -LiteralPath $outputFile -PathType Leaf)) { throw '预设校验暂不可用，请重启软件后重试' }
        $result = [IO.File]::ReadAllText($outputFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if (-not $result.success) { throw ([string]$result.message) }
        return $result
    } finally {
        Remove-Item -LiteralPath $inputFile, $outputFile -Force -ErrorAction SilentlyContinue
    }
}
function Get-TrunkPresetCatalog([string]$Kind) {
    $folder = Get-TrunkPresetFolder $Kind
    $files = @()
    if (Test-Path -LiteralPath $folder -PathType Container) {
        $files = @(Get-ChildItem -LiteralPath $folder -Filter '*.trunkpreset.json' -File | Select-Object -First 500 | ForEach-Object { $_.FullName })
    }
    return Invoke-TrunkPresetValidation @{ operation = 'catalog'; kind = $Kind; files = $files }
}
function Read-TrunkPresetRequest($Request, [long]$Limit = $script:TrunkPresetBodyLimit) {
    $limitMessage = if ($Limit -eq 65536) { '预设导航超过 64 KB' } else { '预设超过 24 MB' }
    if ($Request.ContentLength64 -gt $Limit) { throw $limitMessage }
    $memory = New-Object IO.MemoryStream
    $buffer = New-Object byte[] 8192
    try {
        while (($count = $Request.InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if ($memory.Length + $count -gt $Limit) { throw $limitMessage }
            $memory.Write($buffer, 0, $count)
        }
        return [Text.Encoding]::UTF8.GetString($memory.ToArray()) | ConvertFrom-Json
    } finally { $memory.Dispose() }
}
function Invoke-TrunkPresetRoute($Context, [string]$Path) {
    if ($Path -notin @('/api/trunk-presets', '/api/trunk-preset', '/api/trunk-preset-preferences')) { return $false }
    try {
        $kind = [string]$Context.Request.QueryString['kind']
        if ($Path -eq '/api/trunk-preset-preferences') {
            if ($kind -cnotin @('section', 'profile', 'detail', 'combination', 'root')) { throw '预设导航类型无效' }
            $configFolder = if ($env:BRANCHFORGE_SESSION_TEST_DIR) { $script:SessionDir } else { $script:ConfigDir }
            $file = Join-Path $configFolder ('trunk-preset-ui-' + $kind + '.json')
            if ($Context.Request.HttpMethod -eq 'GET') {
                $preferences = if (Test-Path -LiteralPath $file -PathType Leaf) { [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { @{ favorites = @(); recent = @() } }
            } elseif ($Context.Request.HttpMethod -eq 'POST') {
                if ($Context.Request.ContentLength64 -gt 65536) { throw '预设导航超过 64 KB' }
                $preferences = Read-TrunkPresetRequest $Context.Request 65536
            } else { throw '预设导航方法无效' }
            $clean = [ordered]@{}
            foreach ($field in @('favorites', 'recent')) {
                $limit = if ($field -eq 'recent') { 24 } else { 500 }
                $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
                $values = @()
                foreach ($id in @($preferences.$field)) {
                    if ($id -is [string] -and $id -cmatch '\A(?:builtin-[a-z0-9_.-]+|(?:section|trunk)-preset-[a-f0-9]{32})\z' -and $seen.Add($id)) { $values += $id }
                    if ($values.Count -ge $limit) { break }
                }
                $clean[$field] = @($values)
            }
            if ($Context.Request.HttpMethod -eq 'POST') { $null = Write-AtomicText $file ($clean | ConvertTo-Json -Depth 4 -Compress) }
            Send-Json $Context @{ success = $true; preferences = $clean }
            return $true
        }
        $folder = Get-TrunkPresetFolder $kind
        $method = $Context.Request.HttpMethod
        if ($Path -eq '/api/trunk-presets' -and $method -eq 'GET') {
            Send-Json $Context (Get-TrunkPresetCatalog $kind)
        } elseif ($Path -eq '/api/trunk-preset' -and $method -eq 'POST') {
            $raw = Read-TrunkPresetRequest $Context.Request
            $file = Get-TrunkPresetPath $kind ([string]$raw.id)
            if (-not (Test-Path -LiteralPath $file) -and (Test-Path -LiteralPath $folder) -and @(Get-ChildItem -LiteralPath $folder -Filter '*.trunkpreset.json' -File).Count -ge 500) { throw '预设库已达 500 项，请先移除不需要的预设' }
            $item = (Invoke-TrunkPresetValidation @{ operation = 'normalize'; kind = $kind; item = $raw }).item
            $record = [ordered]@{ format = 'BranchForgeTrunkPreset'; version = 1; kind = $kind; id = $item.id; name = $item.name; shape = $item.shape; updatedAt = $item.updatedAt }
            $null = Write-AtomicText $file ($record | ConvertTo-Json -Depth 32 -Compress)
            Send-Json $Context @{ success = $true; item = $item }
        } elseif ($Path -eq '/api/trunk-preset' -and $method -eq 'DELETE') {
            $file = Get-TrunkPresetPath $kind ([string]$Context.Request.QueryString['id'])
            if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force }
            Send-Json $Context @{ success = $true; item = $null }
        } else { Send-Json $Context @{ success = $false; message = '不支持的预设请求' } 405 }
    } catch { Send-Json $Context @{ success = $false; message = $_.Exception.Message } 400 }
    return $true
}
