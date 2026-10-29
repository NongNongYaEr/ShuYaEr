# Data-only, streaming resource exchange. Request IDs select registered files;
# client paths are never accepted. Child jobs have private work directories.
. (Join-Path $script:AppDir 'scripts/plant-unit-thumbnail-server.ps1')
. (Join-Path $script:AppDir 'scripts/trunk-model-server.ps1')
$script:PlantPackRoot=Join-Path $script:AppDir 'assets/plant-package-library'
if($env:BRANCHFORGE_SESSION_TEST_DIR){$script:PlantPackRoot=Join-Path $env:BRANCHFORGE_SESSION_TEST_DIR 'plant-package-library'}
$script:PlantPackJobs=Join-Path $script:ConfigDir 'plant-pack-jobs'
$script:PlantPackSources=@{}
function Get-PlantPackJob([string]$Id){if($Id -cnotmatch '^[a-f0-9]{32}$'){throw '资源包任务标识无效'};return Join-Path $script:PlantPackJobs $Id}
function Start-PlantPackJob($Job,[string]$Id=''){
    if(-not $Id){$Id=[Guid]::NewGuid().ToString('N')};$folder=Get-PlantPackJob $Id
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    $Job.library=$script:PlantPackRoot
    Write-AtomicBytes (Join-Path $folder 'job.json') ([Text.Encoding]::UTF8.GetBytes(($Job|ConvertTo-Json -Depth 16 -Compress))) | Out-Null
    Write-AtomicBytes (Join-Path $folder 'status.json') ([Text.Encoding]::UTF8.GetBytes('{"state":"running","phase":"任务已排队"}')) | Out-Null
    $packArguments=@('--experimental-loader','./vendor-loader.mjs',('"'+(Join-Path $script:AppDir 'scripts/plant-pack-cli.mjs')+'"'),('"'+(Join-Path $folder 'job.json')+'"'))
    $child=Start-Process -FilePath (Join-Path $script:AppDir 'runtime/node.exe') -ArgumentList $packArguments -WorkingDirectory $script:AppDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $folder 'stdout.log') -RedirectStandardError (Join-Path $folder 'stderr.log')
    Write-AtomicBytes (Join-Path $folder 'pid.txt') ([Text.Encoding]::UTF8.GetBytes([string]$child.Id)) | Out-Null
    return @{success=$true;id=$Id}
}
function Get-PlantPackSources {
    $script:PlantPackSources=@{};$rows=New-Object Collections.Generic.List[object]
    foreach($spec in @(@{type='plant';folder=$script:TreeTemplateDir;suffix='.branch.json'},@{type='branch';folder=$script:BranchAssetDir;suffix='.branchasset.json'},@{type='units';folder=$script:PlantUnitDir;suffix='.plantunits.json'},@{type='prefab';folder=$script:BranchPrefabDir;suffix='.prefab.json'})){
        if(-not(Test-Path -LiteralPath $spec.folder)){continue}
        foreach($file in Get-ChildItem -LiteralPath $spec.folder -Filter '*.meta.json' -File){
            try{$meta=Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8|ConvertFrom-Json;$full=$file.FullName -replace '\.meta\.json$', $spec.suffix
                if($spec.type -eq 'plant'){$full=Resolve-ProjectLibraryFile ([string]$meta.path)}
                if(-not(Test-Path -LiteralPath $full -PathType Leaf)){continue}
                $key=$spec.type+':'+[string]$meta.id;$record=@{key=$key;id=[string]$meta.id;type=$spec.type;name=[string]$meta.name;revision=$(if($meta.revision){[int]$meta.revision}else{1});thumbnail=[string]$meta.thumbnail;file=$full}
                if($spec.type -eq 'units'){try{$source=Get-PlantUnitThumbnailSource $record.id;$record.thumbnail=Read-PlantUnitThumbnail $source.sourceKey;$record.previewSourceKey=$source.sourceKey}catch{Write-ServerLog ('叶花果预览暂不可用：'+$record.name+' '+$_.Exception.Message)}}
                if($spec.type -eq 'plant'){$record.kind=if($meta.kind -eq 'VINE'){'VINE'}else{'TREE'}}
                $script:PlantPackSources[$key]=$record
                $rows.Add(@{key=$key;id=$record.id;type=$record.type;name=$record.name;revision=$record.revision;speciesName=[string]$meta.speciesName;category=[string]$meta.category;tags=$meta.tags;count=$meta.count;counts=$meta.counts;archived=[bool]$meta.archived;previewSourceKey=$record.previewSourceKey;thumbnail=$(if($record.type -eq 'plant' -and $meta.previewPath){'/api/project-preview?id='+[Uri]::EscapeDataString($record.id)}else{$record.thumbnail})})
            }catch{Write-ServerLog ('资源包目录跳过无效条目：'+$file.Name+' '+$_.Exception.Message)}
        }
    }
    foreach($kind in @('bark','detail','combination','profile','root')){$folder=Join-Path $script:TrunkPresetDir $kind;if(-not(Test-Path -LiteralPath $folder)){continue};foreach($file in Get-ChildItem -LiteralPath $folder -Filter '*.trunkpreset.json' -File){try{$meta=Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8|ConvertFrom-Json;$key='material:'+$kind+':'+[string]$meta.id;$script:PlantPackSources[$key]=@{key=$key;id=[string]$meta.id;type='material';name=[string]$meta.name;kind=$kind;file=$file.FullName};$rows.Add(@{key=$key;type='material';name=[string]$meta.name;revision=1})}catch{}}}
    $trunkCatalog=Join-Path $script:TrunkModelDir 'catalog.json'
    if(Test-Path -LiteralPath $trunkCatalog){$catalog=Get-Content -LiteralPath $trunkCatalog -Raw -Encoding UTF8|ConvertFrom-Json;foreach($item in $catalog.items){$key='trunk:'+([string]$item.id);$script:PlantPackSources[$key]=@{key=$key;type='trunk';trunkId=[string]$item.id;trunkLibrary=$script:TrunkModelDir;id=[string]$item.id;name=[string]$item.name;revision=[int]$item.revision};$rows.Add(@{key=$key;type='trunk';id=[string]$item.id;name=[string]$item.name;revision=[int]$item.revision;thumbnail=[string]$item.thumbnail;triangles=$item.triangles;dimensions=$item.dimensions})}}
    return @($rows.ToArray())
}
function Invoke-PlantPackRoute($Context,[string]$Path){
    if(Invoke-TrunkModelRoute $Context $Path){return $true}
    if(Invoke-PlantUnitThumbnailRoute $Context $Path){return $true}
    if(-not $Path.StartsWith('/api/plant-packs/')){return $false};$method=$Context.Request.HttpMethod;$query=$Context.Request.QueryString
    if($Path -eq '/api/plant-packs/library' -and $method -eq 'GET'){$file=Join-Path $script:PlantPackRoot 'catalog.json';if(Test-Path -LiteralPath $file){$catalog=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;foreach($asset in $catalog.assets){if($asset.type -eq 'units'){$null=Add-PlantUnitThumbnailToSummary $asset}};Send-Json $Context $catalog}else{Send-Json $Context @{success=$true;packages=@();assets=@()}};return $true}
    if($Path -eq '/api/plant-packs/sources' -and $method -eq 'GET'){Send-Json $Context @{success=$true;items=@(Get-PlantPackSources)};return $true}
    if($Path -eq '/api/plant-packs/upload' -and $method -eq 'POST'){
        $kind=[string]$query['type'];if($kind -cnotin @('plantpack','plant','trunk','prefab','branch','units','material')){throw '上传类型无效'}
        $limit=if($kind -eq 'plantpack'){4294967296L}else{268435456L};if($Context.Request.ContentLength64 -gt $limit){throw '文件超过资源包容量限制'}
        $id=[Guid]::NewGuid().ToString('N');$folder=Get-PlantPackJob $id;New-Item -ItemType Directory -Force -Path $folder|Out-Null
        $name=if($kind -eq 'plantpack'){'input.plantpack'}else{'input.json'};$target=Join-Path $folder $name;$temp=$target+'.upload';$output=[IO.File]::Create($temp)
        try{$buffer=New-Object byte[] 1048576;$total=0L;while(($count=$Context.Request.InputStream.Read($buffer,0,$buffer.Length)) -gt 0){$total+=$count;if($total -gt $limit){throw '文件超过容量限制'};$output.Write($buffer,0,$count)}}finally{$output.Dispose()}
        Move-Item -LiteralPath $temp -Destination $target
        Write-AtomicBytes (Join-Path $folder 'upload.json') ([Text.Encoding]::UTF8.GetBytes((@{type=$kind}|ConvertTo-Json -Compress)))|Out-Null
        if($kind -eq 'plantpack'){Send-Json $Context (Start-PlantPackJob @{action='inspect'} $id)}else{Send-Json $Context @{success=$true;id=$id}};return $true
    }
    if($Path -eq '/api/plant-packs/start' -and $method -eq 'POST'){
        $body=Read-RequestJson $Context.Request;$action=[string]$body.action
        $job=@{action=$action}
        if($action -eq 'export'){
            if(-not $body.sources -or @($body.sources).Count -gt 1000){throw '请选择 1–1000 项资源'}
            $sources=@();foreach($source in $body.sources){
                if($source.uploadId){$folder=Get-PlantPackJob ([string]$source.uploadId);$upload=Get-Content -LiteralPath (Join-Path $folder 'upload.json') -Raw -Encoding UTF8|ConvertFrom-Json;if($upload.type -eq 'plantpack'){throw '请选择资源数据'};$sources+=@{type=[string]$upload.type;file=(Join-Path $folder 'input.json');name=[string]$source.name;id=[string]$source.id;revision=$(if($source.revision){[int]$source.revision}else{1})}}
                elseif($source.packageAlias -cmatch '^PACK_[a-f0-9]{64}$'){$sources+=@{type=[string]$source.type;packageAlias=[string]$source.packageAlias;originalId=[string]$source.originalId;revision=[int]$source.revision;name=[string]$source.name}}
                elseif($script:PlantPackSources.ContainsKey([string]$source.key)){$sources+=$script:PlantPackSources[[string]$source.key]}
                else{throw '资源目录已变化，请关闭面板后重试'}
            };foreach($selected in $sources){if($selected.type -eq 'units'){$source=Get-PlantUnitThumbnailSource $(if($selected.packageAlias){[string]$selected.packageAlias}else{[string]$selected.id});if($source){$selected.thumbnail=Read-PlantUnitThumbnail $source.sourceKey}}};$job.sources=$sources;$job.metadata=$body.metadata
        }elseif($action -eq 'install'){$folder=Get-PlantPackJob ([string]$body.previewId);$status=Get-Content -LiteralPath (Join-Path $folder 'status.json') -Raw -Encoding UTF8|ConvertFrom-Json;if($status.state -ne 'complete' -or -not $status.result.compatible){throw '请先完成资源包检查'};$job.file=Join-Path $folder 'input.plantpack';$job.copyConflict=[bool]$body.copyConflict}
        elseif($action -eq 'resolve'){if([string]$body.id -cnotmatch '^PACK_[a-f0-9]{64}$'){throw '包内资源标识无效'};$job.id=[string]$body.id}
        elseif($action -in @('reexport','remove','metadata')){$job.key=[string]$body.key;$job.patch=$body.patch;$job.name=[string]$body.name}
        else{throw '不支持的资源包操作'}
        Send-Json $Context (Start-PlantPackJob $job);return $true
    }
    if($Path -in @('/api/plant-packs/job','/api/plant-packs/download','/api/plant-packs/asset','/api/plant-packs/cancel','/api/plant-packs/reveal','/api/plant-packs/save')){
        $folder=Get-PlantPackJob ([string]$query['id']);$statusFile=Join-Path $folder 'status.json'
        if($Path -eq '/api/plant-packs/cancel') {if($method -ne 'POST'){throw '请求方法无效'};Write-AtomicBytes (Join-Path $folder 'cancel.flag') ([byte[]]@())|Out-Null;Send-Json $Context @{success=$true};return $true}
        if(-not(Test-Path -LiteralPath $statusFile)){throw '资源包任务不存在'}
        if($Path -eq '/api/plant-packs/job'){
            $state=Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8|ConvertFrom-Json
            if($state.state -eq 'running'){$pidFile=Join-Path $folder 'pid.txt';if(Test-Path -LiteralPath $pidFile){$worker=Get-Process -Id ([int](Get-Content -LiteralPath $pidFile -Raw)) -ErrorAction SilentlyContinue;if(-not $worker -and (Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8|ConvertFrom-Json).state -eq 'running'){Send-Json $Context @{state='failed';message='后台任务已停止，请重试；已有工程和资源包保留。'};return $true}}}
            Send-Bytes $Context ([IO.File]::ReadAllBytes($statusFile)) 'application/json; charset=utf-8';return $true
        }
        $status=Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8|ConvertFrom-Json;if($status.state -ne 'complete'){throw '任务尚未完成'}
        if($Path -eq '/api/plant-packs/asset'){Send-File $Context (Join-Path $folder 'asset.json');return $true}
        $output=Join-Path $folder 'output.plantpack';if(-not(Test-Path -LiteralPath $output)){throw '导出文件不存在'}
        if($Path -eq '/api/plant-packs/save'){
            if($method -ne 'POST'){throw '请求方法无效'};$dialog=New-Object Windows.Forms.SaveFileDialog;$dialog.Filter='植物资源包 (*.plantpack)|*.plantpack';$dialog.FileName=([string]$status.result.name -replace '[<>:"/\\|?*]','_')+'.plantpack';$dialog.FileName=([IO.Path]::GetFileNameWithoutExtension($dialog.FileName))+$(if($status.result.metadata.version){'_V'+[string]$status.result.metadata.version}else{''})+'.plantpack';$dialog.OverwritePrompt=$true
            try{if($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){Send-Json $Context @{success=$true;cancelled=$true};return $true};$target=$dialog.FileName;$temp=$target+'.'+[Guid]::NewGuid().ToString('N')+'.partial';[IO.File]::Copy($output,$temp,$false);Move-Item -LiteralPath $temp -Destination $target -Force;Write-AtomicBytes (Join-Path $folder 'saved.txt') ([Text.Encoding]::UTF8.GetBytes($target))|Out-Null;Send-Json $Context @{success=$true;path=$target}}finally{$dialog.Dispose()};return $true
        }
        if($Path -eq '/api/plant-packs/reveal'){if($method -ne 'POST'){throw '请求方法无效'};$saved=Join-Path $folder 'saved.txt';$target=if(Test-Path -LiteralPath $saved){Get-Content -LiteralPath $saved -Raw -Encoding UTF8}else{$output};Start-Process explorer.exe -ArgumentList @('/select,',('"'+$target+'"')) -WindowStyle Normal|Out-Null;Send-Json $Context @{success=$true};return $true}
        $Context.Response.Headers['Content-Disposition']='attachment; filename="resource.plantpack"';Send-File $Context $output;return $true
    }
    throw '资源包接口不存在'
}
