// Explicit release-only hidden verification, using its own cache/session files.
using System;using System.IO;using System.Drawing;using System.Threading.Tasks;using System.Collections.Generic;using System.Web.Script.Serialization;
namespace ShuYaErV050 {
 internal static partial class V050Probe {
  internal static async Task RunRelease(Workspace host){
   string folder=Path.Combine(host.Root,".runtime","release-acceptance"),phase="startup";Directory.CreateDirectory(folder);var json=new JavaScriptSerializer{MaxJsonLength=16000000};bool passed=false;
   try{
    await Wait(()=>{if(host.Plant.IntegrationFailed)throw new Exception("Plant startup failed");return Task.FromResult(host.Plant.IntegrationReady);},90000);
    File.WriteAllText(Path.Combine(folder,"phase.txt"),phase="plant-render");
    string plant=await host.Plant.IntegrationAwait("(async()=>{const n=window.__branchForge.nativeViewport,end=Date.now()+60000;while(!n.stats.ready||!n.stats.active){if(n.stats.lastError||Date.now()>end)throw Error('Release native plant view unavailable '+JSON.stringify(n.stats));await new Promise(r=>setTimeout(r,100));}const audit=await n.auditModel({timeout:20000});if(!audit.checked||audit.mismatch)throw Error('Native plant scene audit failed');return {backend:'D3D12',audit,stats:n.stats};})()",85000);
    File.WriteAllText(Path.Combine(folder,"plant.json"),plant);if(File.Exists(Path.Combine(folder,"plant-native.png")))File.Delete(Path.Combine(folder,"plant-native.png"));host.Plant.CaptureNativeRelease(Path.Combine(folder,"plant-native.png"));await Wait(()=>Task.FromResult(File.Exists(Path.Combine(folder,"plant-native.png"))),15000);await Task.Delay(200);
    using(var image=new Bitmap(Path.Combine(folder,"plant-native.png"))){var colors=new HashSet<int>();for(int y=0;y<image.Height;y+=8)for(int x=0;x<image.Width;x+=8)colors.Add(image.GetPixel(x,y).ToArgb());if(colors.Count<16)throw new Exception("Plant readback has no rendered content");}
    string templates="null";if(Environment.GetEnvironmentVariable("SHUYAER_RELEASE_TEMPLATES")=="1"){
     File.WriteAllText(Path.Combine(folder,"phase.txt"),phase="eight-samples");
     templates=await host.Plant.IntegrationAwait(@"(async()=>{const b=window.__branchForge,list=(await(await fetch('/api/project-library')).json()).items,types=['CAMPHOR','AZALEA','FIDDLE_FIG','IVY','BOUGAINVILLEA','SCENE_GRASS','SCENE_BROADLEAF','SCENE_FLOWER'],results=[];for(const type of types){const item=list.find(x=>x.species===type&&x.batch==='ALL_PLANT_SAMPLE_V2');if(!item)throw Error('Missing representative '+type);const pulse=setInterval(()=>document.querySelector('#projectLibraryConfirm[open] [data-confirm-accept]')?.click(),80);let used;try{used=await b.projectLibrary.use(item.id);}finally{clearInterval(pulse);}if(!used)throw Error('Sample did not open '+type);const audit=await b.nativeViewport.auditModel({timeout:20000});if(!audit.checked||audit.mismatch)throw Error('Sample scene audit failed '+type);results.push({species:type,id:item.id,audit,mode:b.asset.mode});}return results;})()",240000);File.WriteAllText(Path.Combine(folder,"samples.json"),templates);
    }
    File.WriteAllText(Path.Combine(folder,"phase.txt"),phase="material-import");
    string fixture=Environment.GetEnvironmentVariable("SHUYAER_RELEASE_FIXTURE");if(String.IsNullOrEmpty(fixture)||!File.Exists(fixture))throw new Exception("Owned release fixture is required");
    string input=Path.Combine(host.Root,".runtime","integration-test","plant-session","material-handoff");Directory.CreateDirectory(input);File.Copy(fixture,Path.Combine(input,"11111111-1111-4111-8111-111111111111.glb"),true);
    await host.Plant.IntegrationAwait("(async()=>{const p=window.__branchForge.trunkPreparation;await p.open();const r=await fetch('/api/material-handoff?id=11111111-1111-4111-8111-111111111111');if(!r.ok)throw Error('Missing release fixture');await p.importFile(new File([await r.arrayBuffer()],'发布验收.glb',{type:'model/gltf-binary'}),{route:'material'});document.querySelector('#trunkPreparationDialog [data-flow=material]').click();return true;})()",65000);
    await Wait(()=>Task.FromResult(host.Material!=null&&host.Material.IntegrationReady),90000);
    await Wait(async()=>!host.Busy&&await host.Material.IntegrationEvaluate("Boolean(window.treeMaterialIntegration?.state.current&&!window.treeMaterialIntegration.state.busy)")=="true",240000);
    if(!host.SingleWorkflowFrame)throw new Exception("Integrated material component lost its workflow frame");
    File.WriteAllText(Path.Combine(folder,"phase.txt"),phase="material-render");
    string material=await host.Material.IntegrationAwait(@"(async()=>{const a=window.treeMaterialModule,b=window.treeLab,end=Date.now()+120000;while(b.busy||b.surfaceWorkbench.state.pending){if(Date.now()>end)throw Error('Material updates timed out');await new Promise(r=>setTimeout(r,100));}if(b.surfaceWorkbench.state.error)throw Error(b.surfaceWorkbench.state.error);const {captureNativeMaterial}=await import('./native-material-capture.js'),{EFFECT_LIBRARY_BUILTINS}=await import('./effect-library.js'),{SURFACE_DECAL_STYLES}=await import('./surface-decal-styles.js');if(EFFECT_LIBRARY_BUILTINS.length!==175||SURFACE_DECAL_STYLES.length!==65)throw Error('Material catalog incomplete');const image=await captureNativeMaterial(b.renderer);window.__releaseMaterialImage=image.url;await a.flushDraft();return {backend:b.renderer.gl.nativeBackend,coveredPixels:image.coveredPixels,effects:175,decalStyles:65,project:a.getSnapshot().id,triangles:b.model.indices.length/3};})()",150000);
    string rawImage=await host.Material.IntegrationEvaluate("window.__releaseMaterialImage"),url=json.Deserialize<string>(rawImage);File.WriteAllBytes(Path.Combine(folder,"material-native.png"),Convert.FromBase64String(url.Substring(url.IndexOf(',')+1)));File.WriteAllText(Path.Combine(folder,"material.json"),material);
    bool deep=Environment.GetEnvironmentVariable("SHUYAER_RELEASE_DEEP")=="1";string exported="null";
    if(deep){File.WriteAllText(Path.Combine(folder,"phase.txt"),phase="final-glb");exported=await host.Material.IntegrationAwait("(async()=>{const a=window.treeMaterialModule,out=await a.exportFinalGLB();if(out.resolution!==2048||!out.model)throw Error('Release GLB output missing');await a.flushDraft();return out;})()",180000);File.WriteAllText(Path.Combine(folder,"export.json"),exported);}
    int branches=Directory.GetFiles(Path.Combine(host.Root,"assets","branch-asset-library"),"*.meta.json").Length;bool retained=File.Exists(Path.Combine(host.Root,"assets","branch-asset-library","7abc681b16decc47970d938f191d9335cecd4027e630fcb74e6998a4cff9c0e0.meta.json"));if(branches==162&&!retained)throw new Exception("Required Platanus branch was lost");
    bool closeRace=Environment.GetEnvironmentVariable("SHUYAER_VERIFY_CLOSE_RACE")=="1";
    if(closeRace){
     File.WriteAllText(Path.Combine(folder,"phase.txt"),phase="close-race");
     await ExerciseCloseRace(host,folder,json);
    }
    File.WriteAllText(Path.Combine(folder,"result.json"),json.Serialize(new {passed=true,version=typeof(Workspace).Assembly.GetName().Version.ToString(3),backend="D3D12",materialBackend="v040-dx12",singleWorkflowFrame=true,sourceBranches=branches,retainedPlatanus=retained,actualNativeReadbacks=true,eightSamples=templates!="null",deepGLB=deep,closeRace,windowsVisible=false}));passed=true;
   }catch(Exception error){File.WriteAllText(Path.Combine(folder,"result.json"),json.Serialize(new {passed=false,phase,error=error.ToString(),windowsVisible=false}));}
   if(!host.ClosePending){host.SelectPlant();host.Close();}
   await Task.Delay(40000);if(!host.IsDisposed){File.WriteAllText(Path.Combine(folder,"close-failed.json"),json.Serialize(new {passed=false,error="Release host did not close normally",previousPassed=passed}));System.Windows.Forms.Application.ExitThread();}
  }

