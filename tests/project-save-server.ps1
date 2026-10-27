$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$script:AppDir=(Get-Location).Path
$parseErrors=$null;$parseTokens=$null
$syntax=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $script:AppDir 'server.ps1'),[ref]$parseTokens,[ref]$parseErrors)
if($parseErrors.Count){throw $parseErrors[0]}
$reader=$syntax.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Read-RequestBytes'},$true)
Set-Item -Path Function:Read-RequestBytes -Value $reader.Body.GetScriptBlock()
. (Join-Path $script:AppDir 'scripts/project-library-server.ps1')
$data=New-Object byte[] (16MB)
$data[0]=123;$data[$data.Length-1]=231
$request=[PSCustomObject]@{InputStream=[IO.MemoryStream]::new($data);Headers=@{}}
$read=Read-RequestBytes $request
if($read -isnot [byte[]] -or $read.Length -ne $data.Length -or $read[0] -ne 123 -or $read[$read.Length-1] -ne 231){throw 'Binary reader must return one unchanged byte array'}
$request.InputStream.Dispose()
$name=[string][char]0x6811
$project='{"settings":{"object_name":"'+$name+'"},"authoring":{}}'
$header=[Text.Encoding]::UTF8.GetBytes((@{name=$name;notes=$name+$name} | ConvertTo-Json -Compress))
$prefix=[Text.Encoding]::ASCII.GetBytes([string]$header.Length+"`n")
$document=[Text.Encoding]::UTF8.GetBytes($project)
$stream=[IO.MemoryStream]::new();$stream.Write($prefix,0,$prefix.Length);$stream.Write($header,0,$header.Length);$stream.Write($document,0,$document.Length);$stream.Position=0
$request=[PSCustomObject]@{InputStream=$stream;Headers=@{'X-BranchForge-Save'='1'}}
$payload=Read-ProjectSavePayload $request 'document'
if($payload.name -ne $name -or $payload.document -cne $project){throw 'UTF-8 envelope changed the project'}
$stream.Position=0;$rejected=$false
try{$null=Read-ProjectSavePayload $request 'document' 8}catch{$rejected=$true}
if(-not $rejected){throw 'Oversized request was accepted'}
$stream.Dispose()
$legacy=@{suggested_name='tree.branch.json';project_json=$project} | ConvertTo-Json -Compress
$stream=[IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($legacy))
$payload=Read-ProjectSavePayload ([PSCustomObject]@{InputStream=$stream;Headers=@{}}) 'project_json'
if($payload.project_json -cne $project){throw 'Legacy JSON request was changed'}
$stream.Dispose()
Write-Output 'PASS: byte-array reader, UTF-8 envelope, size limit, legacy JSON request'
