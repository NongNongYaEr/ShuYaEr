$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$workspace=(Get-Location).Path
$root=Join-Path $workspace ('.runtime/project-files-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$script:AppDir=$root;$script:ConfigDir=$root
$parseErrors=$null;$parseTokens=$null
$syntax=[Management.Automation.Language.Parser]::ParseFile((Join-Path $workspace 'server.ps1'),[ref]$parseTokens,[ref]$parseErrors)
if($parseErrors.Count){throw $parseErrors[0]}
foreach($name in @('Write-AtomicBytes','Write-AtomicText')){
 $node=$syntax.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
 Set-Item -Path ('Function:'+$name) -Value $node.Body.GetScriptBlock()
}
. (Join-Path $workspace 'scripts/project-files-server.ps1')
function Send-Json($Context,$Body,$Status=200){$script:reply=$Body;$script:replyStatus=$Status}
function Send-File($Context,$File){$script:served=$File}
try {
 $a=Join-Path $root 'a/same.branch.json';$b=Join-Path $root 'b/same.branch.json'
 Write-AtomicText $a '{"settings":{"object_name":"A"},"authoring":{}}' | Out-Null
 Write-AtomicText $b '{"settings":{"object_name":"B"},"authoring":{}}' | Out-Null
 Register-ProjectFile $a @{name='same';kind='TREE'};Register-ProjectFile $b @{name='same';kind='VINE'}
 Register-ProjectFile $a @{name='updated';kind='BRANCH'}
 $items=@(Get-SavedProjectFiles)
 if($items.Count -ne 2 -or @($items|Where-Object name -eq 'updated').Count -ne 1){throw 'Path deduplication failed'}
 if((Get-ProjectFileId $a.ToUpperInvariant()) -ne (Get-ProjectFileId $a)){throw 'Windows path case normalization failed'}
 $context=[PSCustomObject]@{Request=[PSCustomObject]@{HttpMethod='GET';QueryString=@{id=(Get-ProjectFileId $a)}}}
 $null=Invoke-ProjectFilesRoute $context '/api/saved-project-document'
 if($script:served -ne $a){throw 'Registered ID did not read actual source file'}
 $context.Request.QueryString.id='file-unknown';$null=Invoke-ProjectFilesRoute $context '/api/saved-project-document'
 if($script:replyStatus -ne 404){throw 'Unregistered file accepted'}
 Remove-Item -LiteralPath $a
 if(-not (@(Get-SavedProjectFiles|Where-Object id -eq (Get-ProjectFileId $a))[0].missing)){throw 'Missing file state absent'}
 $folder=Join-Path $root ([string][char]0x5bfc+[char]0x51fa)
 Write-AtomicText (Join-Path $folder 'older.branch.json') '{"settings":{},"authoring":{}}' | Out-Null
 Write-AtomicText (Join-Path $folder 'nested/not-indexed.branch.json') '{}' | Out-Null
 if(@(Get-SavedProjectFiles).Count -ne 3){throw 'Only direct existing export copies should be discovered'}
 if((Get-Content -LiteralPath $b -Raw) -notmatch '"B"'){throw 'Catalog changed source file'}
 Write-Output 'PASS: saved references persist, deduplicate by actual path, read registered files, detect missing files, and discover only direct export copies.'
}finally{
 if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($root)) -ne (Join-Path $workspace '.runtime')){throw 'Test cleanup path invalid'}
 Remove-Item -LiteralPath $root -Recurse -Force
}
