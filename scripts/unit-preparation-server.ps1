# User-owned preparation drafts. Raw sources are content-addressed and stored once.
$script:UnitPreparationDir=Join-Path $script:ConfigDir 'unit-preparation'
function Get-UnitPreparationPath([string]$Id,[switch]$Source,[switch]$Summary){
    if($Source){if($Id -notmatch '^[a-f0-9]{64}$'){throw '整理源文件 ID 无效'};return Join-Path $script:UnitPreparationDir ('sources/'+$Id+'.glb')}
    if($Id -notmatch '^[a-f0-9-]{36}$'){throw '整理草稿 ID 无效'}
    return Join-Path $script:UnitPreparationDir ('drafts/'+$Id+$(if($Summary){'.meta.json'}else{'.json'}))
}
function Invoke-UnitPreparationRoute($Context,[string]$Path){
    if(-not $Path.StartsWith('/api/unit-preparation')){return $false}
    $method=$Context.Request.HttpMethod;$id=[string]$Context.Request.QueryString['id']
    if($Path -eq '/api/unit-preparation-drafts' -and $method -eq 'GET'){
        $folder=Join-Path $script:UnitPreparationDir 'drafts';$items=@()
        if(Test-Path -LiteralPath $folder){$items=@(Get-ChildItem -LiteralPath $folder -Filter '*.meta.json' -File | ForEach-Object {try{$item=Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json;if(Test-Path -LiteralPath (Get-UnitPreparationPath $item.id)){$item}}catch{}} | Sort-Object updatedAt -Descending)}
        Send-Json $Context @{success=$true;items=$items};return $true
    }
    if($Path -eq '/api/unit-preparation-source'){
        $file=Get-UnitPreparationPath $id -Source
        if($method -eq 'GET'){if(Test-Path -LiteralPath $file){Send-File $Context $file}else{Send-Json $Context @{success=$false;message='整理原始 GLB 已缺失'} 404};return $true}
        if($method -eq 'POST'){
            if($Context.Request.ContentLength64 -lt 1 -or $Context.Request.ContentLength64 -gt 80MB){throw '整理 GLB 需在 80 MB 内'}
            $bytes=Read-RequestBytes $Context.Request;$sha=[Security.Cryptography.SHA256]::Create()
            try{$actual=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
            if($actual -ne $id -or $bytes.Length -lt 12 -or [BitConverter]::ToUInt32($bytes,0) -ne 0x46546c67){throw '整理 GLB 内容校验失败'}
            if(-not(Test-Path -LiteralPath $file)){$null=Write-AtomicBytes $file $bytes}
            Send-Json $Context @{success=$true;id=$id};return $true
        }
    }
    if($Path -eq '/api/unit-preparation-draft'){
        $file=Get-UnitPreparationPath $id;$summary=Get-UnitPreparationPath $id -Summary
        if($method -eq 'GET'){if(Test-Path -LiteralPath $file){Send-File $Context $file}else{Send-Json $Context @{success=$false;message='整理草稿已不存在'} 404};return $true}
        if($method -eq 'POST'){
            if($Context.Request.ContentLength64 -lt 1 -or $Context.Request.ContentLength64 -gt 12MB){throw '整理草稿过大'}
            $data=Read-RequestJson $Context.Request
            if($data.id -ne $id -or $data.version -ne 1 -or ([string]$data.name).Length -gt 80 -or @($data.units).Count -gt 64){throw '整理草稿格式无效'}
            $source=Get-UnitPreparationPath ([string]$data.sourceId) -Source;if(-not(Test-Path -LiteralPath $source)){throw '请先保存原始 GLB'}
            if(Test-Path -LiteralPath $file){$previous=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;if([long]$previous.revision -gt [long]$data.revision){Send-Json $Context @{success=$false;message='草稿已在另一个窗口更新，请重新打开后继续'} 409;return $true}}
            $used=New-Object 'Collections.Generic.HashSet[int]'
            foreach($unit in @($data.units)){if(-not $unit.id -or @($unit.faces).Count -lt 1 -or @($unit.faces).Count -gt 60000){throw '单元选区无效'};foreach($face in $unit.faces){if([double]$face -ne [int]$face -or [int]$face -lt 0 -or [int]$face -ge 500000 -or -not $used.Add([int]$face)){throw '选区面片重复或超出范围'}}}
            foreach($unit in @($data.units)){if($null -ne $unit.size_reference){$ref=$unit.size_reference;foreach($key in @('a','b')){$point=$ref.$key;if($null -ne $point){if(@($point).Count -ne 3){throw '尺寸参照点无效'};foreach($n in $point){$value=[double]$n;if([double]::IsNaN($value) -or [double]::IsInfinity($value)){throw '尺寸参照点无效'}}}};if($null -ne $ref.cm){$value=[double]$ref.cm;if($value -le 0 -or [double]::IsNaN($value) -or [double]::IsInfinity($value)){throw '参照长度无效'}}}}
            $data|Add-Member -NotePropertyName revision -NotePropertyValue ([long]$data.revision+1) -Force;$data|Add-Member -NotePropertyName updatedAt -NotePropertyValue ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Force
            $null=Write-AtomicText $file ($data|ConvertTo-Json -Depth 24 -Compress)
            $meta=@{id=$id;name=[string]$data.name;sourceName=[string]$data.sourceName;sourceId=[string]$data.sourceId;count=@($data.units).Count;updatedAt=$data.updatedAt;bytes=(Get-Item -LiteralPath $source).Length}
            $null=Write-AtomicText $summary ($meta|ConvertTo-Json -Compress)
            Send-Json $Context @{success=$true;revision=$data.revision;updatedAt=$data.updatedAt};return $true
        }
        if($method -eq 'DELETE'){
            $old=$null;if(Test-Path -LiteralPath $file){$old=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;Remove-Item -LiteralPath $file -Force};if(Test-Path -LiteralPath $summary){Remove-Item -LiteralPath $summary -Force}
            if($old){$others=@(Get-ChildItem -LiteralPath (Join-Path $script:UnitPreparationDir 'drafts') -Filter '*.meta.json' -File | ForEach-Object {try{Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json}catch{}} | Where-Object sourceId -eq $old.sourceId);if(-not $others.Count){$source=Get-UnitPreparationPath ([string]$old.sourceId) -Source;if(Test-Path -LiteralPath $source){Remove-Item -LiteralPath $source -Force}}}
            Send-Json $Context @{success=$true};return $true
        }
    }
    Send-Json $Context @{success=$false;message='不支持的整理请求'} 400;return $true
}
