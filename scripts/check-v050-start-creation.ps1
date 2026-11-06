param([ValidateSet('树鸭儿V050.exe','树鸭儿V050.next.exe')][string]$ExecutableName='树鸭儿V050.exe')
$ErrorActionPreference='Stop'
$probeRoot=Split-Path -Parent $PSScriptRoot
$probeFolder=Join-Path $probeRoot '.runtime/start-creation-test'
$probeInput=Join-Path $probeFolder 'plant-session/material-handoff'
[IO.Directory]::CreateDirectory($probeInput)|Out-Null
Copy-Item -LiteralPath (Join-Path $probeRoot '.runtime/integration-test/plant-session/material-handoff/11111111-1111-4111-8111-111111111111.glb') -Destination $probeInput -Force
$probeSource=@'
using System;using System.IO;using System.Reflection;using System.Threading.Tasks;using System.Windows.Forms;
public static class V050StartCreationProbe {
 static readonly BindingFlags Flags=BindingFlags.Instance|BindingFlags.NonPublic|BindingFlags.Public;
 static object Call(object host,string name,params object[] args){return host.GetType().GetMethod(name,Flags).Invoke(host,args);}
 static bool Ready(object host,string name){return (bool)host.GetType().GetProperty(name,Flags).GetValue(host,null);}
 public static void Run(string root,string folder,string executable){
  Environment.SetEnvironmentVariable("BRANCHFORGE_DESKTOP_TEST_DIR",Path.Combine(folder,"plant-host"));
  Environment.SetEnvironmentVariable("BRANCHFORGE_SESSION_TEST_DIR",Path.Combine(folder,"plant-session"));
  var assembly=Assembly.LoadFrom(Path.Combine(root,executable));
  var type=assembly.GetType("BranchGeneratorFBXTool.MainForm",true);
  var host=(Form)Activator.CreateInstance(type,Flags,null,new object[]{root},null);
  string report=Path.Combine(folder,"result.json");File.WriteAllText(report,"{\"passed\":false,\"state\":\"running\"}");
  host.Shown+=async delegate {
   try{
    var deadline=DateTime.UtcNow.AddSeconds(90);
    while(!Ready(host,"IntegrationReady")){if(Ready(host,"IntegrationFailed")||DateTime.UtcNow>deadline)throw new Exception("Owned host startup failed");await Task.Delay(100);}
    string script=@"(async()=>{
     const p=window.__branchForge.trunkPreparation;
     await p.open();
     const response=await fetch('/api/material-handoff?id=11111111-1111-4111-8111-111111111111');
     if(!response.ok)throw Error('Missing owned test fixture');
     await p.importFile(new File([await response.arrayBuffer()],'开始创作验收.glb',{type:'model/gltf-binary'}));
     const legacy={...p.model,material_workflow:{version:1,geometryKey:p.model.source.sha256,needsSkeleton:false,rigConfirmed:false}};
     await p.close({resume:false});await p.open({model:legacy});
     const button=p.panel.querySelector('[data-use]');
     if(button.disabled)throw Error('Legacy draft is still locked by confirmation');
     button.click();const deadline=Date.now()+60000;
     while(p.panel.open||!(window.__branchForge.asset.authoring.imported_trunks?.mounts||[]).some(m=>m.asset_id===legacy.id)){
      if(Date.now()>deadline)throw Error('Start creation did not mount the trunk: '+p.panel.querySelector('[data-status]').textContent);
      await new Promise(resolve=>setTimeout(resolve,100));
     }
     if(p.panel.open||!p.model.material_workflow.rigConfirmed)throw Error('Draft failed to finish automatic binding check');
     const asset=window.__branchForge.asset.authoring.imported_trunks.assets.find(m=>m.id===legacy.id);
     if(asset.source.sha256!==legacy.source.sha256)throw Error('Mounted trunk source changed');
     return {passed:true,windowsVisible:false,legacyDraftButtonEnabled:true,automaticCheckOnUse:true,creationMounted:true,sourcePreserved:true};
    })()";
    string result=await (Task<string>)Call(host,"IntegrationAwait",script,80000);File.WriteAllText(report,result);
   }catch(Exception error){File.WriteAllText(report,new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new {passed=false,error=error.ToString()}));}
   finally{host.Close();}
  };
  Application.Run(host);
 }
}
'@
Add-Type -TypeDefinition $probeSource -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[V050StartCreationProbe]::Run($probeRoot,$probeFolder,$ExecutableName)
$probeReport=Get-Content -LiteralPath (Join-Path $probeFolder 'result.json') -Raw | ConvertFrom-Json
if(-not $probeReport.passed){throw $probeReport.error}
$probeReport|ConvertTo-Json
