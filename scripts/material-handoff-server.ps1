# Private V050 staging files. IDs are capabilities, never filesystem paths supplied by a page.
function Invoke-MaterialHandoffRoute($Context,[string]$Path){
 if($Path -cne '/api/material-handoff'){return $false}
 $origin=[string]$Context.Request.Headers['Origin'];if($origin -and $origin -ne $Context.Request.Url.GetLeftPart([UriPartial]::Authority)){throw '不允许跨来源的树干传递'}
 $id=[string]$Context.Request.QueryString['id'];if($id -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'){throw '传递编号无效'}
 $project=$Context.Request.QueryString['kind'] -ceq 'project';$limit=if($project){200000000}else{150000000};$extension=if($project){'.treeproj'}else{'.glb'}
 $folder=Join-Path $script:ConfigDir 'material-handoff';[IO.Directory]::CreateDirectory($folder)|Out-Null;$file=Join-Path $folder ($id+$extension);$method=$Context.Request.HttpMethod
 if($method -eq 'GET'){if(-not(Test-Path -LiteralPath $file -PathType Leaf)){Send-Json $Context @{success=$false;message='传递文件不存在'} 404}else{Send-File $Context $file};return $true}
 if($method -eq 'DELETE'){if(Test-Path -LiteralPath $file -PathType Leaf){Remove-Item -LiteralPath $file};Send-Json $Context @{success=$true};return $true}
 if($method -ne 'POST'){throw '不支持的树干传递请求'}
 if($Context.Request.ContentType -ne 'application/octet-stream' -or $Context.Request.ContentLength64 -le 0 -or $Context.Request.ContentLength64 -gt $limit){throw '树干传递超出容量预算'}
 if(Test-Path -LiteralPath $file){throw '传递编号已经使用'}
 $temporary=$file+'.part';$total=0L
 try{
  $output=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew)
  try{$buffer=New-Object byte[] 1048576;while(($count=$Context.Request.InputStream.Read($buffer,0,$buffer.Length)) -gt 0){$total+=$count;if($total -gt $limit){throw '树干传递超出容量预算'};$output.Write($buffer,0,$count)}}finally{$output.Dispose()}
  $header=New-Object byte[] 12;$stream=[IO.File]::OpenRead($temporary);try{$read=$stream.Read($header,0,12)}finally{$stream.Dispose()}
  if($project){if($read -ne 12 -or [Text.Encoding]::ASCII.GetString($header,0,8) -cne 'TMLPROJ1'){throw '需要完整材质编辑包'}}elseif($read -ne 12 -or [BitConverter]::ToUInt32($header,0) -ne 0x46546c67 -or [BitConverter]::ToUInt32($header,4) -ne 2 -or [BitConverter]::ToUInt32($header,8) -ne $total){throw '需要完整GLB2文件'}
  [IO.File]::Move($temporary,$file);Send-Json $Context @{success=$true;id=$id;bytes=$total};return $true
 }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
