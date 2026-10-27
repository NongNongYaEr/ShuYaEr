param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$entryPath=(Resolve-Path -LiteralPath $Executable).Path
$directory=Split-Path -Parent $entryPath
Add-Type -AssemblyName System.Windows.Forms
[void][Reflection.Assembly]::LoadFrom((Join-Path $directory 'Microsoft.Web.WebView2.Core.dll'))
[void][Reflection.Assembly]::LoadFrom((Join-Path $directory 'Microsoft.Web.WebView2.WinForms.dll'))
$assembly=[Reflection.Assembly]::LoadFrom($entryPath)
$formType=$assembly.GetType('BranchGeneratorFBXTool.MainForm',$true)
$flags=[Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Static
$allowed=$formType.GetMethod('IsBrowserPortAllowed',$flags)
$reserve=$formType.GetMethod('ReservePort',$flags)
if(-not $allowed -or -not $reserve){throw 'Compiled desktop port methods missing'}
# Chromium's HTTP restricted ports above the privileged range, plus bounds.
# The old actual host failed on4045 with ERR_UNSAFE_PORT before initializing DX12.
$blocked=@(0,80,1023,1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080,65536)
foreach($port in $blocked){if($allowed.Invoke($null,[object[]]@([int]$port))){throw "Unsafe browser port accepted: $port"}}
foreach($port in @(1024,4040,4044,4046,49152,65535)){if(-not $allowed.Invoke($null,[object[]]@([int]$port))){throw "Usable browser port rejected: $port"}}
$samples=@()
for($index=0;$index -lt 32;$index++){
 $port=[int]$reserve.Invoke($null,$null)
 if(-not $allowed.Invoke($null,[object[]]@($port))){throw "Compiled selector returned blocked port: $port"}
 # The production selector must release its reservation before its HTTP server
 # starts. Probe that actual selected socket with the same loopback interface.
 $probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
 try{$probe.Start();$samples+=$port}finally{$probe.Stop()}
}
$report=@{passed=$true;executable=$entryPath;entrySha256=(Get-FileHash -LiteralPath $entryPath -Algorithm SHA256).Hash.ToLowerInvariant();version=$assembly.GetName().Version.ToString();blockedCases=$blocked.Count;positiveCases=6;reservations=$samples;allReservationsReleased=$true;observed4045Rejected=$true}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Output),($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$report|ConvertTo-Json -Depth 8
