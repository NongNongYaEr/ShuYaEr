$script:TrunkModelDir=Join-Path $script:AppDir 'assets/trunk-models'
if($env:BRANCHFORGE_SESSION_TEST_DIR){$script:TrunkModelDir=Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'trunk-models'}
function Invoke-TrunkModelRoute($Context,[string]$Path){
 if($Path -in @('/api/trunk-preparation-draft','/api/trunk-preparation-drafts')){return Invoke-TrunkPreparationRoute $Context $Path}
 if($Path -cnotin @('/api/trunk-models','/api/trunk-model','/api/trunk-preparation-sources','/api/trunk-preparation-source')){return $false}
 $draftSource=$Path.StartsWith('/api/trunk-preparation-');$root=if($draftSource){Join-Path $script:ConfigDir 'trunk-preparation/sources'}else{$script:TrunkModelDir}
 $operation=if($Path -in @('/api/trunk-models','/api/trunk-preparation-sources')){'list'}elseif($Context.Request.HttpMethod -eq 'GET'){'get'}elseif($Context.Request.HttpMethod -eq 'POST'){'put'}else{throw '不支持的树干素材操作'}
 $folder=Join-Path $script:ConfigDir 'trunk-model-requests';$null=New-Item -ItemType Directory -Force -Path $folder;$requestId=[Guid]::NewGuid().ToString('N');$inputFile=Join-Path $folder ($requestId+'.input.json');$outputFile=Join-Path $folder ($requestId+'.output.json')
 try{
  if($operation -eq 'put'){
   if($Context.Request.ContentLength64 -le 0 -or $Context.Request.ContentLength64 -gt 384MB){throw '树干素材需在 384 MB 内'}
   $stream=[IO.File]::Create($inputFile);try{$buffer=New-Object byte[] 1048576;$total=0L;while(($count=$Context.Request.InputStream.Read($buffer,0,$buffer.Length)) -gt 0){$total+=$count;if($total -gt 384MB){throw '树干素材超过保存容量'};$stream.Write($buffer,0,$count)}}finally{$stream.Dispose()}
  }else{$query=$Context.Request.QueryString;$value=@{id=[string]$query['id']};if($query['revision']){$value.revision=[int]$query['revision']};$null=Write-AtomicText $inputFile ($value|ConvertTo-Json -Compress)}
  $node=Join-Path $script:AppDir 'runtime/node.exe';$cli=Join-Path $script:AppDir 'scripts/trunk-model-cli.mjs';$null=& $node --no-warnings $cli $root $operation $inputFile $outputFile 2>&1
  if(-not(Test-Path -LiteralPath $outputFile -PathType Leaf)){throw '树干素材保存或读取失败'}
  $prefix=[IO.File]::ReadAllText($outputFile,[Text.Encoding]::UTF8);if($prefix.StartsWith('{"success":false')){$problem=$prefix|ConvertFrom-Json;throw ([string]$problem.message)}
  Send-File $Context $outputFile;return $true
 }finally{Remove-Item -LiteralPath $inputFile,$outputFile -Force -ErrorAction SilentlyContinue}
}
function Invoke-TrunkPreparationRoute($Context,[string]$Path){
 $folder=Join-Path $script:ConfigDir 'trunk-preparation/drafts';$method=$Context.Request.HttpMethod
 if($Path -eq '/api/trunk-preparation-drafts' -and $method -eq 'GET'){$items=@();if(Test-Path -LiteralPath $folder){$items=@(Get-ChildItem -LiteralPath $folder -Filter '*.json' -File|ForEach-Object{try{$d=Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json;@{id=$d.id;name=$d.edits.name;updatedAt=$d.updatedAt;revision=$d.revision}}catch{}}|Sort-Object updatedAt -Descending)};Send-Json $Context @{success=$true;items=$items};return $true}
 $id=[string]$Context.Request.QueryString['id'];if($id -cnotmatch '^[a-f0-9-]{36}$'){throw '树干整理草稿身份无效'};$file=Join-Path $folder ($id+'.json')
 if($method -eq 'GET'){if(Test-Path -LiteralPath $file){Send-File $Context $file}else{Send-Json $Context @{success=$false;message='树干整理草稿不存在'} 404};return $true}
 if($method -eq 'POST'){
  if($Context.Request.ContentLength64 -gt 2MB){throw '树干整理草稿过大'};$data=Read-RequestJson $Context.Request
  if($data.id -ne $id -or $data.version -ne 1 -or ([string]$data.sourceId) -cnotmatch '^TRUNK_[A-Za-z0-9_]{1,90}$' -or [int]$data.sourceRevision -lt 1 -or @($data.edits.guides).Count -lt 1 -or @($data.edits.guides).Count -gt 256){throw '树干整理草稿格式无效'}
  if(Test-Path -LiteralPath $file){$old=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;if([long]$old.revision -ne [long]$data.revision){Send-Json $Context @{success=$false;message='此树干草稿已在另一窗口更新，请重新打开后继续'} 409;return $true}}
  $data|Add-Member -NotePropertyName revision -NotePropertyValue ([long]$data.revision+1) -Force;$data|Add-Member -NotePropertyName updatedAt -NotePropertyValue ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Force;$null=Write-AtomicText $file ($data|ConvertTo-Json -Depth 32 -Compress);Send-Json $Context @{success=$true;revision=$data.revision;updatedAt=$data.updatedAt};return $true
 }
 throw '不支持的树干整理草稿请求'
}
