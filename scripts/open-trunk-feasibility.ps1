param([int]$Port = 19905)
$ErrorActionPreference = 'Stop'
$trunkToolRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sampleFile = Join-Path $trunkToolRoot '.runtime/trunk-feasibility/Buttress/prototype.json'
if (-not (Test-Path -LiteralPath $sampleFile)) { throw 'Samples are missing. Run scripts/prepare-trunk-feasibility.mjs first.' }
$url = 'http://127.0.0.1:' + $Port
$ready = $false
try { $response = Invoke-WebRequest -Uri ($url + '/trunk-feasibility.js') -UseBasicParsing -TimeoutSec 2; $ready = $response.Content.Contains('__trunkFeasibility') } catch { }
if (-not $ready) {
    $node = Join-Path $trunkToolRoot 'runtime/node.exe'
    $script = Join-Path $PSScriptRoot 'trunk-feasibility-preview.mjs'
    Start-Process -FilePath $node -ArgumentList @(('"'+$script+'"'), $Port) -WorkingDirectory $trunkToolRoot -WindowStyle Hidden |
        Out-Null
    for ($attempt = 0; $attempt -lt 20 -and -not $ready; $attempt++) {
        Start-Sleep -Milliseconds 250
        try { $response = Invoke-WebRequest -Uri ($url + '/trunk-feasibility.js') -UseBasicParsing -TimeoutSec 2; $ready = $response.Content.Contains('__trunkFeasibility') } catch { }
    }
}
if (-not $ready) { throw ('Preview did not start. Check whether port ' + $Port + ' is already used.') }
Start-Process ($url + '/?sample=Buttress')
