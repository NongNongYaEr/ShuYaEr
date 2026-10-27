# Background CLI tasks keep the desktop HTTP loop responsive during geometry export.
$script:PveJobs = @{}
$script:PveJobDir = Join-Path $script:ConfigDir 'pve-export-jobs'
function Read-PveJob([string]$Id) {
    if ($Id -notmatch '^[a-f0-9]{32}$') { throw '导出任务 ID 无效' }
    $file = Join-Path $script:PveJobDir ($Id + '.json')
    $state = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($script:PveJobs.ContainsKey($Id)) {
        $process = $script:PveJobs[$Id]
        if ($process.HasExited -and $state.state -in @('queued','running')) {
            $state.state = 'failed'; $state.detail = '导出进程意外退出：' + (Get-Content -LiteralPath (Join-Path $script:PveJobDir ($Id+'.stderr.log')) -Raw -Encoding UTF8)
            Write-AtomicText $file ($state | ConvertTo-Json -Depth 16) | Out-Null
            $state | Add-Member error $state.detail -Force
        }
    }
    if ($state.state -in @('running','queued') -and -not $script:PveJobs.ContainsKey($Id)) {
        $alive = if ($state.pid) { Get-Process -Id $state.pid -ErrorAction SilentlyContinue } else { $null }
        if (-not $alive) {
            $state.state = 'failed'; $state.detail = '软件或导出进程曾中断，请重新保存并导出；旧成功包仍保留'
            Write-AtomicText $file ($state | ConvertTo-Json -Depth 16) | Out-Null
        }
    }
    $state | Add-Member log_path (Join-Path $script:PveJobDir ($Id + '.log')) -Force
    $state | Add-Member error_log_path (Join-Path $script:PveJobDir ($Id + '.stderr.log')) -Force
    $state | Add-Member job_id $Id -Force
    return $state
}
function Start-PveExport($Body, [string]$Kind = 'pve') {
    $project = [IO.Path]::GetFullPath([string]$Body.project_path)
    if (-not $project.EndsWith('.branch.json', [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $project -PathType Leaf)) { throw '完整枝工程路径无效' }
    $isStatic = $Kind -eq 'static'
    $suffix = if ($isStatic) { '_UE_Static' } else { '_PVE_Complete' }
    $output = $project.Substring(0,$project.Length - 12) + $suffix
    if ([IO.Path]::GetFullPath([string]$Body.output_dir) -ne $output) { throw '完整包目录必须与工程名称对应' }
    foreach ($key in @($script:PveJobs.Keys)) {
        if (-not $script:PveJobs[$key].HasExited) {
            $existing = Read-PveJob $key
            if ($existing.output_dir -eq $output) { return $existing }
        }
    }
    [IO.Directory]::CreateDirectory($script:PveJobDir) | Out-Null
    $id = [Guid]::NewGuid().ToString('N'); $status = Join-Path $script:PveJobDir ($id + '.json')
    $firstStage = if ($isStatic) { '生成实际藤蔓' } else { '生成骨架与样本枝' }
    $initial = @{ success=$true; state='queued'; stage=$firstStage; detail='正在启动导出任务'; output_dir=$output; started=[DateTime]::UtcNow.ToString('o') }
    Write-AtomicText $status ($initial | ConvertTo-Json) | Out-Null
    # Arguments are passed directly to Node, without shell evaluation.
    $exportScript = if ($isStatic) { 'scripts/export-static-vegetation.mjs' } else { 'scripts/export-pve-complete-units.mjs' }
    $arguments = @('--experimental-loader', './vendor-loader.mjs', ('"'+(Join-Path $script:AppDir $exportScript)+'"'), '--project', ('"'+$project+'"'), '--out', ('"'+$output+'"'), '--geometry', '--status', ('"'+$status+'"'))
    if ($Body.keep_history -is [bool] -and $Body.keep_history) { $arguments += '--keep-history' }
    $script:PveJobs[$id] = Start-Process -FilePath (Join-Path $script:AppDir 'runtime/node.exe') -ArgumentList $arguments -WorkingDirectory $script:AppDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:PveJobDir ($id+'.log')) -RedirectStandardError (Join-Path $script:PveJobDir ($id+'.stderr.log'))
    Write-ServerLog "Complete-unit PVE started: $id; $project; $output"
    return Read-PveJob $id
}

function Save-PveProject($Body) {
    $name = [IO.Path]::GetFileName([string]$Body.suggested_name)
    if (-not $name.EndsWith('.branch.json') -or $name.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) { throw '工程文件名称无效' }
    # Only inspect the small envelope here; the CLI parses and validates the full
    # document once. Avoid materializing 200 MB of meshes/atlases as PSObjects.
    $json = [string]$Body.project_json
    $header = $json.Substring(0, [Math]::Min(1024, $json.Length))
    if ($header -notmatch '"format"\s*:\s*"ProceduralBranchProject"' -or $header -notmatch '"version"\s*:\s*4\b') { throw '导出需要当前完整工程' }
    $directory = Join-Path $script:AppDir '导出'
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $target = Join-Path $directory $name
    if ($Body.keep_history -is [bool] -and $Body.keep_history -and (Test-Path -LiteralPath $target)) {
        $suffix = if ($Body.export_kind -eq 'static') { '_UE_Static' } else { '_PVE_Complete' }
        $backup = Join-Path (Join-Path $directory '历史备份') ($name.Substring(0,$name.Length-12)+$suffix)
        [IO.Directory]::CreateDirectory($backup) | Out-Null
        [IO.File]::Copy($target,(Join-Path $backup ('工程-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'-'+[Guid]::NewGuid().ToString('N')+'.branch.json')))
    }
    $saved=Write-AtomicText $target ([string]$Body.project_json)
    try { Register-ProjectFile $saved $Body } catch { Write-ServerLog ('Project saved; index failed: '+$_.Exception.Message) }
    return $saved
}
