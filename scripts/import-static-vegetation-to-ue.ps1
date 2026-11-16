param(
    [Parameter(Mandatory=$true)][string]$PackageDirectory,
    [string]$Project = 'Z:/UEproject/Day30Man/Day30Man.uproject',
    [string]$Engine = 'Z:/UEEngine/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe',
    [string]$AssetName = ('IvyStatic_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
)
$ErrorActionPreference = 'Stop'
if ($AssetName -notmatch '^[A-Za-z][A-Za-z0-9_]+$') { throw 'AssetName must use English letters, numbers and underscores.' }
$PackageDirectory = (Resolve-Path -LiteralPath $PackageDirectory).Path
$Project = (Resolve-Path -LiteralPath $Project).Path
$Engine = (Resolve-Path -LiteralPath $Engine).Path
$projectRoot = Split-Path -Parent $Project
$target = '/Game/Day30/Vegetation/StaticUSD/' + $AssetName
if (Test-Path -LiteralPath (Join-Path $projectRoot ('Content/Day30/Vegetation/StaticUSD/' + $AssetName))) {
    throw 'Target already exists. Choose a new AssetName; existing assets are preserved.'
}
$manifest = Get-Content -LiteralPath (Join-Path $PackageDirectory 'static_vegetation.manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 'BranchForgeStaticVegetation' -or $manifest.entry -ne 'vegetation.usda') { throw 'Not a BranchForge static vegetation package.' }
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$runDirectory = Join-Path $projectRoot ('Saved/BranchForgeStaticUSD/' + $runId)
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$python = (Join-Path $PSScriptRoot 'ue-import-static-vegetation.py').Replace('\','/')
if (-not (Test-Path -LiteralPath $python)) { throw 'Missing ue-import-static-vegetation.py beside this launcher.' }
foreach ($mode in @('import','reload')) {
    $report = Join-Path $runDirectory ($mode + '.json')
    $config = Join-Path $runDirectory ($mode + '-config.json')
    @{ package=$PackageDirectory; destination=$target; report=$report; mode=$mode } | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
    $log = Join-Path $runDirectory ($mode + '.log')
    # Forward slashes avoid the UE Python command parser interpreting \u, \t etc.
    $scriptArgument = '-script="' + $python + ' ' + $config.Replace('\','/') + '"'
    $arguments = @(('"'+$Project.Replace('\','/')+'"'), '-run=pythonscript', $scriptArgument,
        '-EnablePlugins=USDCore,USDImporter', '-nullrhi', '-unattended', '-nop4', '-nosound', '-NoSplash',
        ('-abslog="'+$log.Replace('\','/')+'"'))
    Write-Host ($mode + ': ' + $target)
    Write-Host ('Log: ' + $log)
    $worker = Start-Process -FilePath $Engine -ArgumentList $arguments -WindowStyle Hidden -PassThru
    while (-not $worker.WaitForExit(1000)) { }
    $worker.Refresh()
    if (-not (Test-Path -LiteralPath $report)) { throw ('UE did not produce a report. Read ' + $log) }
    $result = Get-Content -LiteralPath $report -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $result.passed -or $worker.ExitCode -ne 0) { throw ('UE validation failed: ' + $result.error + '. Log: ' + $log) }
}
$assembly = @($result.assets | Where-Object { $_.instances -gt 0 })
$summary = @{ passed=$true; destination=$target; assemblies=@($assembly | ForEach-Object {$_.path});
    leaf_instances=$result.leaf_instance_count; reports=$runDirectory; usd_sha256=$result.usd_sha256;
    visual_render_verified=$false; runtime_gpu_memory_measured=$false }
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runDirectory 'result.json') -Encoding UTF8
$summary | ConvertTo-Json -Depth 5
Write-Host 'Import and fresh-process reload passed. The current editor and level were not controlled.'
