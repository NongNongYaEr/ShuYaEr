using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("树材质工坊")]
[assembly: AssemblyProduct("Tree Material Lab Desktop")]
[assembly: AssemblyVersion("0.53.0.0")]
[assembly: AssemblyFileVersion("0.53.0.0")]

namespace TreeMaterialLab {
    static class Program {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [STAThread] static int Main(string[] args) {
            string root=AppDomain.CurrentDomain.BaseDirectory;
            if(Array.IndexOf(args,"--verify-service")>=0){try{LocalServiceProtocol.Verify(root);return 0;}catch(Exception e){File.WriteAllText(Path.Combine(root,"service-check-error.txt"),e.ToString());return 1;}}
            if(Array.IndexOf(args,"--verify-process-job")>=0){
                try{using(var job=new OwnedProcessJob()){
                    string script="process.stdin.once('data',()=>{const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(c.pid);setInterval(()=>{},1000)});";
                    var info=new ProcessStartInfo(Path.Combine(root,"runtime","node.exe"),"-e \""+script+"\""){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardOutput=true,RedirectStandardInput=true};
                    using(var parent=Process.Start(info)){job.Attach(parent);parent.StandardInput.WriteLine("start");var read=Task.Run(()=>parent.StandardOutput.ReadLine());if(!read.Wait(5000))throw new Exception("Child startup timeout");using(var child=Process.GetProcessById(int.Parse(read.Result))){job.Dispose();if(!parent.WaitForExit(5000)||!child.WaitForExit(5000))throw new Exception("Owned descendants not stopped");Directory.CreateDirectory(Path.Combine(root,".runtime"));File.WriteAllText(Path.Combine(root,".runtime","process-job-check.json"),new JavaScriptSerializer().Serialize(new {ok=true,windowsOpened=false,ownedParentStopped=true,ownedChildStopped=true}),new UTF8Encoding(false));}}
                }return 0;}catch(Exception e){File.WriteAllText(Path.Combine(root,"process-job-error.txt"),e.ToString());return 1;}
            }
            if(Array.IndexOf(args,"--verify-runtime")>=0){
                try {
                    string version=CoreWebView2Environment.GetAvailableBrowserVersionString();
                    string node=Path.Combine(root,"runtime","node.exe");
                    if(!File.Exists(node)||!File.Exists(Path.Combine(root,"server.mjs")))throw new Exception("Missing local runtime");
                    var p=Process.Start(new ProcessStartInfo(node,"--version"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true});
                    string nodeVersion=p.StandardOutput.ReadToEnd().Trim();p.WaitForExit();
                    if(p.ExitCode!=0)throw new Exception("Node runtime failed");
                    Directory.CreateDirectory(Path.Combine(root,".runtime"));
                    File.WriteAllText(Path.Combine(root,".runtime","runtime-check.json"),new JavaScriptSerializer().Serialize(new {ok=true,webView2=version,node=nodeVersion,root=root}),new UTF8Encoding(false));
                    return 0;
                } catch(Exception e){File.WriteAllText(Path.Combine(root,"runtime-check-error.txt"),e.ToString());return 1;}
            }
            if(Array.IndexOf(args,"--verify-close-protocol")>=0){try{CloseProtocol.Verify(root);return 0;}catch(Exception e){File.WriteAllText(Path.Combine(root,"close-protocol-error.txt"),e.ToString());return 1;}}
            SetProcessDPIAware();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new MainForm(root));return 0;
        }
    }
    sealed partial class MainForm:Form {
        readonly string root;
        readonly string token=Guid.NewGuid().ToString("N");
        readonly JavaScriptSerializer json=new JavaScriptSerializer();
        readonly WebView2 view;NativeDX12Host nativeViewport;
        readonly Label loading;
        Process server;OwnedProcessJob processJob;volatile string url;bool closing;bool ready;
        readonly CloseProtocol closeGate=new CloseProtocol();
        readonly HashSet<CoreWebView2DownloadOperation> downloads=new HashSet<CoreWebView2DownloadOperation>();
        readonly Panel closePanel=new Panel{Dock=DockStyle.Top,Height=96,Visible=false,BackColor=Color.FromArgb(54,65,48)};
        readonly Label closeText=new Label{Dock=DockStyle.Fill,ForeColor=Color.White,Padding=new Padding(12,8,12,4)};
        readonly Button continueButton=new Button{Text="继续编辑",Width=96};
        readonly Button retryButton=new Button{Text="重试关闭",Width=96};
        readonly Button discardButton=new Button{Text="不保存退出…",Width=112};
        TaskCompletionSource<CloseReply> closeReply;

        readonly Control presentationRoot;readonly bool embeddedComponent;
        public MainForm(string directory):this(directory,null){}
        public MainForm(string directory,Control mount){
            presentationRoot=mount??this;embeddedComponent=mount!=null;
            root=directory;Text="树鸭儿 · 树材质工作台 "+typeof(MainForm).Assembly.GetName().Version.ToString(2);
            BackColor=Color.FromArgb(29,36,32);MinimumSize=new Size(1024,720);Size=new Size(1440,960);StartPosition=FormStartPosition.CenterScreen;WindowState=FormWindowState.Maximized;
            loading=new Label{Dock=DockStyle.Fill,Text="树材质工坊\r\n\r\n正在准备材质工作台…",TextAlign=ContentAlignment.MiddleCenter,ForeColor=Color.FromArgb(199,219,168),BackColor=BackColor,Font=new Font("Microsoft YaHei UI",13)};
            string iconPath=Path.Combine(root,"web","brand","tree-duck-v5.ico");if(File.Exists(iconPath))Icon=new Icon(iconPath);view=new WebView2{Dock=DockStyle.Fill,Visible=false,DefaultBackgroundColor=Color.Transparent};presentationRoot.Controls.Add(view);presentationRoot.Controls.Add(loading);
            var buttons=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=36,FlowDirection=FlowDirection.RightToLeft};buttons.Controls.Add(continueButton);buttons.Controls.Add(retryButton);buttons.Controls.Add(discardButton);closePanel.Controls.Add(closeText);closePanel.Controls.Add(buttons);presentationRoot.Controls.Add(closePanel);
            continueButton.Click+=delegate{AbortClose();};retryButton.Click+=delegate{Close();};discardButton.Click+=delegate{if(closeGate.State!="failed"||downloads.Count>0)return;if(MessageBox.Show(this,"本次关闭恢复点尚未确认。退出可能丢失最近修改。仍要退出吗？","退出前确认",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2)==DialogResult.Yes&&closeGate.ApproveDiscard())Close();};
            Shown+=async delegate {await StartForIntegration();};FormClosing+=CloseSession;
        }
        string Quote(string s){return "\""+s.Replace("\"","")+"\"";}
        async Task StartAsync(){try{
            url=null;
            string runtime=Path.Combine(root,".runtime");Directory.CreateDirectory(runtime);
            var info=LocalServiceProtocol.StartInfo(root,token);
            server=Process.Start(info);if(server==null)throw new Exception("本地材质服务无法启动。");
            try{processJob=new OwnedProcessJob();processJob.Attach(server);}catch{if(!server.HasExited)server.Kill();throw;}
            server.OutputDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null){string address=LocalServiceProtocol.ParseAddress(e.Data);if(address!=null)url=address;Log(e.Data);}};server.ErrorDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null)Log(e.Data);};server.BeginOutputReadLine();server.BeginErrorReadLine();
            var timer=Stopwatch.StartNew();bool online=false;
            while(timer.ElapsedMilliseconds<15000){if(closing)return;if(server.HasExited)throw new Exception("材质服务退出，请查看.runtime/desktop.log。");if(url!=null)try{var request=(HttpWebRequest)WebRequest.Create(url+"api/health");request.Timeout=500;using(var response=(HttpWebResponse)await request.GetResponseAsync()){if(response.StatusCode==HttpStatusCode.OK){online=true;break;}}}catch{}await Task.Delay(100);}
            if(closing)return;if(!online)throw new Exception("材质服务启动超时。");
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(runtime,"WebView2"));if(closing)return;await view.EnsureCoreWebView2Async(environment);if(closing)return;
            var settings=view.CoreWebView2.Settings;settings.AreDevToolsEnabled=false;settings.AreDefaultContextMenusEnabled=false;settings.IsStatusBarEnabled=false;settings.IsZoomControlEnabled=false;settings.AreBrowserAcceleratorKeysEnabled=false;
            await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("window.__treeMaterialHostConfig={desktop:true,embedded:true,componentMount:"+(embeddedComponent?"true":"false")+",apiBase:'/api',hostVersion:'"+typeof(MainForm).Assembly.GetName().Version.ToString(3)+"',hostFamily:'shuyaer-v040',renderer:'v040-dx12'};window.addEventListener('error',function(e){window.chrome.webview.postMessage(JSON.stringify({topic:'tree-material-lab',action:'startup-error',message:e.message||'界面模块或资源载入失败'}));});window.addEventListener('unhandledrejection',function(e){window.chrome.webview.postMessage(JSON.stringify({topic:'tree-material-lab',action:'startup-error',message:String(e.reason&&e.reason.message||e.reason)}));});");
            if(closing)return;
            InstallIntegration();nativeViewport=new NativeDX12Host(presentationRoot,view,root,Log);view.CoreWebView2.WebMessageReceived+=Message;
            view.CoreWebView2.DownloadStarting+=delegate(object sender,CoreWebView2DownloadStartingEventArgs args){var operation=args.DownloadOperation;if(operation.State==CoreWebView2DownloadState.InProgress)downloads.Add(operation);operation.StateChanged+=delegate{if(operation.State!=CoreWebView2DownloadState.InProgress)downloads.Remove(operation);};};
            view.CoreWebView2.NavigationStarting+=delegate(object s,CoreWebView2NavigationStartingEventArgs e){Uri target;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out target)||target.GetLeftPart(UriPartial.Authority)!=new Uri(url).GetLeftPart(UriPartial.Authority))e.Cancel=true;};
            view.CoreWebView2.NewWindowRequested+=delegate(object s,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
            view.CoreWebView2.NavigationCompleted+=delegate(object s,CoreWebView2NavigationCompletedEventArgs e){if(!e.IsSuccess&&!closing)Fail("界面加载失败："+e.WebErrorStatus);};
            view.Visible=true;loading.BringToFront();view.Source=new Uri(url);
            WriteStatus("loading");
            await Task.Delay(60000);if(!ready&&!closing)Fail("工作台初始化超时。DX12或界面初始化未完成，请查看.runtime/desktop.log中的具体错误。");
        }catch(WebView2RuntimeNotFoundException){Fail("系统缺少Microsoft Edge WebView2 Runtime。请安装微软官方运行时后重开。");}catch(Exception e){Fail(e.Message);}}
        readonly object logLock=new object();
        void Log(string text){try{lock(logLock){File.AppendAllText(Path.Combine(root,".runtime","desktop.log"),DateTime.Now.ToString("s")+" "+text+Environment.NewLine,new UTF8Encoding(false));}}catch{}}
        void WriteStatus(string state){try{File.WriteAllText(Path.Combine(root,".runtime","desktop-session.json"),json.Serialize(new {state=state,pid=Process.GetCurrentProcess().Id,serverPid=server==null?0:server.Id,url=url,root=root,webView2=view.CoreWebView2==null?null:view.CoreWebView2.Environment.BrowserVersionString}),new UTF8Encoding(false));}catch{}}
        void Message(object sender,CoreWebView2WebMessageReceivedEventArgs e){if(closing)return;Uri source;if(!Uri.TryCreate(e.Source,UriKind.Absolute,out source)||source.GetLeftPart(UriPartial.Authority)!=new Uri(url).GetLeftPart(UriPartial.Authority)||source.AbsolutePath!="/")return;try{string text=e.TryGetWebMessageAsString();if(text==null||text.Length>8192)return;var data=json.Deserialize<Dictionary<string,object>>(text);if(data.ContainsKey("topic")&&Convert.ToString(data["topic"])=="tree-material-dx12"){nativeViewport.Handle(data);return;}if(!data.ContainsKey("topic")||Convert.ToString(data["topic"])!="tree-material-lab")return;string action=data.ContainsKey("action")?Convert.ToString(data["action"]):"";
            if(action=="close-ready"){var reply=CloseProtocol.Parse(data);if(reply!=null&&closeGate.State=="waiting"&&reply.RequestId==closeGate.RequestId&&closeReply!=null)closeReply.TrySetResult(reply);return;}
            if(action=="startup-error"){string detail=data.ContainsKey("message")?Convert.ToString(data["message"]):"未知初始化错误";Log(detail);if(!ready)Fail(detail);return;}if(action=="ready"){ready=true;loading.Visible=false;view.BringToFront();WriteStatus("ready");}
            if(action=="open-output"&&data.ContainsKey("folder")){string folder=Path.GetFullPath(Convert.ToString(data["folder"])),boundary=Path.GetFullPath(Path.Combine(root,"exports"))+Path.DirectorySeparatorChar;if(folder.StartsWith(boundary,StringComparison.OrdinalIgnoreCase)&&Directory.Exists(folder))Process.Start("explorer.exe",Quote(folder));}
        }catch(Exception error){Log(error.Message);}}
        void Fail(string message){if(closing)return;loading.Text="树材质工坊启动未完成\r\n\r\n"+message;loading.Visible=true;loading.BringToFront();Log(message);WriteStatus("error");}
        void Banner(string message,bool waiting,bool failed){closeText.Text=message;closePanel.Visible=true;closePanel.BringToFront();retryButton.Enabled=!waiting;discardButton.Visible=failed;continueButton.Enabled=true;}
        void PostClose(string action,string id){try{if(view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsJson(json.Serialize(new {topic="tree-material-lab",action=action,requestId=id}));}catch(Exception error){Log(error.Message);}}
        void AbortClose(){if(IntegrationCloseCancelled!=null)IntegrationCloseCancelled();string id=closeGate.RequestId;if(id!=null){PostClose("abort-close",id);closeGate.Abort(id);}if(closeReply!=null)closeReply.TrySetCanceled();closeReply=null;view.Enabled=true;closePanel.Visible=false;}
        async void CloseSession(object sender,FormClosingEventArgs e){
            if(closing)return;
            if(closeGate.State=="approved"){Cleanup();return;}
            if(!ready){if(closeGate.ApproveStartup()){Cleanup();return;}e.Cancel=true;return;}
            e.Cancel=true;if(closeGate.State=="waiting"||closeGate.State=="prepared")return;
            if(downloads.Count>0){Banner("文件仍在下载。请在下载完成或取消后重试关闭。",false,false);return;}
            string id=Guid.NewGuid().ToString("N");if(!closeGate.Begin(id))return;
            var pending=new TaskCompletionSource<CloseReply>(TaskCreationOptions.RunContinuationsAsynchronously);closeReply=pending;
            view.Enabled=false;Banner("正在结束任务并保存关闭恢复点…",true,false);PostClose("prepare-close",id);
            try{
                var completed=await Task.WhenAny(pending.Task,Task.Delay(15000));
                if(closing||closeGate.RequestId!=id||closeReply!=pending)return;
                if(completed!=pending.Task)throw new Exception("关闭保存超时，结果尚未确认。窗口已保留，可重试或继续编辑。");
                var reply=await pending.Task;if(!closeGate.Reply(id,reply.Ok))return;
                if(!reply.Ok)throw new Exception(reply.Error);
                if(downloads.Count>0)throw new Exception("恢复点已保存，但文件仍在下载。请等下载完成或取消后重试关闭。");
                if(closeGate.Approve(id)){closeReply=null;BeginInvoke(new Action(Close));}
            }catch(TaskCanceledException){}catch(Exception error){if(!closing&&closeGate.RequestId==id){closeGate.Fail(id);PostClose("abort-close",id);view.Enabled=true;Banner("未完成关闭："+error.Message,false,true);Log(error.Message);if(IntegrationCloseCancelled!=null)IntegrationCloseCancelled();}}
        }
        void BeginCleanup(){closing=true;closeGate.Closed();WriteStatus("closing");}
        void StopServer(){
            try{if(url!=null){var request=(HttpWebRequest)WebRequest.Create(url+"api/shutdown");request.Method="POST";request.Headers["X-Tree-Material-Owner"]=token;request.Timeout=500;request.ContentLength=0;using(request.GetResponse()){}}}catch{}
            try{if(server!=null&&!server.HasExited&&!server.WaitForExit(800))server.Kill();}catch{}
            if(processJob!=null)processJob.Dispose();
        }
        void Cleanup(){
            BeginCleanup();
            if(nativeViewport!=null){nativeViewport.Dispose();nativeViewport=null;}
            StopServer();WriteStatus("closed");view.Dispose();
        }
    }
}
