$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$script:AppDir=Join-Path $repo ('.runtime\current-save-server\'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($script:AppDir) | Out-Null
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'server.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw $errors[0]}
foreach($name in @('Write-AtomicText','Write-AtomicBytes')){
 $node=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 Set-Item -Path ('Function:'+$name) -Value $node.Body.GetScriptBlock()
}
function Write-ServerLog($Message) {}
. (Join-Path $repo 'scripts/project-library-server.ps1')
function Check($Value,[string]$Message){if(-not $Value){throw $Message}}
function Hash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash}
$id='template-'+[Guid]::NewGuid().ToString('N');$base=Get-TemplateBase $id
$meta=@{id=$id;name='before';path="assets/tree-template-library/$id.branch.json";previewPath="assets/tree-template-library/$id.jpg";kind='TREE';managed=$true;userSaved=$true;familyId=$id;version=1;parentId='';mtimeMs=10;sourceId='original';customKeep='preserve'}
$null=Write-AtomicText ($base+'.meta.json') ($meta|ConvertTo-Json -Compress)
$null=Write-AtomicText ($base+'.branch.json') '{"settings":{"object_name":"before"},"authoring":{}}'
$null=Write-AtomicBytes ($base+'.jpg') ([byte[]]@(1,2,3))
$oldHashes=@{};foreach($extension in @('.branch.json','.jpg','.meta.json')){$oldHashes[$extension]=Hash ($base+$extension)}
function Request([string]$Expected){
 $newToken=[Guid]::NewGuid().ToString()
 $context=@{templateId=$id;familyId=$id;version=1;userSaved=$true;saveToken=$newToken}
 $doc=@{settings=@{object_name='after'};authoring=@{workbench=@{project_save=$context}};workspaces=@{active='TREE';tree=@{settings=@{};authoring=@{workbench=@{project_save=$context}}}}}
 $payload=[PSCustomObject]@{id=$id;kind='TREE';expectedSaveToken=$Expected;saveToken=$newToken;thumbnail='data:image/jpeg;base64,BAUG';species='TEST';speciesName='test';binding='test'}
 return @{payload=$payload;doc=($doc|ConvertTo-Json -Depth 20|ConvertFrom-Json);text=($doc|ConvertTo-Json -Depth 20 -Compress)}
}
$request=Request 'legacy-10'
$saved=Save-CurrentTreeTemplate $request.payload $request.doc $request.text 'after' 'notes'
Check ($saved.id -eq $id -and $saved.version -eq 1 -and $saved.familyId -eq $id) 'identity changed'
Check ($saved.sourceId -eq 'original' -and $saved.customKeep -eq 'preserve') 'metadata lost'
Check ((Get-Content -LiteralPath ($base+'.branch.json') -Raw) -eq $request.text) 'project not replaced'
$backup=Split-Path -Parent (Join-Path $script:AppDir $saved.lastBackupPath)
foreach($extension in @('.branch.json','.jpg','.meta.json')){Check ((Hash (Join-Path $backup ($id+$extension))) -eq $oldHashes[$extension]) 'backup differs'}
$newHashes=@{};foreach($extension in @('.branch.json','.jpg','.meta.json')){$newHashes[$extension]=Hash ($base+$extension)}
$rejected=$false;try{$null=Save-CurrentTreeTemplate $request.payload $request.doc $request.text 'stale' ''}catch{$rejected=$true}
Check $rejected 'stale window accepted'
# Inject a metadata publication failure after replacing project and preview.
$publish=(Get-Item Function:Publish-TemplateFile).ScriptBlock
function Publish-TemplateFile([string]$Staged,[string]$Target){if($Target.EndsWith('.meta.json')){throw 'simulated metadata failure'}; & $publish $Staged $Target}
$retry=Request $saved.saveToken;$rejected=$false
try{$null=Save-CurrentTreeTemplate $retry.payload $retry.doc $retry.text 'failure' ''}catch{$rejected=$true}
Check $rejected 'injected failure not raised'
foreach($extension in @('.branch.json','.jpg','.meta.json')){Check ((Hash ($base+$extension)) -eq $newHashes[$extension]) 'rollback changed original'}
Set-Item Function:Publish-TemplateFile $publish
# The failed request did not consume the token; an ordinary retry succeeds.
$saved=Save-CurrentTreeTemplate $retry.payload $retry.doc $retry.text 'retried' ''
Check ($saved.saveToken -eq $retry.payload.saveToken) 'retry failed'
$blocked=Request $saved.saveToken;$meta=Get-Content -LiteralPath ($base+'.meta.json') -Raw|ConvertFrom-Json
$meta.userSaved=$false;$meta|Add-Member batch 'formal'
$null=Write-AtomicText ($base+'.meta.json') ($meta|ConvertTo-Json -Compress)
$protected=Hash ($base+'.branch.json');$rejected=$false
try{$null=Save-CurrentTreeTemplate $blocked.payload $blocked.doc $blocked.text 'forbidden' ''}catch{$rejected=$true}
Check ($rejected -and (Hash ($base+'.branch.json')) -eq $protected) 'formal template was overwritten'
Write-Output 'PASS: current identity, streamed backups, stale rejection, failure rollback, retry, formal protection'
