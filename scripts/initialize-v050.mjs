// One-time, explicit fork adaptation. Re-running against an adapted tree fails instead of guessing.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staged=new Map();
function change(file,from,to){const p=path.join(root,file),text=staged.get(p)??fs.readFileSync(p,'utf8');if(text.split(from).length!==2)throw Error('Expected one baseline anchor: '+file+' '+from.slice(0,75));staged.set(p,text.replace(from,to));}
change('native/BranchGeneratorDesktop.cs','internal sealed class MainForm : Form','internal sealed partial class MainForm : Form');
change('native/BranchGeneratorDesktop.cs','public MainForm()\n','public MainForm() : this(null) {}\n        public MainForm(string directory)\n');
change('native/BranchGeneratorDesktop.cs','appDir = AppDomain.CurrentDomain.BaseDirectory;','appDir = directory ?? AppDomain.CurrentDomain.BaseDirectory;');
change('native/BranchGeneratorDesktop.cs','if (!string.IsNullOrEmpty(overrideRoot) &&','if (directory == null && !string.IsNullOrEmpty(overrideRoot) &&');
change('native/BranchGeneratorDesktop.cs','webView.CoreWebView2.WebMessageReceived += OnStartupMessage;','InstallIntegration();\n                webView.CoreWebView2.WebMessageReceived += OnStartupMessage;');
change('native/BranchGeneratorDesktop.cs','nativePanel.Visible=true;nativePanel.SendToBack();nativeVisible=true;if(nativeView!=IntPtr.Zero)BFViewportPause(nativeView,0);','nativePanel.Visible=integrationActive;nativePanel.SendToBack();nativeVisible=true;if(nativeView!=IntPtr.Zero)BFViewportPause(nativeView,integrationActive?0:1);');
change('material/native/TreeMaterialDesktop.cs','sealed class MainForm:Form','sealed partial class MainForm:Form');
change('material/native/TreeMaterialDesktop.cs','nativeViewport=new NativeDX12Host(this,view,root,Log);','InstallIntegration();nativeViewport=new NativeDX12Host(this,view,root,Log);');
change('material/native/TreeMaterialDesktop.cs',"desktop:true,apiBase:'/api'","desktop:true,embedded:true,apiBase:'/api'");
change('material/native/TreeMaterialDesktop.cs','void AbortClose(){','void AbortClose(){if(IntegrationCloseCancelled!=null)IntegrationCloseCancelled();');
change('material/native/TreeMaterialDesktop.cs','Banner("未完成关闭："+error.Message,false,true);Log(error.Message);','Banner("未完成关闭："+error.Message,false,true);Log(error.Message);if(IntegrationCloseCancelled!=null)IntegrationCloseCancelled();');
change('server.ps1','$running = $true',". (Join-Path $script:AppDir 'scripts/material-handoff-server.ps1')\n$running = $true");
change('server.ps1',"            if ($path -eq '/api/appearance' -and $context.Request.HttpMethod -eq 'GET')", "            if(Invoke-MaterialHandoffRoute $context $path){continue}\n            if ($path -eq '/api/appearance' -and $context.Request.HttpMethod -eq 'GET')");
change('web/app.js',"import { createWorkspaceNavigation }", "import {createMaterialIntegration} from './material-integration.js';\nimport { createWorkspaceNavigation }");
change('web/app.js',"  const trunkPreparation=createTrunkPreparation({canReplace:","  let materialIntegration;\n  const trunkPreparation=createTrunkPreparation({material:async value=>materialIntegration.send(value),canReplace:");
change('web/app.js',"  const modelSculpt=createModelSculpt(","  materialIntegration=createMaterialIntegration({toast:showToast,canReceive:async()=>packageCaptureAllowed(true),receive:async model=>{await trunkPreparation.close({resume:false});await trunkPreparation.open({model});showToast('材质结果已作为新树干打开；请检查控制骨架后保存。');},prepareClose:async()=>{await flushCompleteWorkbench();await trunkPreparation.flush();await modelSculpt.flush();if(projectSession.needsSave()&&!await projectSession.checkpoint(true))return false;return true;}});\n  const modelSculpt=createModelSculpt(");
change('web/trunk-preparation.js','<button data-sculpt class="trunk-sculpt-entry">','<button data-material title="用当前造型制作新的树皮材质，保留原始树干与控制骨架">${icon(\'palette\')}制作树皮材质</button><button data-sculpt class="trunk-sculpt-entry">');
change('web/trunk-preparation.js',"  q('[data-sculpt]').disabled=", "  q('[data-material]').disabled=busy||gesture||!model||!!auto?.pending;\n  q('[data-sculpt]').disabled=");
change('web/trunk-preparation.js'," auto=createTrunkAutoController("," q('[data-material]').onclick=safe(async()=>{if(busy||gesture||auto?.pending||!model)throw Error('请先完成当前树干调整');validateTrunkReady(model);view.restoreOriginal();await flush();await api.material(model);});\n auto=createTrunkAutoController(");
change('material/web/module-api.js',"'export-png-inspection'","'export-png-inspection','prepare-model','final-glb'");
change('material/web/module-api.js','    applyPreset(settings)',`    async prepareModel(bytes,name='Tree.glb',options={}){alive();const data=bytes instanceof ArrayBuffer?bytes:bytes instanceof Uint8Array?bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength):null;if(!data||data.byteLength>150000000||typeof name!=='string'||name.length>180)throw Error('宿主模型输入无效。');if(!controller.prepareModel)throw Error('宿主未配置模型准备');const result=await controller.prepareModel(data,name,structuredClone(options));alive();if(!result?.report)throw Error('模型准备未完成；当前工程已保留。');return structuredClone(result.report);},
    async exportFinalGLB(){alive();if(!controller.exportFinalGLB)throw Error('宿主未配置最终GLB');const result=await controller.exportFinalGLB();alive();if(!result?.model||!result?.manifest)throw Error('最终GLB尚未生成，请检查UV与当前任务。');return structuredClone(result);},
    applyPreset(settings)`);