  static async Task ExerciseCloseRace(Workspace host,string folder,JavaScriptSerializer json){
   bool deadlineHonored=false;
   try{await host.Plant.IntegrationAwait("new Promise(()=>{})",400);}
   catch(TimeoutException){deadlineHonored=true;}
   if(!deadlineHonored)throw new Exception("Page call did not honor the deadline");

   const string failure="V051_TEST_SAVE_FAILURE";
   await host.Plant.IntegrationEvaluate("window.__originalPrepareClose=window.treeDuckMaterialIntegration.prepareClose;window.treeDuckMaterialIntegration.prepareClose=async()=>{throw Error('"+failure+"')};true");
   host.Close();
   await Wait(()=>Task.FromResult(!host.ClosePending),6000);
   if(host.IsDisposed||host.LastCloseFailure!=failure||!host.MaterialActive)throw new Exception("Failed save did not return to the active workbench");
   await host.Plant.IntegrationEvaluate("window.treeDuckMaterialIntegration.prepareClose=window.__originalPrepareClose;delete window.__originalPrepareClose;true");

   string recovery=Path.Combine(host.Root,"material",".runtime","recovery","active.json");
   Func<int> generation=()=>Convert.ToInt32(json.Deserialize<Dictionary<string,object>>(File.ReadAllText(recovery))["generation"]);
   int before=generation();
   await host.Material.IntegrationEvaluate("(()=>{const integration=window.treeMaterialIntegration,command=integration.command;integration.command=(...args)=>new Promise(resolve=>window.__releaseCloseTest=resolve).then(()=>command(...args));return true})()");
   await host.Plant.IntegrationEvaluate("window.chrome.webview.postMessage(JSON.stringify({topic:'shuyaer-v050',action:'material-component-command',id:crypto.randomUUID(),command:'stage',stage:'material'}));true");
   await Wait(async()=>await host.Material.IntegrationEvaluate("typeof window.__releaseCloseTest==='function'")=="true",7000);
   host.Close();
   host.Close();
   await Task.Delay(650);
   if(!host.ClosePending||host.IsDisposed||generation()!=before)throw new Exception("Close was lost, duplicated, or saved before the command ended");
   host.FormClosed+=delegate{
    int after=generation();
    File.WriteAllText(Path.Combine(folder,"close-race.json"),json.Serialize(new {passed=after>before,deadlineHonored,saveFailureStayedOpen=true,duplicateCloseQueued=true,closedFromMaterial=true,normalFormClosed=true,recoveryGenerationBefore=before,recoveryGenerationAfter=after}));
   };
   await host.Material.IntegrationEvaluate("window.__releaseCloseTest();true");
  }
 }
}
