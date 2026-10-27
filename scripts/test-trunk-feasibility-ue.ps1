param(
    [Parameter(Mandatory=$true)][string]$Config,
    [string]$Engine = 'Z:/UEEngine/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe',
    [string]$BridgePlugins = 'Z:/UEproject/Day30Man/Plugins'
)
$ErrorActionPreference = 'Stop'
$toolRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$probeRoot = [IO.Path]::GetFullPath((Join-Path $toolRoot '.runtime/trunk-feasibility/UEProbe'))
$taskConfig = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$Engine = (Resolve-Path -LiteralPath $Engine).Path
$BridgePlugins = (Resolve-Path -LiteralPath $BridgePlugins).Path
$project = Join-Path $probeRoot 'UEProbe.uproject'
$reportRoot = Join-Path $probeRoot 'Saved/TrunkFeasibility'
New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $project)) {
    $descriptor = @{ FileVersion=3; EngineAssociation='5.8'; AdditionalPluginDirectories=@($BridgePlugins.Replace('\','/'));
        Plugins=@(@{Name='PythonScriptPlugin';Enabled=$true},@{Name='EditorScriptingUtilities';Enabled=$true},
            @{Name='ProceduralVegetationEditor';Enabled=$true},@{Name='Day30ProceduralVegetationZh';Enabled=$true}) }
    $descriptor | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $project -Encoding UTF8
}
$python = (Join-Path $PSScriptRoot 'ue-trunk-feasibility.py').Replace('\','/')
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $reportRoot $runId
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$packages = @($taskConfig.packages)
if ($packages.Count -eq 0) { throw 'Config requires packages: [{ name, package, asset_folder }].' }
foreach ($item in $packages) {
    if ($item.name -notmatch '^[A-Za-z][A-Za-z0-9_]+$' -or $item.asset_folder -notlike '/Game/TrunkFeasibility/*') { throw 'Invalid isolated asset name or folder.' }
    $item.package = (Resolve-Path -LiteralPath $item.package).Path.Replace('\','/')
}
function Run-IsolatedUE([string[]]$taskArgs, [string]$log, [string]$report) {
    $arguments = @(('"' + $project.Replace('\','/') + '"')) + $taskArgs + @('-nullrhi','-unattended','-nop4','-nosound','-NoSplash','-DDC-ForceMemoryCache',('-abslog="' + $log.Replace('\','/') + '"'))
    $process = Start-Process -FilePath $Engine -ArgumentList $arguments -WindowStyle Hidden -PassThru
    while (-not $process.WaitForExit(1000)) { }
    $process.Refresh()
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $report)) { throw ('UE probe failed. Log: ' + $log) }
}
foreach ($mode in @('create','reload')) {
    $modeReport = Join-Path $runRoot ($mode + '.json')
    $modeConfig = Join-Path $runRoot ($mode + '-config.json')
    @{probe_root=$probeRoot.Replace('\','/');report=$modeReport.Replace('\','/');mode=$mode;packages=$packages} |
        ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $modeConfig -Encoding UTF8
    $scriptArgument = '-script="' + $python + ' ' + $modeConfig.Replace('\','/') + '"'
    Run-IsolatedUE @('-run=pythonscript',$scriptArgument) (Join-Path $runRoot ($mode + '.log')) $modeReport
    $modeResult = Get-Content -LiteralPath $modeReport -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $modeResult.passed) { throw ('UE graph ' + $mode + ' failed: ' + $modeResult.error) }
    # A separate, already-compiled native commandlet generates the saved PVE
    # graph and inspects its real output. Repeating after reload proves the
    # graph and complete source assets do not depend on the creating process.
    foreach ($item in $packages) {
        $graph = $item.asset_folder + '/PVE_' + $item.name + '.PVE_' + $item.name
        $generationReport = Join-Path $runRoot ($mode + '-' + $item.name + '-generation.json')
        $reference = Join-Path $item.package 'whole.pve-skeleton.json'
        $generationArgs = @('-run=PVEWorkflow',('-Asset="' + $graph + '"'),('-Report="' + $generationReport.Replace('\','/') + '"'),
            ('-ReferenceJSON="' + $reference.Replace('\','/') + '"'),'-RequireResolved=1')
        $generationLog = Join-Path $runRoot ($mode + '-' + $item.name + '-generation.log')
        Run-IsolatedUE $generationArgs $generationLog $generationReport
        $generated = Get-Content -LiteralPath $generationReport -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $generated.completed -or $generated.unbound_resolved_vertices -ne 0) { throw ('PVE generation/binding failed for ' + $item.name) }
        $expected = @($modeResult.packages | Where-Object { $_.name -eq $item.name })[0].expected
        if ($generated.resolved_sources -ne $expected.source_count -or $generated.resolved_instances -ne $expected.unit_instance_count) { throw ('PVE complete source/instance count changed: ' + $item.name) }
        if ($generated.resolved_vertices -ne $expected.base_vertices -or $generated.resolved_faces -ne $expected.base_faces) { throw ('PVE base geometry counts changed: ' + $item.name) }
        foreach ($side in @('min','max')) {
            $textValue = if ($side -eq 'min') { $generated.resolved_bounds_min_cm } else { $generated.resolved_bounds_max_cm }
            $actual = [regex]::Matches($textValue,'[XYZ]=(-?\d+(?:\.\d+)?)') | ForEach-Object { [double]::Parse($_.Groups[1].Value,[Globalization.CultureInfo]::InvariantCulture) }
            $target = $expected.base_bounds_cm.$side
            if (@($actual).Count -ne 3) { throw ('Cannot parse PVE base bounds: ' + $textValue) }
            for ($axis=0;$axis -lt 3;$axis++) { if ([Math]::Abs($actual[$axis]-$target[$axis]) -gt 0.01) { throw ('PVE base bounds differ: ' + $item.name) } }
        }
    }
}
$summary = @{passed=$true;reports=$runRoot;packages=@($packages.name);saved_pve_graphs=$true;fresh_process_reload=$true;
    actual_pve_generation_verified=$true;complete_units_reused=$true;base_counts_bounds_verified=$true;
    per_vertex_pve_parity_verified=$false;native_final_mesh_export_verified=$false;wind_verified=$false;visual_render_verified=$false}
$summary.samples = @($modeResult.packages | ForEach-Object {
    @{name=$_.name;passed=$true;source_sha256=$_.expected.source_sha256;
      actual_pve_generation_verified=$true;fresh_process_reload=$true;complete_source_count=$_.expected.source_count;
      unit_instance_count=$_.expected.unit_instance_count;base_vertices=$_.expected.base_vertices;base_faces=$_.expected.base_faces}
})
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'result.json') -Encoding UTF8
# This stable record is published only after every package generated and passed
# the fresh-process reload checks. Each SHA is the verified current input hash.
$stableSummary = Join-Path $toolRoot '.runtime/trunk-feasibility/ue-summary.json'
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $stableSummary -Encoding UTF8
$summary | ConvertTo-Json -Depth 8
