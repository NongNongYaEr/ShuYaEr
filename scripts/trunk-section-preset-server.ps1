# User section shapes are deliberately separate from formal plant assets and
# from generated runtime caches. Only a fixed ID can choose a library filename.
$script:TrunkSectionPresetDir = Join-Path $script:AppDir 'assets/trunk-section-presets'
if ($env:BRANCHFORGE_SESSION_TEST_DIR) {
    $script:TrunkSectionPresetDir = Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'trunk-section-presets'
}
$script:TrunkSectionPresetLimit = 500
$script:TrunkSectionPresetBodyLimit = 65536

function Get-TrunkSectionPresetPath([string]$Id) {
    if ($Id -cnotmatch '\Asection-preset-[a-f0-9]{32}\z') { throw '截面预设 ID 无效' }
    return Join-Path $script:TrunkSectionPresetDir ($Id + '.sectionpreset.json')
}

function Get-TrunkSectionNumber($Value, [double]$Min, [double]$Max, [double]$Fallback) {
    if ($null -eq $Value -or [string]$Value -eq '') { return $Fallback }
    try { $number = [double]$Value } catch { return $Fallback }
    if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { return $Fallback }
    return [Math]::Max($Min, [Math]::Min($Max, $number))
}

function ConvertTo-TrunkSectionProfile($Raw, [switch]$Direct, [switch]$MainControls) {
    if ($null -eq $Raw -or $Raw -isnot [Array]) { return @() }
    $points = @(); $ids = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    $pointLimit = if ($Direct -and -not $MainControls) { 128 } else { 32 }
    for ($index = 0; $index -lt [Math]::Min($pointLimit, $Raw.Count); $index++) {
        $point = $Raw[$index]
        if ($null -eq $point -or $point -isnot [Management.Automation.PSCustomObject]) { continue }
        $id = if ($point.id -is [string]) { ([string]$point.id -creplace '[^a-zA-Z0-9_.-]', '_') } else { '' }
        if ($id.Length -gt 128) { $id = $id.Substring(0, 128) }
        if (-not $id) { $id = 'PROFILE_' + ($index + 1) }
        # IDs in JavaScript are case-sensitive, so use a matching comparer here.
        if (-not $ids.Add($id)) { continue }
        $angle = Get-TrunkSectionNumber $point.angle -36000 36000 ($index * 360.0 / $Raw.Count)
        $minRadius = if ($Direct) { .001 } else { .15 }
        $maxRadius = if ($Direct) { 64 } else { 4 }
        $points += [ordered]@{ id = $id; angle = (($angle % 360 + 360) % 360); radius = (Get-TrunkSectionNumber $point.radius $minRadius $maxRadius 1); order = $index }
        if ($Direct) {
            foreach ($slopeName in @('tangent', 'join_tangent')) {
                $rawSlope = $point.$slopeName
                if ($null -eq $rawSlope -or $rawSlope -is [string] -or $rawSlope -is [bool]) { continue }
                try { $slope = [double]$rawSlope } catch { continue }
                if (-not [double]::IsNaN($slope) -and -not [double]::IsInfinity($slope) -and [Math]::Abs($slope) -le 1e12) {
                    $points[-1][$slopeName] = $slope
                }
            }
        }
    }
    $result = @()
    foreach ($point in @($points | Sort-Object { [double]$_.angle }, { [int]$_.order })) {
        if ($result.Count -eq 0 -or $point.angle - $result[-1].angle -gt .0001) { $result += $point }
    }
    if ($result.Count -gt 1 -and $result[0].angle + 360 - $result[-1].angle -le .0001) {
        $result = @($result | Select-Object -First ($result.Count - 1))
    }
    if ($result.Count -lt 3) { return @() }
    foreach ($point in $result) { $point.Remove('order') }
    return $result
}

