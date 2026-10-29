param(
 [Parameter(Mandatory=$true)][string]$UnrealEditorCmd,
 [Parameter(Mandatory=$true)][string]$ProjectFile,
 [Parameter(Mandatory=$true)][string]$GraphAsset,
 [Parameter(Mandatory=$true)][string]$OutputFolder,
 [ValidatePattern('^[A-Za-z0-9_]*$')][string]$DerivedDataCacheGraph=''
)
$ErrorActionPreference='Stop'
$editor=(Resolve-Path -LiteralPath $UnrealEditorCmd).Path
$project=(Resolve-Path -LiteralPath $ProjectFile).Path
if([IO.Path]::GetFileName($editor) -ne 'UnrealEditor-Cmd.exe'){throw 'Choose UnrealEditor-Cmd.exe'}
if([IO.Path]::GetExtension($project) -ne '.uproject'){throw 'Choose the destination UE project'}
if($GraphAsset -notmatch '^/Game/[\p{L}\p{N}_/]+\.[\p{L}\p{N}_]+$'){throw 'GraphAsset must be an existing /Game asset object path'}
if($OutputFolder -notmatch '^/Game/[\p{L}\p{N}_/]+$'){throw 'OutputFolder must be a new /Game folder; existing assets are never replaced'}
$manifest=Join-Path $PSScriptRoot 'whole.resolved.json'
$metadata=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8|ConvertFrom-Json
if($metadata.imported_trunk_skin.version -ne 1){throw 'The fixed trunk binding is missing'}
$reports=Join-Path (Split-Path -Parent $project) ('Saved/TreeDuckExports/'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $reports -Force|Out-Null
function Invoke-TreeDuckExport([string[]]$Arguments,[string]$Name){
 $report=Join-Path $reports ($Name+'.json');$log=Join-Path $reports ($Name+'.log')
 $all=@(('"'+$project+'"'),'-run=PVEWorkflow',('-Report="'+$report+'"'),'-nullrhi','-unattended','-nop4','-nosound','-NoSplash',('-abslog="'+$log+'"'))+$Arguments
 if($DerivedDataCacheGraph){$all+=('-DDC='+$DerivedDataCacheGraph)}
 $process=Start-Process -FilePath $editor -ArgumentList $all -WindowStyle Hidden -PassThru
 $process.WaitForExit()
 if($process.ExitCode -ne 0 -or -not(Test-Path -LiteralPath $report)){throw ('UE export failed. See '+$log)}
 $result=Get-Content -LiteralPath $report -Raw -Encoding UTF8|ConvertFrom-Json
 if($Name -eq 'export' -and -not $result.trunk_export.passed){throw $result.trunk_export.error}
 if($Name -eq 'reload' -and -not $result.passed){throw $result.error}
 return $result
}
$exported=Invoke-TreeDuckExport @('-RequireResolved=1',('-RequireFoliage='+@($metadata.instances).Count),('-Asset='+$GraphAsset),('-TrunkManifest="'+$manifest+'"'),('-ExportTrunk='+$OutputFolder)) 'export'
$reloaded=Invoke-TreeDuckExport @(('-AuditTrunk='+$OutputFolder)) 'reload'
[ordered]@{passed=$true;static_mesh=$exported.trunk_export.static_mesh;skeletal_mesh=$exported.trunk_export.skeletal_mesh;skeleton=$exported.trunk_export.skeleton_asset;cold_reload=$true;reports=$reports;wind_animation_verified=$false}|ConvertTo-Json
