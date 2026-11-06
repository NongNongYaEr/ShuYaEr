// The plant window owns the trunk workflow. Material controls mount only in
// its middle editing region; the material controller never becomes a window.
using System;using System.IO;using System.Drawing;using System.Threading.Tasks;using System.Collections.Generic;using System.Windows.Forms;using System.Web.Script.Serialization;using System.Runtime.InteropServices;using System.Security.Cryptography;using Microsoft.Web.WebView2.Core;
namespace ShuYaErV050 {
 internal static class Program {
  [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
  [STAThread]static void Main(string[] args){SetProcessDPIAware();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new Workspace(AppDomain.CurrentDomain.BaseDirectory,Array.IndexOf(args,"--verify-release")>=0||Array.IndexOf(args,"--verify-integration")>=0||Array.IndexOf(args,"--verify-component-close")>=0||Array.IndexOf(args,"--verify-rig-transfer")>=0));}
 }
 internal sealed class Workspace:Form {
  static readonly string ReleaseTitle="树鸭儿 V"+typeof(Workspace).Assembly.GetName().Version.ToString(3).Replace(".","");
  readonly string root;readonly bool test;readonly BranchGeneratorFBXTool.MainForm plant;TreeMaterialLab.MainForm material;
  readonly Panel surface=new Panel{Dock=DockStyle.Fill};readonly FlowLayoutPanel bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=42,Padding=new Padding(8,5,8,5)};
  readonly Button plantButton=new Button{Text="植物创作",Width=110,Height=30},materialButton=new Button{Text="树干材质",Width=110,Height=30};readonly Label state=new Label{AutoSize=true,Padding=new Padding(12,7,0,0)};
  bool closing,busy,closeAttempt,waitCancelled;string pendingInput;readonly JavaScriptSerializer json=new JavaScriptSerializer();
  readonly FlowLayoutPanel closeNotice=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=44,Padding=new Padding(10,7,8,4),BackColor=Color.FromArgb(39,49,43),Visible=false};
  readonly Label closeNoticeText=new Label{AutoSize=true,Padding=new Padding(0,6,8,0)};
  readonly Button continueEditing=new Button{Text="返回工作台",AutoSize=true};
  Panel materialSurface,transitionCover;Rectangle componentBounds;bool materialActive,componentCommandBusy;
  internal Workspace(string directory,bool verify){
   root=directory;test=verify;Text=ReleaseTitle+" · 植物与材质工坊";BackColor=Color.FromArgb(31,35,36);ForeColor=Color.FromArgb(234,235,219);MinimumSize=new Size(1080,760);WindowState=FormWindowState.Maximized;
   if(test){WindowState=FormWindowState.Normal;StartPosition=FormStartPosition.Manual;Location=new Point(-28000,-28000);Size=new Size(1600,1000);ShowInTaskbar=false;Environment.SetEnvironmentVariable("BRANCHFORGE_DESKTOP_TEST_DIR",Path.Combine(root,".runtime","integration-test","plant-host"));Environment.SetEnvironmentVariable("BRANCHFORGE_SESSION_TEST_DIR",Path.Combine(root,".runtime","integration-test","plant-session"));}
   string icon=Path.Combine(root,"web","brand","tree-duck-v5.ico");if(File.Exists(icon))Icon=new Icon(icon);
   Controls.Add(surface);bar.Visible=false;plant=new BranchGeneratorFBXTool.MainForm(root);Embed(plant);plant.IntegrationMessage+=PlantMessage;
   closeNotice.Controls.Add(closeNoticeText);closeNotice.Controls.Add(continueEditing);Controls.Add(closeNotice);closeNotice.BringToFront();
   continueEditing.Click+=delegate{waitCancelled=true;};
   plantButton.Click+=delegate{if(!busy)Select(false);};materialButton.Click+=delegate{if(!busy)Select(true);};FormClosing+=CloseWorkspace;
   Shown+=async delegate{plant.Show();Select(false);await plant.StartForIntegration();if(test)await VerifyAsync();};
  }
  protected override bool ShowWithoutActivation{get{return test;}}
  void Embed(Form child){child.TopLevel=false;child.FormBorderStyle=FormBorderStyle.None;child.WindowState=FormWindowState.Normal;child.MinimumSize=Size.Empty;child.Dock=DockStyle.Fill;surface.Controls.Add(child);}
  void Select(bool editing){
   if(editing&&material==null){
    materialSurface=new Panel{Visible=false,BackColor=Color.FromArgb(31,35,36)};surface.Controls.Add(materialSurface);
    if(componentBounds.IsEmpty)componentBounds=new Rectangle(0,164,surface.ClientSize.Width,Math.Max(100,surface.ClientSize.Height-236));materialSurface.Bounds=componentBounds;
    material=new TreeMaterialLab.MainForm(Path.Combine(root,"material"),materialSurface);material.IntegrationMessage+=MaterialMessage;
   }
   materialActive=editing;plant.Visible=true;plant.SetIntegrationActive(!editing);
   if(materialSurface!=null){materialSurface.Visible=editing;if(editing){materialSurface.BringToFront();material.StartForIntegration();}}
   if(plant.IntegrationReady)plant.IntegrationEvaluate("window.treeDuckMaterialIntegration.componentState("+json.Serialize(new {active=editing})+")");
   Text=ReleaseTitle+" · 树干整理";
  }
  void ShowResultTransition(){
   if(transitionCover==null){transitionCover=new Panel{BackColor=Color.FromArgb(29,40,34)};var card=new Panel{Size=new Size(420,250),BackColor=transitionCover.BackColor};var image=new PictureBox{Size=new Size(160,125),Location=new Point(130,0),SizeMode=PictureBoxSizeMode.Zoom};string imagePath=Path.Combine(root,"material","web","brand","tree-duck-loading-v1.png");if(File.Exists(imagePath))image.Image=Image.FromFile(imagePath);var label=new Label{AutoSize=false,Size=new Size(420,80),Location=new Point(0,130),TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Microsoft YaHei UI",13),ForeColor=Color.FromArgb(235,230,182),Text="正在载入处理后的树干…\r\n更新模型、材质与骨架视口"};var progress=new ProgressBar{Location=new Point(65,222),Size=new Size(290,6),Style=ProgressBarStyle.Marquee,MarqueeAnimationSpeed=25};card.Controls.Add(image);card.Controls.Add(label);card.Controls.Add(progress);transitionCover.Controls.Add(card);transitionCover.Resize+=delegate{card.Location=new Point(Math.Max(0,(transitionCover.Width-card.Width)/2),Math.Max(0,(transitionCover.Height-card.Height)/2));};surface.Controls.Add(transitionCover);}
   transitionCover.Bounds=componentBounds.IsEmpty?surface.ClientRectangle:componentBounds;transitionCover.Visible=true;transitionCover.BringToFront();
  }
  void HideResultTransition(){if(transitionCover!=null)transitionCover.Visible=false;}
  void Status(string text){state.Text=text;if(plant.IntegrationReady)plant.IntegrationEvaluate("window.treeDuckMaterialIntegration?.componentState("+json.Serialize(new {message=text})+")");}
  void SetBusy(bool value){busy=value;plantButton.Enabled=!value;materialButton.Enabled=!value;}
  async Task WaitReady(Func<bool> ready,int milliseconds){var watch=System.Diagnostics.Stopwatch.StartNew();while(!ready()){if(closing)throw new OperationCanceledException();if(watch.ElapsedMilliseconds>milliseconds)throw new Exception("工作台准备超时，请查看本机日志。");await Task.Delay(100);}}
  static string ValidId(Dictionary<string,object> data){string id=Convert.ToString(data["id"]);Guid value;if(!Guid.TryParseExact(id,"D",out value))throw new Exception("无效传递编号");return id;}
  string TransferPath(string id){return Path.Combine(root,".runtime",test?"integration-test/plant-session/material-handoff":"material-handoff",id+".glb");}
  static string SHA(string file){using(var stream=File.OpenRead(file))using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
  async void PlantMessage(Dictionary<string,object> data){
   string action=Convert.ToString(data["action"]);
   if(action=="material-component-bounds"){try{var b=(Dictionary<string,object>)data["bounds"];double dpr=Convert.ToDouble(b["dpr"]);if(dpr<.5||dpr>8)return;var r=new Rectangle((int)Math.Round(Convert.ToDouble(b["x"])*dpr),(int)Math.Round(Convert.ToDouble(b["y"])*dpr),(int)Math.Round(Convert.ToDouble(b["width"])*dpr),(int)Math.Round(Convert.ToDouble(b["height"])*dpr));if(r.Width<100||r.Height<100||r.X<0||r.Y<0||r.Right>surface.ClientSize.Width+2||r.Bottom>surface.ClientSize.Height+2)return;componentBounds=r;if(materialSurface!=null)materialSurface.Bounds=r;}catch(Exception e){Log(e);}return;}
   if(action=="material-component-command"){await ComponentCommand(data);return;}
   if(busy||closing||action!="edit-material")return;SetBusy(true);string id=null,previous=pendingInput;try{
   id=ValidId(data);string source=TransferPath(id);if(!File.Exists(source)||new FileInfo(source).Length>150000000)throw new Exception("传递的树干文件不存在或超过150MB");
   Select(true);Status("正在将树干送入材质工坊…");await WaitReady(()=>material!=null&&material.IntegrationReady,90000);
   // The material workbench checkpoints its current document before starting a new draft.
   string target=Path.Combine(root,"material",".runtime","integration-input",id+".glb");Directory.CreateDirectory(Path.GetDirectoryName(target));File.Copy(source,target,false);pendingInput=id;
   bool resume=data.ContainsKey("resume")&&Convert.ToBoolean(data["resume"]);if(resume){string bundle=Path.ChangeExtension(source,".treeproj");if(!File.Exists(bundle)||new FileInfo(bundle).Length>200000000)throw new Exception("材质编辑包不存在或超过容量");File.Copy(bundle,Path.ChangeExtension(target,".treeproj"),false);}
   string prepared=await material.IntegrationAwait("window.treeMaterialIntegration.receive("+json.Serialize(new {id=id,name=Convert.ToString(data["name"]),height=Convert.ToDouble(data["height"]),resume=resume,originKey=data.ContainsKey("originKey")?Convert.ToString(data["originKey"]):null,projectId=data.ContainsKey("projectId")?data["projectId"]:null,rebuild=data.ContainsKey("rebuild")&&Convert.ToBoolean(data["rebuild"]),target=data.ContainsKey("target")?Convert.ToInt32(data["target"]):50000,resolution=data.ContainsKey("resolution")?Convert.ToInt32(data["resolution"]):2048,stage=data.ContainsKey("stage")?Convert.ToString(data["stage"]):"material",preparation=data.ContainsKey("preparation")&&Convert.ToString(data["preparation"])=="material"?"material":"full",view=data.ContainsKey("view")?data["view"]:null})+")",300000);
   await plant.IntegrationAwait("window.treeDuckMaterialIntegration.notePrepared("+json.Serialize(id)+","+prepared+")",15000);
   File.Delete(source);File.Delete(Path.ChangeExtension(source,".treeproj"));await plant.IntegrationEvaluate("window.treeDuckMaterialIntegration.settle("+json.Serialize(id)+")");Status("树干已就绪 · 制作材质");
  }catch(Exception e){pendingInput=previous;Status("材质准备未完成："+e.Message);Log(e);Select(false);if(id!=null)try{File.Delete(TransferPath(id));File.Delete(Path.ChangeExtension(TransferPath(id),".treeproj"));File.Delete(Path.Combine(root,"material",".runtime","integration-input",id+".glb"));File.Delete(Path.Combine(root,"material",".runtime","integration-input",id+".treeproj"));NotifyPlantFailure(id,e.Message);}catch{}}finally{SetBusy(false);}}
  async void NotifyPlantFailure(string id,string message){try{await plant.IntegrationEvaluate("window.treeDuckMaterialIntegration.settle("+json.Serialize(id)+","+json.Serialize(message)+")");}catch{}}
  async Task ComponentCommand(Dictionary<string,object> data){string id=Convert.ToString(data["id"]),error=null;bool ownsCommand=false;try{
   Guid parsed;if(!Guid.TryParseExact(id,"D",out parsed))return;if(componentCommandBusy||busy||closing||material==null||!materialActive)throw new Exception("请等待当前步骤完成");
   componentCommandBusy=true;ownsCommand=true;string command=Convert.ToString(data["command"]),stage=data.ContainsKey("stage")?Convert.ToString(data["stage"]):null;
   string result=await material.IntegrationAwait("window.treeMaterialIntegration.command("+json.Serialize(command)+","+json.Serialize(stage)+")",300000);
   if(command=="leave"){Select(false);await plant.IntegrationAwait("(()=>{const p=window.__branchForge.trunkPreparation;p.materialComponent.update({active:false,view:"+result+".view});document.querySelector('#trunkPreparationDialog [data-flow=model]').click();return true;})()",10000);}
  }catch(Exception e){error=e.Message;Log(e);}
   try{await plant.IntegrationEvaluate("window.treeDuckMaterialIntegration.componentCommandSettled("+json.Serialize(id)+","+json.Serialize(error)+")");}catch{}
   finally{if(ownsCommand)componentCommandBusy=false;}}
  async void MaterialMessage(Dictionary<string,object> data){string action=Convert.ToString(data["action"]);
   if(action=="material-component-state"){if(materialActive&&!closing)try{await plant.IntegrationEvaluate("window.treeDuckMaterialIntegration.componentState("+json.Serialize(new {active=true,stage=data["stage"],busy=data["busy"],message=data["message"],nextLabel=data["nextLabel"]})+")");}catch(Exception e){Log(e);}return;}
   if(busy||closing)return;if(action=="show-plant"){Select(false);if(data.ContainsKey("view"))await plant.IntegrationEvaluate("window.treeDuckMaterialIntegration.componentState("+json.Serialize(new {active=false,view=data["view"]})+")");return;}if(action!="return-material")return;SetBusy(true);string resultId=null;bool transferAccepted=false;try{
   string id=ValidId(data);resultId=id;if(pendingInput==null||Convert.ToString(data["inputId"])!=pendingInput)throw new Exception("材质结果与当前树干不匹配，请重新送入");
   string relative=Convert.ToString(data["model"]);if(!relative.StartsWith("/exports/",StringComparison.Ordinal)||relative.IndexOf('?')>=0||relative.IndexOf('#')>=0)throw new Exception("材质结果路径无效");
   string basePath=Path.GetFullPath(Path.Combine(root,"material","exports"))+Path.DirectorySeparatorChar,source=Path.GetFullPath(Path.Combine(root,"material",Uri.UnescapeDataString(relative.TrimStart('/')).Replace('/',Path.DirectorySeparatorChar)));
   if(!source.StartsWith(basePath,StringComparison.OrdinalIgnoreCase)||Path.GetExtension(source)!=".glb"||!File.Exists(source)||new FileInfo(source).Length>150000000)throw new Exception("材质结果尚未就绪或超过传递预算");
   resultId=id;string key=Convert.ToString(data["checkpointKey"]);if(!System.Text.RegularExpressions.Regex.IsMatch(key,"^[a-f0-9]{64}$"))throw new Exception("材质检查点编号无效");
   string bundle=Path.Combine(root,"material",".runtime","integration-checkpoints",key+".treeproj");if(!File.Exists(bundle)||new FileInfo(bundle).Length>200000000)throw new Exception("材质编辑包未保存");
   string finalHash=SHA(source),bundleHash=SHA(bundle);if(finalHash!=Convert.ToString(data["finalSHA256"])||bundleHash!=Convert.ToString(data["bundleSHA256"]))throw new Exception("已保存检查点校验不一致");
   string savedView=await material.IntegrationEvaluate("window.treeMaterialModule.getView()");
   Directory.CreateDirectory(Path.GetDirectoryName(TransferPath(id)));File.Copy(source,TransferPath(id),true);File.Copy(bundle,Path.ChangeExtension(TransferPath(id),".treeproj"),true);ShowResultTransition();Select(false);await WaitReady(()=>plant.IntegrationReady,60000);
   await plant.IntegrationAwait("window.treeDuckMaterialIntegration.receive("+json.Serialize(new {id=id,inputId=pendingInput,name=Convert.ToString(data["name"]),checkpointKey=key,projectId=Convert.ToString(data["projectId"]),finalSHA256=finalHash,bundleSHA256=bundleHash})+")",120000);
   transferAccepted=true;string presentation=await plant.IntegrationAwait("(async()=>{const p=window.__branchForge.trunkPreparation;p.view.setView("+savedView+");const result=await p.view.waitForPresentation({required:false});window.__trunkFinalPresentation=result;return result;})()",90000);
   await material.IntegrationEvaluate("window.treeMaterialIntegration.complete("+json.Serialize(new {id=id,ok=true})+")");HideResultTransition();var display=json.Deserialize<Dictionary<string,object>>(presentation);Status(Convert.ToBoolean(display["presentationReady"])?"材质GLB已保存 · 自动骨架与绑定":"GLB已进入自动骨架；视口画面仍在准备，模型与材质检查点已保留。");
  }catch(Exception e){HideResultTransition();Log(e);if(transferAccepted){Select(false);Status("GLB已进入自动骨架；显示需要重试："+e.Message);if(resultId!=null)NotifyMaterialSuccess(resultId);}else{Status("检查点已保留，转接未完成："+e.Message);Select(true);if(resultId!=null)NotifyMaterialFailure(resultId,e.Message);}}finally{SetBusy(false);}}
  async void NotifyMaterialSuccess(string id){try{await material.IntegrationEvaluate("window.treeMaterialIntegration.complete("+json.Serialize(new {id=id,ok=true})+")");}catch(Exception e){Log(e);}}
  async void NotifyMaterialFailure(string id,string error){try{await material.IntegrationEvaluate("window.treeMaterialIntegration.complete("+json.Serialize(new {id=id,ok=false,error=error})+")");}catch(Exception e){Log(e);}}
  void Log(Exception e){try{Directory.CreateDirectory(Path.Combine(root,".runtime"));File.AppendAllText(Path.Combine(root,".runtime","v051-integration.log"),DateTime.Now.ToString("s")+" "+e+Environment.NewLine);}catch(IOException){}catch(UnauthorizedAccessException){}}
  void ShowCloseNotice(string text,bool canCancel){
   closeNoticeText.Text=text;
   continueEditing.Visible=canCancel;
   closeNotice.Visible=true;
  }
  async void CloseWorkspace(object sender,FormClosingEventArgs e){
   if(closing){e.Cancel=!shutdownComplete;return;}
   e.Cancel=true;
   if(closeAttempt)return;

   closeAttempt=true;
   waitCancelled=false;
   LastCloseFailure=null;
   ShowCloseNotice("正在等待当前步骤结束，完成后将保存并关闭。",true);
   await Task.Yield();
   try{
    try{
     var transferWait=new System.Diagnostics.Stopwatch();
     while(!waitCancelled){
      if(busy||componentCommandBusy){transferWait.Reset();}
      else{
       var transfer=plant.IntegrationReady?await plant.IntegrationAwait("Boolean(window.treeDuckMaterialIntegration?.transferPending)",4000):"false";
       if(transfer=="false"&&!busy&&!componentCommandBusy)break;
       transferWait.Start();
       if(transferWait.ElapsedMilliseconds>15000)throw new TimeoutException("树干转接尚未确认结束。");
      }
      await Task.Delay(150);
     }
     if(waitCancelled)return;
     surface.Enabled=false;
     ShowCloseNotice("正在保存植物与材质的关闭恢复点…",false);
     if(plant.IntegrationReady&&await plant.IntegrationAwait("window.treeDuckMaterialIntegration.prepareClose()",15000)!="true")
      throw new InvalidOperationException("植物工作台未确认保存。");
     if(material!=null&&!material.IsDisposed)await material.PrepareComponentClose();
    }catch(Exception error){
     if(waitCancelled)return;
     LastCloseFailure=error.Message;
     Log(error);
     if(test)return;
     string message=error.Message+"\r\n\r\n选择“否”返回工作台，可以处理后重试。选择“是”仍然退出，本次未保存的更改可能丢失。";
     if(MessageBox.Show(this,message,"关闭保存未完成，仍然退出？",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;
     if(material!=null&&!material.IsDisposed)material.ApproveComponentDiscard();
    }
    closing=true;
    ShowCloseNotice("正在关闭视口与本地服务…",false);
    try{if(material!=null&&!material.IsDisposed)await material.StopComponentAsync();}catch(Exception error){Log(error);}
    try{await plant.StopForIntegrationAsync();}catch(Exception error){Log(error);}
    shutdownComplete=true;
    Close();
   }catch(Exception error){
    LastCloseFailure=error.Message;
    Log(error);
    if(!test)MessageBox.Show(this,error.Message,"无法完成关闭，请重试",MessageBoxButtons.OK,MessageBoxIcon.Warning);
   }finally{
    closeAttempt=false;
    if(!IsDisposed&&!closing){surface.Enabled=true;closeNotice.Visible=false;}
   }
  }
  bool shutdownComplete;
  internal string LastCloseFailure{get;private set;}
  internal bool ClosePending{get{return closeAttempt;}}
  // Implemented in a separate file, only used by the explicit hidden verification switch.
  async Task VerifyAsync(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"--verify-release")>=0){await V050Probe.RunRelease(this);return;}if(Array.IndexOf(Environment.GetCommandLineArgs(),"--verify-rig-transfer")>=0){await V050Probe.RunRigTransfer(this);return;}if(Array.IndexOf(Environment.GetCommandLineArgs(),"--verify-component-close")>=0)await V050Probe.RunClose(this);else await V050Probe.Run(this);}
  internal BranchGeneratorFBXTool.MainForm Plant{get{return plant;}}internal TreeMaterialLab.MainForm Material{get{return material;}}internal string Root{get{return root;}}internal void OpenMaterial(){Select(true);}internal void SelectPlant(){Select(false);}internal bool Busy{get{return busy;}}
  internal bool ResultTransitionVisible{get{return transitionCover!=null&&transitionCover.Visible;}}internal bool MaterialActive{get{return materialActive;}}internal Rectangle ComponentBounds{get{return componentBounds;}}internal bool SingleWorkflowFrame{get{return plant.Visible&&material!=null&&material.ComponentMounted&&materialSurface.Parent==surface&&materialSurface.Bounds==componentBounds;}}
 }
}