change('material/web/workbench.js','snapshot:()=>project,loadModel,applyPreset:',"snapshot:()=>project,loadModel,prepareModel:(bytes,name,options)=>preparationUI.importFile(new File([bytes],name,{type:'model/gltf-binary'}),{options}),exportFinalGLB,applyPreset:");
change('material/web/workbench.js','notifyReady();const recovery=','const recovery=');
change('material/web/workbench.js','setBusy(false);startupComplete=true;','setBusy(false);startupComplete=true;notifyReady();');
change('material/web/index.html','</body>','<script type="module" src="integration-v050.js"></script></body>');
change('material/server.mjs',"    if(req.method==='POST'&&route==='/api/sessions/cancel')",`    const handoff=route.match(/^\\/api\\/integration-input\\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/);
    if(handoff){const p=path.join(root,'.runtime/integration-input',handoff[1]+'.glb');if(req.method==='GET'){if(fs.existsSync(p)&&fs.statSync(p).size>150000000)throw Error('树干传递超过150MB');return file(res,p);}if(req.method==='DELETE'){fs.rmSync(p,{force:true});return json(res,{ok:true});}return json(res,{error:'Method not supported'},405);}
    if(req.method==='POST'&&route==='/api/sessions/cancel')`);
for(const file of ['package.json','release.json','release-config.json']){const p=path.join(root,file),v=JSON.parse(fs.readFileSync(p));v.version='0.5.0';if(file==='package.json')v.name='shuyaer-v050';if(v.delivery)v.delivery='V050';if(v.variant)v.variant='集成开发';staged.set(p,JSON.stringify(v,null,2)+'\n');}
for(const [p,text] of staged)fs.writeFileSync(p,text);
console.log('V050 fork adapters applied.');
