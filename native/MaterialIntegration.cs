using System;using System.Collections.Generic;using System.Threading.Tasks;using Microsoft.Web.WebView2.Core;
namespace TreeMaterialLab {
 sealed partial class MainForm {
  internal event Action<Dictionary<string,object>> IntegrationMessage;
  internal event Action IntegrationCloseCancelled;
  Task integrationStart;
  internal Task StartForIntegration(){if(integrationStart==null)integrationStart=StartAsync();return integrationStart;}
  internal bool ComponentMounted{get{return embeddedComponent&&view.Parent==presentationRoot&&Parent==null&&!Visible;}}
  internal async Task PrepareComponentClose(){
   if(!ready){if(!closeGate.ApproveStartup())throw new Exception("材质组件尚未完成关闭准备。");}
   else{
    if(downloads.Count>0)throw new Exception("请等待文件下载完成后关闭。");
    string id=Guid.NewGuid().ToString("N");if(!closeGate.Begin(id))throw new Exception("正在保存材质草稿，请稍候。");
    var pending=new TaskCompletionSource<CloseReply>(TaskCreationOptions.RunContinuationsAsynchronously);closeReply=pending;view.Enabled=false;PostClose("prepare-close",id);
    try{
     var completed=await Task.WhenAny(pending.Task,Task.Delay(15000));if(completed!=pending.Task)throw new Exception("材质关闭保存尚未确认，请重试。");
     var reply=await pending.Task;if(!closeGate.Reply(id,reply.Ok)||!reply.Ok)throw new Exception(reply.Error??"材质草稿未保存");
     if(downloads.Count>0||!closeGate.Approve(id))throw new Exception("材质组件尚未确认关闭。");closeReply=null;
    }catch{closeGate.Fail(id);PostClose("abort-close",id);closeGate.Abort(id);closeReply=null;view.Enabled=true;throw;}
   }
  }
  internal void ApproveComponentDiscard(){
   if(closeGate.State=="approved")return;
   string id=Guid.NewGuid().ToString("N");
   if(!closeGate.Begin(id)||!closeGate.Fail(id)||!closeGate.ApproveDiscard())
    throw new InvalidOperationException("材质工作台尚未就绪，请重试关闭。");
  }
  internal async Task StopComponentAsync(){
   BeginCleanup();
   var stopServer=Task.Run(()=>StopServer());
   try{
    var stopViewport=nativeViewport==null?Task.FromResult(false):nativeViewport.DisposeAsync();
    await Task.WhenAll(stopServer,stopViewport);
   }finally{
    nativeViewport=null;
    WriteStatus("closed");
    presentationRoot.Dispose();
    Dispose();
   }
  }
  internal bool IntegrationReady{get{return ready;}}
  internal Task<string> IntegrationEvaluate(string code){return ShuYaErV050.PageCall.Execute(view,code,15000);}
  internal Task<string> IntegrationAwait(string code,int timeout){return ShuYaErV050.PageCall.Await(view,code,timeout);}
  internal async Task CaptureIntegration(string file){using(var stream=System.IO.File.Create(file))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);}
  void InstallIntegration(){view.CoreWebView2.WebMessageReceived+=delegate(object s,CoreWebView2WebMessageReceivedEventArgs e){Uri source;if(!Uri.TryCreate(e.Source,UriKind.Absolute,out source)||source.GetLeftPart(UriPartial.Authority)!=new Uri(url).GetLeftPart(UriPartial.Authority)||source.AbsolutePath!="/")return;try{string text=e.TryGetWebMessageAsString();if(text==null||text.Length>8192)return;var data=json.Deserialize<Dictionary<string,object>>(text);if(data.ContainsKey("topic")&&Convert.ToString(data["topic"])=="shuyaer-v050"&&IntegrationMessage!=null)IntegrationMessage(data);}catch{}};}
 }
}
