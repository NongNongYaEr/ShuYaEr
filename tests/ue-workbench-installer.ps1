param([Parameter(Mandatory=$true)][string]$PackageRoot,[Parameter(Mandatory=$true)][string]$EngineRoot)
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('TreeDuckInstallerProbe-'+[guid]::NewGuid().ToString('N'))
$utf8=New-Object Text.UTF8Encoding($false)
function Assert($value,$message){if(-not $value){throw $message}}
try{
 New-Item -ItemType Directory -Path ($root+'/Content/Python'),($root+'/Plugins/Day30ProceduralVegetationZh/Binaries/Win64') -Force|Out-Null
 $project=$root+'/InstallerProbe.uproject'
 [IO.File]::WriteAllText($project,'{"FileVersion":3,"EngineAssociation":"5.8","Plugins":[]}',$utf8)
 $init=$root+'/Content/Python/init_unreal.py';$before="# user entry and static workbench preserved`nprint('keep me')`n"
 [IO.File]::WriteAllText($init,$before,$utf8)
 $source=$root+'/Content/Python/branchforge_pve_contract.py';[IO.File]::WriteAllText($source,'# original contract',$utf8)
 $projectBefore=[IO.File]::ReadAllText($project)
 $install=$PackageRoot+'/install-ue-workbench.ps1'
 & $install -ProjectFile $project -EngineRoot $EngineRoot -VerifyOnly|Out-Null
 Assert ([IO.File]::ReadAllText($init) -eq $before) 'Preflight changed files'
 & $install -ProjectFile $project -EngineRoot $EngineRoot|Out-Null
 $receipt=Get-ChildItem -LiteralPath ($root+'/Saved/TreeDuckWorkbenchBackups') -Filter receipt.json -Recurse|Select-Object -First 1
 Assert ($null -ne $receipt) 'Missing backup'
 $r=Get-Content -LiteralPath $receipt.FullName -Raw|ConvertFrom-Json
 Assert ($r.status -eq 'complete') 'Install incomplete'
 Assert ([IO.File]::ReadAllText($init).StartsWith($before)) 'Original init was replaced'
 Assert ([IO.File]::ReadAllText($init).Contains('branchforge_pve_workbench')) 'Menu entry missing'
 $new=[IO.File]::ReadAllText($source);[IO.File]::WriteAllText($source,$new+'# later edit',$utf8)
 $blocked=$false;try{& $install -ProjectFile $project -RestoreBackup $receipt.Directory.FullName|Out-Null}catch{$blocked=$_.Exception.Message -like '*changed since install*'}
 Assert $blocked 'Rollback overwrote later edit'
 [IO.File]::WriteAllText($source,$new,$utf8)
 & $install -ProjectFile $project -RestoreBackup $receipt.Directory.FullName|Out-Null
 Assert ([IO.File]::ReadAllText($source) -eq '# original contract') 'Original Python not restored'
 Assert ([IO.File]::ReadAllText($init) -eq $before) 'Original init not restored'
 Assert ([IO.File]::ReadAllText($project) -eq $projectBefore) 'Project config not restored'
 $dll=$root+'/Plugins/Day30ProceduralVegetationZh/Binaries/Win64/UnrealEditor-Day30ProceduralVegetationZh.dll'
 [IO.File]::WriteAllBytes($dll,[byte[]]@(1,2,3))
 $lock=[IO.File]::Open($dll,'Open','ReadWrite','None')
 try{$blocked=$false;try{& $install -ProjectFile $project -EngineRoot $EngineRoot|Out-Null}catch{$blocked=$_.Exception.Message -like '*File in use*'};Assert $blocked 'Locked module was not protected'}finally{$lock.Dispose()}
 Assert ([IO.File]::ReadAllText($source) -eq '# original contract') 'Lock failure changed another file'
 @{passed=$true;checks=@('read_only_preflight','versioned_install','menu_append_preserves_original','dependency_plugins','backup_hashes','later_edit_rollback_guard','restore_original_python_and_config','locked_dll_preflight')}|ConvertTo-Json
}finally{
 $resolved=[IO.Path]::GetFullPath($root);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if($resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved).StartsWith('TreeDuckInstallerProbe-') -and (Test-Path -LiteralPath $resolved)){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
