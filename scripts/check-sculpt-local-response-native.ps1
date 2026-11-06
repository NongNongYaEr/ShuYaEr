param([ValidateSet('树鸭儿V050.exe','树鸭儿V050.next.exe')][string]$ExecutableName='树鸭儿V050.exe',[switch]$UiOnly)
$ErrorActionPreference='Stop'
$featuredRoot=Split-Path -Parent $PSScriptRoot
$featuredFolder=Join-Path $featuredRoot '.runtime/sculpt-local-response-v2-test'
$featuredHost=Join-Path $featuredFolder 'host'
[IO.Directory]::CreateDirectory($featuredHost)|Out-Null
# A small isolated test service owns all project/recovery/output writes. Shared
# code, web assets and runtime binaries are read through junctions, not copied.
Get-ChildItem -LiteralPath (Join-Path $featuredRoot 'material') -File | Where-Object {$_.Extension -in '.js','.mjs','.json','.ps1'} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $featuredHost -Force}
foreach($featuredLink in @('web','core')){if(-not(Test-Path -LiteralPath (Join-Path $featuredHost $featuredLink))){New-Item -ItemType Junction -Path (Join-Path $featuredHost $featuredLink) -Target (Join-Path $featuredRoot ('material/'+$featuredLink))|Out-Null}}
$probeRuntime=Join-Path $featuredHost 'runtime';[IO.Directory]::CreateDirectory($probeRuntime)|Out-Null
$probeNode=Join-Path $probeRuntime 'node.exe';if(-not(Test-Path -LiteralPath $probeNode)){New-Item -ItemType HardLink -Path $probeNode -Target (Join-Path $featuredRoot 'material/runtime/node.exe')|Out-Null}
$probeNative=Join-Path $probeRuntime 'native';if(-not(Test-Path -LiteralPath $probeNative)){New-Item -ItemType Junction -Path $probeNative -Target (Join-Path $featuredRoot 'material/runtime/native')|Out-Null}
$probeMaterial=Join-Path $probeRuntime 'native-material';[IO.Directory]::CreateDirectory($probeMaterial)|Out-Null
Get-ChildItem -LiteralPath (Join-Path $featuredRoot 'material/runtime/native-material') -File | Where-Object {$_.Extension -in '.cso','.json'} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $probeMaterial -Force}
Copy-Item -LiteralPath (Join-Path $featuredRoot '.runtime/material-native-build/TreeMaterialDX12.dll') -Destination $probeMaterial -Force
$featuredInput=Join-Path $featuredHost '.runtime/integration-input';[IO.Directory]::CreateDirectory($featuredInput)|Out-Null
$featuredFixture=Get-Content -LiteralPath (Join-Path $featuredRoot '.runtime/integration-test/returned.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Copy-Item -LiteralPath (Join-Path $featuredRoot ('material/.runtime/integration-checkpoints/'+$featuredFixture.workflow.checkpointKey+'.treeproj')) -Destination (Join-Path $featuredInput '22222222-2222-4222-8222-222222222222.treeproj') -Force
$featuredSource=@'
using System;using System.IO;using System.Drawing;using System.Reflection;using System.Threading.Tasks;using System.Collections.Generic;using System.Windows.Forms;using System.Web.Script.Serialization;
public static class SculptLocalResponseProbe {
 static readonly BindingFlags Flags=BindingFlags.Instance|BindingFlags.NonPublic|BindingFlags.Public;
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=8000000};
 static object Call(object host,string name,params object[] args){return host.GetType().GetMethod(name,Flags).Invoke(host,args);}
 static bool Ready(object host){return (bool)host.GetType().GetProperty("IntegrationReady",Flags).GetValue(host,null);}
 static Task<string> Await(object host,string code,int timeout){return (Task<string>)Call(host,"IntegrationAwait",code,timeout);}
 public static void Run(string root,string folder,string service,string exe,bool uiOnly){
  var type=Assembly.LoadFrom(Path.Combine(root,exe)).GetType("TreeMaterialLab.MainForm",true);var host=(Form)Activator.CreateInstance(type,Flags,null,new object[]{service},null);host.WindowState=FormWindowState.Normal;host.StartPosition=FormStartPosition.Manual;host.Location=new Point(-28000,-28000);host.ClientSize=new Size(1584,961);host.ShowInTaskbar=false;string report=null;
  var pulse=new System.Windows.Forms.Timer{Interval=2000};bool pulsing=false;pulse.Tick+=async delegate{if(pulsing||!Ready(host))return;pulsing=true;try{var value=await (Task<string>)Call(host,"IntegrationEvaluate","({phase:window.__featuredPhase,state:window.treeLab?.surfaceWorkbench?.state})");File.WriteAllText(Path.Combine(folder,"progress.json"),value);}catch{}finally{pulsing=false;}};pulse.Start();
  host.Shown+=async delegate{try{var end=DateTime.UtcNow.AddSeconds(45);while(!Ready(host)){if(DateTime.UtcNow>end)throw new Exception("Isolated material startup timeout");await Task.Delay(100);}
   await Await(host,"(async()=>{const r=await fetch('/api/integration-input/22222222-2222-4222-8222-222222222222?kind=project');if(!r.ok)throw Error('Missing owned bundle');await window.treeMaterialModule.restoreBundle(await r.arrayBuffer());window.treeMaterialModule.setStage('material');return true;})()",120000);
   report=await Await(host,File.ReadAllText(Path.Combine(root,uiOnly?"tests/sculpt-local-response.browser.js":"tests/featured-bark.browser.js")),600000);
   if(uiOnly){string raw=await (Task<string>)Call(host,"IntegrationEvaluate","window.__featuredDetail"),url=Json.Deserialize<string>(raw);File.WriteAllBytes(Path.Combine(folder,"sculpt-bark-detail-native.png"),Convert.FromBase64String(url.Substring(url.IndexOf(',')+1)));}
   string swatchKeys=await (Task<string>)Call(host,"IntegrationEvaluate","Object.keys(window.__sculptSwatches||{})");foreach(string id in Json.Deserialize<string[]>(swatchKeys)){string raw=await (Task<string>)Call(host,"IntegrationEvaluate","window.__sculptSwatches["+Json.Serialize(id)+"]"),url=Json.Deserialize<string>(raw);File.WriteAllBytes(Path.Combine(folder,id+"-native.png"),Convert.FromBase64String(url.Substring(url.IndexOf(',')+1)));}
   if(!uiOnly)foreach(string id in new[]{"plane-mosaic","plane-peeling","plane-aged","firmiana-green","crape-cloud","lacebark-scales"}){string raw=await (Task<string>)Call(host,"IntegrationEvaluate","window.__featuredSwatches["+Json.Serialize(id)+"]"),url=Json.Deserialize<string>(raw);File.WriteAllBytes(Path.Combine(folder,id+"-native.png"),Convert.FromBase64String(url.Substring(url.IndexOf(',')+1)));}
   await (Task)Call(host,"CaptureIntegration",Path.Combine(folder,"sculpt-controls.png"));
  }catch(Exception error){report=Json.Serialize(new {passed=false,error=error.ToString(),windowsVisible=false});try{var detail=(Task<string>)Call(host,"IntegrationEvaluate","({phase:window.__featuredPhase,project:window.treeMaterialModule?.getSnapshot()?.featuredBark,toasts:[...document.querySelectorAll('.toast')].map(x=>x.textContent)})");var continuation=detail.ContinueWith(t=>{if(t.Status==TaskStatus.RanToCompletion)File.WriteAllText(Path.Combine(folder,"failure-detail.json"),t.Result);});}catch{}}
   finally{pulse.Stop();File.WriteAllText(Path.Combine(folder,uiOnly?"ui-result.json":"result.json"),report??"{\"passed\":false}");host.Close();}};
  Application.Run(host);
 }
}
'@
Add-Type -TypeDefinition $featuredSource -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[SculptLocalResponseProbe]::Run($featuredRoot,$featuredFolder,$featuredHost,$ExecutableName,[bool]$UiOnly)
$featuredReport=Get-Content -LiteralPath (Join-Path $featuredFolder $(if($UiOnly){'ui-result.json'}else{'result.json'})) -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not $featuredReport.passed){throw $featuredReport.error}
[PSCustomObject]@{passed=$featuredReport.passed;backend=$featuredReport.backend;choices=$featuredReport.choices.Count;newMaterials=$featuredReport.newMaterials;editableRestored=$featuredReport.editableRestored;output=$featuredReport.output.folder}|ConvertTo-Json -Compress
