param([string]$TestScript='tests/assembly-scale.browser.cjs')
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$testPort=$listener.LocalEndpoint.Port;$listener.Stop()
$serverFile=Join-Path (Get-Location) 'server.ps1'
$sessionTestRoot=Join-Path (Get-Location) ('.runtime\session-tests\'+[Guid]::NewGuid().ToString('N'))
$previousSessionTestRoot=$env:BRANCHFORGE_SESSION_TEST_DIR
$env:BRANCHFORGE_SESSION_TEST_DIR=$sessionTestRoot
$server=Start-Process powershell.exe -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',('"'+$serverFile+'"'),'-Port',$testPort,'-NoBrowser') -WindowStyle Hidden -PassThru
$env:BRANCHFORGE_SESSION_TEST_DIR=$previousSessionTestRoot
try {
 $testUrl="http://localhost:$testPort/"
 $ready=$false
 for($n=0;$n -lt 30;$n++){if($server.HasExited){throw 'Test server exited before becoming ready'};try{$null=Invoke-RestMethod ($testUrl+'api/config') -TimeoutSec 2;$ready=$true;break}catch{Start-Sleep -Milliseconds 250}}
 if(-not $ready){throw 'Test server did not start'}
 & .\runtime\node.exe $TestScript $testUrl
 if($LASTEXITCODE -ne 0){throw 'Assembly scale browser test failed'}
}finally{
 try{$null=Invoke-RestMethod ($testUrl+'api/shutdown') -Method Post -TimeoutSec 2}catch{}
 if(-not $server.HasExited){Stop-Process -Id $server.Id -ErrorAction SilentlyContinue}
}