function Confirm-TrunkSectionPreset($Raw, [switch]$Saving) {
    if ($null -eq $Raw) { throw '截面预设无效' }
    $id = [string]$Raw.id
    $null = Get-TrunkSectionPresetPath $id
    $name = ([string]$Raw.name -replace '[\x00-\x1f\x7f]', '').Trim()
    if (-not $name -or $name.Length -gt 80) { throw '截面预设名称须为 1–80 字' }
    if ($null -eq $Raw.shape -or $Raw.shape -isnot [Management.Automation.PSCustomObject]) { throw '截面预设形状无效' }
    $shape = [ordered]@{
        radius = (Get-TrunkSectionNumber $Raw.shape.radius .2 3 1)
        oval = (Get-TrunkSectionNumber $Raw.shape.oval .25 4 1)
        roll = (Get-TrunkSectionNumber $Raw.shape.roll -180 180 0)
    }
    $direct = $Raw.shape.geometry_version -eq 2
    if ($direct) { $shape.geometry_version = 2 }
    if ($direct -and $Raw.shape.profile_scope -ceq 'FINAL') { $shape.profile_scope = 'FINAL' }
    $profile = @(ConvertTo-TrunkSectionProfile $Raw.shape.profile -Direct:$direct)
    if ($profile.Count -ge 3) { $shape.profile = $profile }
    if ($direct) {
        $coarse = @(ConvertTo-TrunkSectionProfile $Raw.shape.profile_coarse -Direct -MainControls)
        if ($coarse.Count -ge 3) { $shape.profile_coarse = $coarse }
        if ($Raw.shape.profile_exclusions -is [Array]) {
            $ranges = @()
            foreach ($range in @($Raw.shape.profile_exclusions | Select-Object -First 128)) {
                if ($null -eq $range -or $range -isnot [Management.Automation.PSCustomObject]) { continue }
                if ($null -eq $range.start -or $null -eq $range.end -or $range.start -is [string] -or $range.end -is [string] -or $range.start -is [bool] -or $range.end -is [bool]) { continue }
                try { $start = [double]$range.start; $end = [double]$range.end } catch { continue }
                if ([double]::IsNaN($start) -or [double]::IsInfinity($start) -or [double]::IsNaN($end) -or [double]::IsInfinity($end)) { continue }
                $value = [ordered]@{ start = (($start % 360 + 360) % 360); end = (($end % 360 + 360) % 360) }
                if ($range.join -ceq 'SMOOTH') { $value.join = 'SMOOTH' }
                $ranges += $value
            }
            $shape.profile_exclusions = $ranges
        }
    }
    $updatedAt = if ($Saving) { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
        else { Get-TrunkSectionNumber $Raw.updatedAt 0 9007199254740991 0 }
    return [ordered]@{ id = $id; name = $name; shape = $shape; updatedAt = [long]$updatedAt }
}

function Get-TrunkSectionPresetCatalog {
    $items = @(); $warnings = @()
    if (Test-Path -LiteralPath $script:TrunkSectionPresetDir -PathType Container) {
        foreach ($file in @(Get-ChildItem -LiteralPath $script:TrunkSectionPresetDir -Filter '*.sectionpreset.json' -File | Select-Object -First $script:TrunkSectionPresetLimit)) {
            try {
                if ($file.Length -gt $script:TrunkSectionPresetBodyLimit) { throw '文件超过 64 KB' }
                $raw = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($raw.format -ne 'BranchForgeTrunkSectionPreset' -or $raw.version -notin @(1, 2)) { throw '格式无效' }
                if ($raw.version -eq 2 -and $raw.shape.geometry_version -ne 2) { throw '直接截面形状无效' }
                $item = Confirm-TrunkSectionPreset $raw
                if ([IO.Path]::GetFileName((Get-TrunkSectionPresetPath $item.id)) -cne $file.Name) { throw '文件 ID 不匹配' }
                $items += $item
            } catch { $warnings += ($file.Name + '：' + $_.Exception.Message) }
        }
    }
    return @{ success = $true; items = @($items | Sort-Object { [long]$_.updatedAt } -Descending); warnings = $warnings }
}

function Read-TrunkSectionPresetRequest($Request) {
    if ($Request.ContentLength64 -gt $script:TrunkSectionPresetBodyLimit) { throw '截面预设超过 64 KB' }
    $memory = New-Object IO.MemoryStream
    $buffer = New-Object byte[] 8192
    try {
        while (($count = $Request.InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if ($memory.Length + $count -gt $script:TrunkSectionPresetBodyLimit) { throw '截面预设超过 64 KB' }
            $memory.Write($buffer, 0, $count)
        }
        return [Text.Encoding]::UTF8.GetString($memory.ToArray()) | ConvertFrom-Json
    } finally { $memory.Dispose() }
}

function Save-TrunkSectionPreset($Raw) {
    $item = Confirm-TrunkSectionPreset $Raw -Saving
    $file = Get-TrunkSectionPresetPath $item.id
    if (-not (Test-Path -LiteralPath $file -PathType Leaf) -and
        (Test-Path -LiteralPath $script:TrunkSectionPresetDir -PathType Container) -and
        @(Get-ChildItem -LiteralPath $script:TrunkSectionPresetDir -Filter '*.sectionpreset.json' -File).Count -ge $script:TrunkSectionPresetLimit) {
        throw '截面预设库已达 500 项，请先移除不需要的预设'
    }
    $version = if ($item.shape.geometry_version -eq 2) { 2 } else { 1 }
    $record = [ordered]@{ format = 'BranchForgeTrunkSectionPreset'; version = $version }
    foreach ($key in $item.Keys) { $record[$key] = $item[$key] }
    $null = Write-AtomicText $file ($record | ConvertTo-Json -Depth 8 -Compress)
    return $item
}

function Remove-TrunkSectionPreset([string]$Id) {
    $file = Get-TrunkSectionPresetPath $Id
    $item = $null
    if (Test-Path -LiteralPath $file -PathType Leaf) {
        try { $item = Confirm-TrunkSectionPreset (Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json) } catch {}
        Remove-Item -LiteralPath $file -Force
    }
    return $item
}

function Invoke-TrunkSectionPresetRoute($Context, [string]$Path) {
    if ($Path -notin @('/api/trunk-section-presets', '/api/trunk-section-preset')) { return $false }
    try {
        $method = $Context.Request.HttpMethod
        if ($Path -eq '/api/trunk-section-presets' -and $method -eq 'GET') {
            Send-Json $Context (Get-TrunkSectionPresetCatalog)
            return $true
        }
        if ($Path -eq '/api/trunk-section-preset' -and $method -eq 'POST') {
            $item = Save-TrunkSectionPreset (Read-TrunkSectionPresetRequest $Context.Request)
            Send-Json $Context @{ success = $true; item = $item }
            return $true
        }
        if ($Path -eq '/api/trunk-section-preset' -and $method -eq 'DELETE') {
            $item = Remove-TrunkSectionPreset ([string]$Context.Request.QueryString['id'])
            Send-Json $Context @{ success = $true; item = $item }
            return $true
        }
        Send-Json $Context @{ success = $false; message = '不支持的截面预设请求' } 405
    } catch { Send-Json $Context @{ success = $false; message = $_.Exception.Message } 400 }
    return $true
}
