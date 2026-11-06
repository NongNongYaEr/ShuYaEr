param([string]$ExecutableName,[switch]$CloseOnly,[switch]$RigTransfer,[switch]$CloseRace,[string]$Fixture)
$ErrorActionPreference='Stop'
$vRoot=Split-Path -Parent $PSScriptRoot
$release=Get-Content -LiteralPath (Join-Path $vRoot 'release-config.json') -Raw -Encoding UTF8|ConvertFrom-Json
if(-not $ExecutableName){$ExecutableName=$release.entry}
if($ExecutableName -notin @($release.entry,([IO.Path]::GetFileNameWithoutExtension($release.entry)+'.next.exe'))){throw 'Use the configured executable name'}
if(@($CloseOnly,$RigTransfer,$CloseRace).Where({$_}).Count -gt 1){throw 'Select one verification mode'}
if($CloseRace){
 if(-not $Fixture){throw 'Specify an owned GLB test fixture'}
 $env:SHUYAER_RELEASE_FIXTURE=(Resolve-Path -LiteralPath $Fixture).Path
 $env:SHUYAER_VERIFY_CLOSE_RACE='1'
 $releaseTestFolder=Join-Path $vRoot '.runtime/release-acceptance'
 foreach($name in @('close-race.json','close-failed.json')){
  $report=Join-Path $releaseTestFolder $name
  if(Test-Path -LiteralPath $report){Remove-Item -LiteralPath $report}
 }
}
$vReportName=if($CloseOnly){'component-close-result.json'}else{'result.json'}
$vResultFile=Join-Path $vRoot $(if($RigTransfer){'.runtime/rig-transfer-test/result.json'}else{'.runtime/integration-test/'+$vReportName})
if($CloseRace){$vResultFile=Join-Path $releaseTestFolder 'result.json'}
[IO.Directory]::CreateDirectory((Split-Path -Parent $vResultFile))|Out-Null
[IO.File]::WriteAllText($vResultFile,'{"passed":false,"state":"running"}',[Text.UTF8Encoding]::new($false))
$vJob=[IO.File]::ReadAllText((Join-Path $vRoot 'material/native/OwnedProcessJob.cs'))
$vRunner=@'
namespace TreeMaterialLab { public static class V050OwnedRunner {
 public static int Run(string exe,string folder,string arguments) {
  using(var job=new OwnedProcessJob()) {
   var info=new System.Diagnostics.ProcessStartInfo(exe,arguments){WorkingDirectory=folder,UseShellExecute=false,CreateNoWindow=true,WindowStyle=System.Diagnostics.ProcessWindowStyle.Hidden};
   using(var process=System.Diagnostics.Process.Start(info)){job.Attach(process);if(!process.WaitForExit(600000)){job.Dispose();process.WaitForExit(5000);throw new System.Exception("V050 verification timed out; only the owned process tree was stopped");}return process.ExitCode;}
  }
 }
} }
'@
Add-Type -TypeDefinition ($vJob+"`n"+$vRunner) -Language CSharp
$vCode=[TreeMaterialLab.V050OwnedRunner]::Run((Join-Path $vRoot $ExecutableName),$vRoot,$(if($CloseRace){'--verify-release'}elseif($RigTransfer){'--verify-rig-transfer'}elseif($CloseOnly){'--verify-component-close'}else{'--verify-integration'}))
if($vCode -ne 0){throw "V050 host failed: $vCode"}
$vResult=Get-Content -LiteralPath $vResultFile -Raw | ConvertFrom-Json
if(-not $vResult.passed){throw $vResult.error}
if($CloseRace){
 $race=Get-Content -LiteralPath (Join-Path $releaseTestFolder 'close-race.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if(-not $race.passed -or (Test-Path -LiteralPath (Join-Path $releaseTestFolder 'close-failed.json'))){throw 'V051 close regression failed'}
 $race|ConvertTo-Json
}
$vResult | ConvertTo-Json
