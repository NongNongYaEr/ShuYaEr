$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$testRoot=Join-Path (Get-Location) ('.runtime\session-tests\appearance-'+[Guid]::NewGuid().ToString('N'))
$previousRoot=$env:BRANCHFORGE_SESSION_TEST_DIR
$servers=@();$urls=@()
try {
    for($n=0;$n -lt 2;$n++) {
        $probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
        $probe.Start();$testPort=$probe.LocalEndpoint.Port;$probe.Stop()
        $env:BRANCHFORGE_SESSION_TEST_DIR=$testRoot
        $serverFile=Join-Path (Get-Location) 'server.ps1'
        $server=Start-Process powershell.exe -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',('"'+$serverFile+'"'),'-Port',$testPort,'-NoBrowser') -WindowStyle Hidden -PassThru
        $servers+=,$server;$url="http://localhost:$testPort/";$urls+=,$url
        $ready=$false
        for($attempt=0;$attempt -lt 30;$attempt++){if($server.HasExited){throw 'Isolated appearance server exited'};try{$null=Invoke-RestMethod ($url+'api/config') -TimeoutSec 2;$ready=$true;break}catch{Start-Sleep -Milliseconds 250}}
        if(-not $ready){throw 'Isolated appearance server did not start'}
    }
    $env:BRANCHFORGE_SESSION_TEST_DIR=$previousRoot
    & .\runtime\node.exe tests/appearance-save.browser.cjs $urls[0] $urls[1] $testRoot
    if($LASTEXITCODE -ne 0){throw 'Appearance save browser test failed'}
} finally {
    $env:BRANCHFORGE_SESSION_TEST_DIR=$previousRoot
    foreach($url in $urls){try{$null=Invoke-RestMethod ($url+'api/shutdown') -Method Post -TimeoutSec 2}catch{}}
    foreach($server in $servers){if(-not $server.HasExited){Stop-Process -Id $server.Id -ErrorAction SilentlyContinue}}
}
