param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
$developmentRoot=Split-Path -Parent $PSScriptRoot
$build=Get-Content -LiteralPath (Join-Path $developmentRoot '.runtime/external-trunk/ue-build-location.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$pluginDirectory=Join-Path $build.package 'HostProject/Plugins'
$pluginDll=Join-Path $pluginDirectory 'Day30ProceduralVegetationZh/Binaries/Win64/UnrealEditor-Day30ProceduralVegetationZh.dll'
if(-not(Test-Path -LiteralPath $pluginDll)){throw 'Build the isolated bridge first'}
$projectRoot=Join-Path $developmentRoot ('.runtime/external-trunk/UEProbe-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
$reportRoot=Join-Path $projectRoot 'Saved/ImportedTrunkProof'
New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
$project=Join-Path $projectRoot 'UEProbe.uproject'
@{FileVersion=3;EngineAssociation='5.8';AdditionalPluginDirectories=@($pluginDirectory.Replace('\','/'));Plugins=@(@{Name='PythonScriptPlugin';Enabled=$true},@{Name='EditorScriptingUtilities';Enabled=$true},@{Name='ProceduralVegetationEditor';Enabled=$true},@{Name='Day30ProceduralVegetationZh';Enabled=$true})} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $project -Encoding UTF8
$inputConfig=Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$engine='Z:/UEEngine/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
function Run-Probe([string[]]$TaskArgs,[string]$Log,[string]$Result){
 $arguments=@(('"'+$project+'"'))+$TaskArgs+@('-nullrhi','-unattended','-nop4','-nosound','-NoSplash','-DDC-ForceMemoryCache',('-abslog="'+$Log+'"'))
 $process=Start-Process -FilePath $engine -ArgumentList $arguments -WindowStyle Hidden -PassThru
 while(-not $process.WaitForExit(1000)){}
 if($process.ExitCode -ne 0 -or -not(Test-Path -LiteralPath $Result)){throw ('UE proof failed. Log: '+$Log)}
}
$summary=@{passed=$false;project=$project;reports=$reportRoot;phases=@()}
$summaryPath=Join-Path $developmentRoot '.runtime/external-trunk/ue-proof-result.json'
try{
 foreach($mode in @('create','reload')){
  $result=Join-Path $reportRoot ($mode+'.json');$task=Join-Path $reportRoot ($mode+'-config.json')
  @{probe_root=$projectRoot.Replace('\','/');report=$result.Replace('\','/');mode=$mode;packages=@($inputConfig.packages)} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $task -Encoding UTF8
  $python=Join-Path $PSScriptRoot 'ue-imported-trunk-proof.py'
  Run-Probe @('-run=pythonscript',('-script="'+$python.Replace('\','/')+' '+$task.Replace('\','/')+'"')) (Join-Path $reportRoot ($mode+'.log')) $result
  $created=Get-Content -LiteralPath $result -Raw -Encoding UTF8 | ConvertFrom-Json
  if(-not $created.passed){throw ('Graph '+$mode+' failed: '+$created.error)}
  foreach($item in $inputConfig.packages){
   $generation=Join-Path $reportRoot ($mode+'-'+$item.name+'-generation.json');$dump=Join-Path $reportRoot ($mode+'-'+$item.name+'-mesh.json')
   $graph=$item.asset_folder+'/PVE_'+$item.name+'.PVE_'+$item.name
   Run-Probe @('-run=PVEWorkflow',('-Asset="'+$graph+'"'),('-Report="'+$generation+'"'),('-ReferenceJSON="'+$item.package+'/whole.pve-skeleton.json"'),('-DumpResolved="'+$dump+'"'),'-RequireResolved=1') (Join-Path $reportRoot ($mode+'-'+$item.name+'-generation.log')) $generation
   $generated=Get-Content -LiteralPath $generation -Raw -Encoding UTF8 | ConvertFrom-Json
   $expected=@($created.packages | Where-Object name -eq $item.name)[0].expected
   if(-not $generated.completed -or $generated.unbound_resolved_vertices -ne 0 -or $generated.resolved_sources -ne $expected.source_count -or $generated.resolved_instances -ne $expected.unit_instance_count -or $generated.resolved_vertices -ne $expected.base_vertices -or $generated.resolved_faces -ne $expected.base_faces){throw ('Actual PVE output failed: '+$item.name)}
   $summary.phases+=@{mode=$mode;name=$item.name;package=$item.package;report=$generation;mesh=$dump;graph=$graph}
  }
 }
 $summary.passed=$true
}catch{$summary.error=$_.Exception.Message;throw}finally{$summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $summaryPath -Encoding UTF8}
$summary | ConvertTo-Json -Depth 12
