param([ValidateSet('树鸭儿V050.exe','树鸭儿V050.next.exe')][string]$ExecutableName='树鸭儿V050.exe')
$ErrorActionPreference='Stop'
$layoutRoot=Split-Path -Parent $PSScriptRoot
$layoutFolder=Join-Path $layoutRoot '.runtime/start-layout-test'
$layoutInput=Join-Path $layoutFolder 'plant-session/material-handoff'
[IO.Directory]::CreateDirectory($layoutInput)|Out-Null
Copy-Item -LiteralPath (Join-Path $layoutRoot '.runtime/integration-test/plant-session/material-handoff/11111111-1111-4111-8111-111111111111.glb') -Destination $layoutInput -Force
$layoutSource=@'
using System;using System.IO;using System.Drawing;using System.Reflection;using System.Threading.Tasks;using System.Collections.Generic;using System.Windows.Forms;using System.Web.Script.Serialization;
public static class TrunkStartLayoutProbe {
 static readonly BindingFlags Flags=BindingFlags.Instance|BindingFlags.NonPublic|BindingFlags.Public;
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();static Dictionary<string,object> reports=new Dictionary<string,object>();
 static object Call(object host,string name,params object[] args){return host.GetType().GetMethod(name,Flags).Invoke(host,args);}
 static bool Ready(object host,string name){return (bool)host.GetType().GetProperty(name,Flags).GetValue(host,null);}
 public static void Run(string root,string folder,string executable){
  Environment.SetEnvironmentVariable("BRANCHFORGE_DESKTOP_TEST_DIR",Path.Combine(folder,"plant-host"));Environment.SetEnvironmentVariable("BRANCHFORGE_SESSION_TEST_DIR",Path.Combine(folder,"plant-session"));
  var type=Assembly.LoadFrom(Path.Combine(root,executable)).GetType("BranchGeneratorFBXTool.MainForm",true);
  for(int pass=0;pass<2;pass++){
   int current=pass;var host=(Form)Activator.CreateInstance(type,Flags,null,new object[]{root},null);host.MinimumSize=Size.Empty;host.WindowState=FormWindowState.Normal;host.StartPosition=FormStartPosition.Manual;host.Location=new Point(-28000,-28000);host.ClientSize=new Size(1584,961);host.ShowInTaskbar=false;
   host.Shown+=async delegate{try{
    var deadline=DateTime.UtcNow.AddSeconds(90);while(!Ready(host,"IntegrationReady")){if(Ready(host,"IntegrationFailed")||DateTime.UtcNow>deadline)throw new Exception("Owned layout host startup failed");await Task.Delay(100);}
    if(current==0){
     string check=File.ReadAllText(Path.Combine(root,"tests/trunk-start-layout.browser.js"));reports["wide"]=Json.DeserializeObject(await (Task<string>)Call(host,"IntegrationAwait",check,15000));await (Task)Call(host,"CaptureIntegration",Path.Combine(folder,"start-wide.png"));
     host.ClientSize=new Size(1024,768);await Task.Delay(250);reports["narrow"]=Json.DeserializeObject(await (Task<string>)Call(host,"IntegrationAwait",check,15000));await (Task)Call(host,"CaptureIntegration",Path.Combine(folder,"start-narrow.png"));
     host.ClientSize=new Size(1584,961);await Task.Delay(150);reports["loaded"]=Json.DeserializeObject(await (Task<string>)Call(host,"IntegrationAwait",File.ReadAllText(Path.Combine(root,"tests/trunk-start-loaded.browser.js")),90000));await (Task)Call(host,"CaptureIntegration",Path.Combine(folder,"loaded-summary.png"));
    }else{
     string check=@"(async()=>{const p=window.__branchForge.trunkPreparation;await p.open();const sel=p.panel.querySelector('[data-drafts]');if(sel.options.length<2)throw Error('No saved owned draft');sel.value=sel.options[1].value;p.panel.querySelector('[data-resume]').click();const deadline=Date.now()+60000;while(!p.model||p.panel.dataset.busy!=='false'){if(Date.now()>deadline)throw Error('Draft did not resume');await new Promise(r=>setTimeout(r,100));}if(p.panel.classList.contains('trunk-start-screen')||p.draft.preparationRoute!=='rig'||!p.view)throw Error('Draft did not leave start screen');return{passed:true,route:p.draft.preparationRoute,viewReady:true};})()";reports["resumed"]=Json.DeserializeObject(await (Task<string>)Call(host,"IntegrationAwait",check,75000));
    }
   }catch(Exception error){reports["error"]=error.ToString();}finally{host.Close();}};Application.Run(host);if(reports.ContainsKey("error"))break;
  }
  reports["passed"]=!reports.ContainsKey("error");reports["windowsVisible"]=false;File.WriteAllText(Path.Combine(folder,"result.json"),Json.Serialize(reports));
 }
}
'@
Add-Type -TypeDefinition $layoutSource -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[TrunkStartLayoutProbe]::Run($layoutRoot,$layoutFolder,$ExecutableName)
$layoutReport=Get-Content -LiteralPath (Join-Path $layoutFolder 'result.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not $layoutReport.passed){throw $layoutReport.error}
$layoutReport|ConvertTo-Json -Depth 8
