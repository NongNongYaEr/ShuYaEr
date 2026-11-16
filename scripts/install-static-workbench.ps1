param([string]$ProjectRoot = 'Z:/UEproject/Day30Man')
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'Day30Man.uproject'))) { throw 'Expected Day30Man project.' }
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'Plugins/BranchForgeStaticWorkbench/Binaries/Win64/UnrealEditor-BranchForgeStaticWorkbench.dll'))) {
    throw 'Build and enable the BranchForgeStaticWorkbench editor plugin before installing the menu.'
}
$pythonRoot = Join-Path $ProjectRoot 'Content/Python'
$init = Join-Path $pythonRoot 'init_unreal.py'
$old = [IO.File]::ReadAllText($init)
$backup = Join-Path $ProjectRoot ('Saved/BranchForgeStaticUSD/WorkbenchInstallBackup_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $init -Destination (Join-Path $backup 'init_unreal.py')
foreach ($name in @('branchforge_static_contract.py','branchforge_static_ue.py','branchforge_static_workbench.py','branchforge_static_commandlet.py')) {
    $target=Join-Path $pythonRoot $name
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup $name) }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $target -Force
}
$marker='# BranchForge static vegetation workbench (USD shared library)'
if (-not $old.Contains($marker)) {
    $addition=@'

# BranchForge static vegetation workbench (USD shared library)
try:
    import branchforge_static_workbench
    branchforge_static_workbench.register()
except Exception as exc:
    unreal.log_error('BranchForge static workbench registration failed: ' + str(exc))
'@
    # Preserve every existing registration and user customization.
    if ([IO.File]::ReadAllText($init) -ne $old) { throw 'init_unreal.py changed during installation; retry.' }
    [IO.File]::WriteAllText($init,$old+"`n"+$addition+"`n",[Text.UTF8Encoding]::new($false))
}
Write-Output ('Installed: ' + $pythonRoot)
Write-Output ('Backup: ' + $backup)
Write-Output 'Save your work and restart UE manually to load the new Tools menu entry.'
