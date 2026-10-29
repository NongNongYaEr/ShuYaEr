param(
 [Parameter(Mandatory=$true)][string]$ProjectFile,
 [string]$EngineRoot,
 [string]$PackageRoot=$PSScriptRoot,
 [switch]$VerifyOnly,
 [string]$RestoreBackup
)
$ErrorActionPreference='Stop'
$utf8=New-Object Text.UTF8Encoding($false)
function Read-Json([string]$p){Get-Content -LiteralPath $p -Raw -Encoding UTF8|ConvertFrom-Json}
function Digest([string]$p){if(Test-Path -LiteralPath $p -PathType Leaf){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}else{$null}}
function Under([string]$root,[string]$relative){
 if([IO.Path]::IsPathRooted($relative) -or $relative.Split([char[]]@('/','\')) -contains '..'){throw 'Invalid relative path'}
 $p=[IO.Path]::GetFullPath((Join-Path $root $relative));$prefix=[IO.Path]::GetFullPath($root).TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
 if(-not $p.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Path outside target'}
 return $p
}
function Check-Unlocked([string]$p){
 if(Test-Path -LiteralPath $p -PathType Leaf){try{$h=[IO.File]::Open($p,'Open','ReadWrite','None');$h.Dispose()}catch{throw ('File in use. Save and fully close the target UE project before installing: '+$p)}}
}
function Write-Atomic([string]$p,[byte[]]$bytes){
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p))|Out-Null
 $tmp=$p+'.td-'+[guid]::NewGuid().ToString('N')
 $swap=$tmp+'.previous'
 try{[IO.File]::WriteAllBytes($tmp,$bytes);if(Test-Path -LiteralPath $p){[IO.File]::Replace($tmp,$p,$swap)}else{[IO.File]::Move($tmp,$p)}}finally{foreach($scratch in @($tmp,$swap)){if(Test-Path -LiteralPath $scratch){Remove-Item -LiteralPath $scratch -Force}}}
}
$project=[IO.Path]::GetFullPath($ProjectFile)
if(-not(Test-Path -LiteralPath $project -PathType Leaf) -or [IO.Path]::GetExtension($project) -ne '.uproject'){throw 'Choose an existing .uproject'}
$target=[IO.Path]::GetDirectoryName($project)
if($RestoreBackup){
 $backup=[IO.Path]::GetFullPath($RestoreBackup);$base=Under $target 'Saved/TreeDuckWorkbenchBackups'
 if(-not $backup.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Backup must belong to this project'}
 $r=Read-Json (Under $backup 'receipt.json');if($r.project -ne $project){throw 'Backup project mismatch'}
 foreach($f in $r.files){$p=Under $target $f.path;Check-Unlocked $p;if((Digest $p) -ne $f.after){throw ('File changed since install; automatic rollback stopped: '+$f.path)};if($f.before -and (Digest (Under $backup $f.path)) -ne $f.before){throw 'Backup checksum mismatch'}}
 foreach($f in $r.files){$p=Under $target $f.path;if($f.before){Write-Atomic $p ([IO.File]::ReadAllBytes((Under $backup $f.path)))}elseif(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
 [IO.File]::WriteAllText((Under $backup 'restored.json'),(@{restored=$true;utc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json),$utf8)
 Write-Output ('Restored: '+$backup);exit 0
}
if(-not $EngineRoot){throw 'Pass -EngineRoot for the UE 5.8 installation used by this project'}
$package=[IO.Path]::GetFullPath($PackageRoot);$manifest=Read-Json (Under $package 'build-manifest.json')
$engine=Read-Json (Under ([IO.Path]::GetFullPath($EngineRoot)) 'Engine/Binaries/Win64/UnrealEditor.modules')
if($engine.BuildId -ne $manifest.build_id){throw ('UE BuildId mismatch. This package requires '+$manifest.build_id)}
$changes=@();$checked=0
foreach($f in $manifest.files){
 if($f.path -notmatch '^(Plugins/Day30ProceduralVegetationZh/|Content/Python/branchforge_pve_[A-Za-z0-9_]+\.py$)'){throw ('Unexpected payload path: '+$f.path)}
 $src=Under $package $f.path;$dst=Under $target $f.path
 if((Digest $src) -ne $f.sha256){throw ('Package checksum mismatch: '+$f.path)}
 if(-not $VerifyOnly){Check-Unlocked $dst}
 $checked++;$before=Digest $dst
 if($before -ne $f.sha256){$changes+=@{path=$f.path;before=$before;after=$f.sha256;bytes=[IO.File]::ReadAllBytes($src)}}
}
# Preserve all existing menu registrations, including the static vegetation workbench.
$init=Under $target 'Content/Python/init_unreal.py';$old=if(Test-Path -LiteralPath $init){[IO.File]::ReadAllText($init)}else{''}
if($old -notmatch 'branchforge_pve_workbench'){
 $block=@'

# TreeDuck PVE workbench entry (managed append; existing entries preserved)
try:
    import unreal
    _td_menu = unreal.ToolMenus.get().extend_menu('LevelEditor.MainMenu.Tools')
    _td_entry = unreal.ToolMenuEntry(name='Day30.BranchForge.PVEWorkbench', type=unreal.MultiBlockType.MENU_ENTRY)
    _td_entry.set_label('BranchForge PVE 工作台')
    _td_entry.set_string_command(unreal.ToolMenuStringCommandType.PYTHON, '', 'import branchforge_pve_workbench; branchforge_pve_workbench.run()')
    _td_menu.add_menu_entry('BranchForge', _td_entry)
    unreal.ToolMenus.get().refresh_all_widgets()
except Exception as _td_error:
    unreal.log_error('TreeDuck workbench registration failed: ' + str(_td_error))
'@
 $bytes=$utf8.GetBytes($old+[Environment]::NewLine+$block+[Environment]::NewLine)
 $sha=[Security.Cryptography.SHA256]::Create();try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $changes+=@{path='Content/Python/init_unreal.py';before=(Digest $init);after=$hash;bytes=$bytes}
}
$config=Read-Json $project;$plugins=@($config.Plugins);$configChanged=$false
foreach($name in @('PythonScriptPlugin','EditorScriptingUtilities','ProceduralVegetationEditor','DynamicWind','Day30ProceduralVegetationZh')){
 $entry=$plugins|Where-Object Name -eq $name|Select-Object -First 1
 if(-not $entry){$plugins+=@{Name=$name;Enabled=$true};$configChanged=$true}elseif(-not $entry.Enabled){$entry.Enabled=$true;$configChanged=$true}
}
if($configChanged){
 $config|Add-Member NoteProperty Plugins $plugins -Force
 $bytes=$utf8.GetBytes(($config|ConvertTo-Json -Depth 50)+[Environment]::NewLine)
 $sha=[Security.Cryptography.SHA256]::Create();try{$hash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $changes+=@{path=[IO.Path]::GetFileName($project);before=(Digest $project);after=$hash;bytes=$bytes}
}
if($VerifyOnly){@{verified=$true;version=$manifest.version;build_id=$engine.BuildId;checked_files=$checked;changed_files=$changes.Count;project=$project}|ConvertTo-Json;exit 0}
# Preflight every destination before changing any file. Never terminate an editor.
foreach($f in $changes){Check-Unlocked (Under $target $f.path)}
if(-not $changes.Count){Write-Output 'Already installed and verified.';exit 0}
$backup=Under $target ('Saved/TreeDuckWorkbenchBackups/'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
[IO.Directory]::CreateDirectory($backup)|Out-Null
foreach($f in $changes){if($f.before){$src=Under $target $f.path;if((Digest $src) -ne $f.before){throw 'Concurrent change before backup'};$copy=Under $backup $f.path;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($copy))|Out-Null;[IO.File]::Copy($src,$copy,$false)}}
$receipt=@{project=$project;version=$manifest.version;utc=[DateTime]::UtcNow.ToString('o');status='installing';files=@($changes|ForEach-Object {@{path=$_.path;before=$_.before;after=$_.after}})}
[IO.File]::WriteAllText((Under $backup 'receipt.json'),($receipt|ConvertTo-Json -Depth 8),$utf8)
$done=@()
try{
 foreach($f in $changes){$p=Under $target $f.path;if((Digest $p) -ne $f.before){throw ('Concurrent edit: '+$f.path)};Write-Atomic $p $f.bytes;$done+=$f;if((Digest $p) -ne $f.after){throw 'Installed file checksum mismatch'}}
 $receipt.status='complete'
}catch{
 $receipt.status='rolled_back';$receipt.error=$_.Exception.Message
 foreach($f in $done){$p=Under $target $f.path;if((Digest $p) -eq $f.after){if($f.before){Write-Atomic $p ([IO.File]::ReadAllBytes((Under $backup $f.path)))}else{Remove-Item -LiteralPath $p -Force}}}
 throw
}finally{[IO.File]::WriteAllText((Under $backup 'receipt.json'),($receipt|ConvertTo-Json -Depth 8),$utf8)}
@{installed=$true;version=$manifest.version;project=$project;files=$changes.Count;backup=$backup;restart_editor=$true}|ConvertTo-Json
