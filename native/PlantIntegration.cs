using System;using System.Collections.Generic;using System.Threading.Tasks;using Microsoft.Web.WebView2.Core;
namespace BranchGeneratorFBXTool {
 internal sealed partial class MainForm {
  bool integrationActive=true;internal event Action<Dictionary<string,object>> IntegrationMessage;
  Task integrationStart;
  internal Task StartForIntegration(){if(integrationStart==null)integrationStart=StartApplicationAsync();return integrationStart;}
  internal void CaptureNativeRelease(string file){if(nativeView==IntPtr.Zero)throw new System.Exception("Native view not ready");BFViewportCapture(nativeView,file);}
  internal bool IntegrationReady{get{return startupCompleted;}}
  internal bool IntegrationFailed{get{return startupFailed;}}
  internal Task<string> IntegrationEvaluate(string code){return ShuYaErV050.PageCall.Execute(webView,code,15000);}
  internal async Task StopForIntegrationAsync(){
   closing=true;
   nativeTimer.Stop();
   IntPtr handle=nativeView;
   nativeView=IntPtr.Zero;
   try{
    await Task.Run(()=>{
     try{if(handle!=IntPtr.Zero)BFViewportDestroy(handle);}
     finally{StopPlantServer();}
    });
   }finally{
    if(sharedBuffer!=null){sharedBuffer.Dispose();sharedBuffer=null;}
    Close();
   }
  }
  internal Task<string> IntegrationAwait(string code,int timeout){return ShuYaErV050.PageCall.Await(webView,code,timeout);}
  internal async Task CaptureIntegration(string file){using(var stream=System.IO.File.Create(file))await webView.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);}
  internal void SetIntegrationActive(bool active){integrationActive=active;nativePanel.Visible=active&&nativeVisible;if(nativeView!=IntPtr.Zero)BFViewportPause(nativeView,active&&nativeVisible?0:1);}
  void InstallIntegration(){webView.CoreWebView2.WebMessageReceived+=delegate(object s,CoreWebView2WebMessageReceivedEventArgs e){if(!TrustedMessage(e))return;try{string text=e.TryGetWebMessageAsString();if(text==null||text.Length>8192||!text.StartsWith("{"))return;var data=nativeJson.Deserialize<Dictionary<string,object>>(text);if(data.ContainsKey("topic")&&Convert.ToString(data["topic"])=="shuyaer-v050"&&IntegrationMessage!=null)IntegrationMessage(data);}catch{}};}
 }
}
