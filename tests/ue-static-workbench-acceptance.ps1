param([string]$Workspace = 'Z:/游戏项目设定/植物软件')
$ErrorActionPreference = 'Stop'
$evidence = Join-Path $Workspace '.runtime/static-workbench'
$project = 'Z:/UEproject/Day30Man/Day30Man.uproject'
$engine = 'Z:/UEEngine/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
$script = ($Workspace + '/scripts/branchforge_static_commandlet.py')
$a = $Workspace + '/.runtime/static-workbench/bridge-a-package'
$b = $Workspace + '/.runtime/static-workbench/bridge-b-package'
function Invoke-Step([string]$Name, [hashtable]$Config, [bool]$Expected = $true) {
    $report = Join-Path $evidence ($Name + '.json')
    $configFile = Join-Path $evidence ($Name + '-config.json')
    $log = Join-Path $evidence ($Name + '.log')
    $Config.report = $report
    $Config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configFile -Encoding UTF8
    $arguments = @(('"'+$project+'"'),'-run=pythonscript',('-script="'+$script+' '+$configFile.Replace('\','/')+'"'),
        '-EnablePlugins=USDCore,USDImporter','-nullrhi','-unattended','-nop4','-nosound','-NoSplash',('-abslog="'+$log.Replace('\','/')+'"'))
    $p=Start-Process -FilePath $engine -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $p.WaitForExit(); $p.Refresh()
    $r=Get-Content -LiteralPath $report -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([bool]$r.passed -ne $Expected -or ($Expected -and $p.ExitCode -ne 0)) { throw ($Name + ': ' + $r.error) }
    if (-not $Expected -and $r.error -notmatch '验收注入') { throw ('Unexpected failure: ' + $r.error) }
    Write-Host ($Name + ': expected=' + $Expected + ' actual=' + $r.passed)
    return $r
}
$rA=if (Test-Path -LiteralPath (Join-Path $evidence 'tall-create.json')) { Get-Content -LiteralPath (Join-Path $evidence 'tall-create.json') -Raw | ConvertFrom-Json } else { Invoke-Step 'tall-create' @{mode='create';library='Ivy';variant='BridgeTall';label='桥墩常春藤 · 高造型';package=$a} }
$rAReload=Invoke-Step 'tall-reload' @{mode='reload';key='Ivy/BridgeTall'}
$rB=if (Test-Path -LiteralPath (Join-Path $evidence 'low-clone.json')) { Get-Content -LiteralPath (Join-Path $evidence 'low-clone.json') -Raw | ConvertFrom-Json } else { Invoke-Step 'low-clone' @{mode='clone';library='Ivy';variant='BridgeLow';label='桥墩常春藤 · 低造型';parent='Ivy/BridgeTall';package=$b} }
if (-not $rB[-1].reused_library -or $rB[-1].new_leaf_prototypes -ne 0) { throw 'Second shape did not reuse its library' }
$rBReload=Invoke-Step 'low-reload' @{mode='reload';key='Ivy/BridgeLow'}
$target='Z:/UEproject/Day30Man/Content/Day30/Vegetation/StaticUSD/Workbench/Variants/Ivy/BridgeTall/SM_BridgeTall.uasset'
$sibling='Z:/UEproject/Day30Man/Content/Day30/Vegetation/StaticUSD/Workbench/Variants/Ivy/BridgeLow/SM_BridgeLow.uasset'
$siblingHash=(Get-FileHash -LiteralPath $sibling).Hash
$rUpdate=Invoke-Step 'tall-update' @{mode='update';library='Ivy';variant='BridgeTall';label='桥墩常春藤 · 高造型';package=$b}
$rUpdatedReload=Invoke-Step 'tall-updated-reload' @{mode='reload';key='Ivy/BridgeTall'}
if ($rUpdatedReload[-1].leaves -ne $rBReload[-1].leaves) { throw 'Update did not rebuild native geometry' }
if ((Get-FileHash -LiteralPath $sibling).Hash -ne $siblingHash) { throw 'Update changed the other variant' }
$before=(Get-FileHash -LiteralPath $target).Hash
$rFail=Invoke-Step 'failure-before-publish' @{mode='update';library='Ivy';variant='BridgeTall';package=$a;inject_failure='before_publish'} $false
if ((Get-FileHash -LiteralPath $target).Hash -ne $before) { throw 'Pre-publication failure damaged old asset' }
$rFailAfter=Invoke-Step 'failure-after-publish' @{mode='update';library='Ivy';variant='BridgeTall';package=$a;inject_failure='after_publish'} $false
if ((Get-FileHash -LiteralPath $target).Hash -ne $before) { throw 'Post-publication failure did not restore exact asset bytes' }
$rFailReload=Invoke-Step 'failure-reload' @{mode='reload';key='Ivy/BridgeTall'}
$rRestore=Invoke-Step 'tall-restore' @{mode='update';library='Ivy';variant='BridgeTall';label='桥墩常春藤 · 高造型';package=$a}
$rFinal=Invoke-Step 'final-reload' @{mode='reload';key='Ivy/BridgeTall'}
@{passed=$true; shared_library=$rB[-1].record.library_key; tall_leaves=$rFinal[-1].leaves; low_leaves=$rBReload[-1].leaves;
    stable_path=$rFinal[-1].record.assets; sibling_unchanged=((Get-FileHash -LiteralPath $sibling).Hash -eq $siblingHash);
    failure_before_preserved=$true; failure_after_restored_exact_bytes=$true; fresh_process_reload=$true;
    visual_render_verified=$false} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidence 'acceptance.json') -Encoding UTF8
