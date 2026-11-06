using System;using System.Collections.Generic;using System.Threading.Tasks;using System.Web.Script.Serialization;using Microsoft.Web.WebView2.WinForms;
namespace ShuYaErV050 {
 internal static class PageCall {
  static async Task<string> BeforeDeadline(Task<string> script,Task deadline){
   if(await Task.WhenAny(script,deadline)==script)return await script;
   var observeFailure=script.ContinueWith(failed=>{var error=failed.Exception;},TaskContinuationOptions.OnlyOnFaulted);
   throw new TimeoutException("工作区未在规定时间内响应。");
  }
  internal static async Task<string> Execute(WebView2 view,string code,int timeout){
   using(var cancel=new System.Threading.CancellationTokenSource()){
    try{return await BeforeDeadline(view.CoreWebView2.ExecuteScriptAsync(code),Task.Delay(timeout,cancel.Token));}
    finally{cancel.Cancel();}
   }
  }
  internal static async Task<string> Await(WebView2 view,string expression,int timeout){
   string key="__v050_"+Guid.NewGuid().ToString("N");var json=new JavaScriptSerializer{MaxJsonLength=4000000};
   var core=view.CoreWebView2;
   using(var cancel=new System.Threading.CancellationTokenSource()){
    var deadline=Task.Delay(timeout,cancel.Token);
    long expires=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+timeout;
    try{
     await BeforeDeadline(core.ExecuteScriptAsync("if(Date.now()<"+expires+"){window."+key+"={done:false};Promise.resolve().then(()=> ("+expression+")).then(value=>{if(window."+key+")window."+key+"={done:true,ok:true,value:value??null}},error=>{if(window."+key+")window."+key+"={done:true,ok:false,error:String(error?.message||error)}})};null"),deadline);
     while(!deadline.IsCompleted){
      string raw=await BeforeDeadline(core.ExecuteScriptAsync("window."+key),deadline);
      var result=json.DeserializeObject(raw) as Dictionary<string,object>;
      if(result!=null&&result.ContainsKey("done")&&Convert.ToBoolean(result["done"])){
       if(!Convert.ToBoolean(result["ok"]))throw new Exception(Convert.ToString(result["error"]));
       return json.Serialize(result["value"]);
      }
      await Task.WhenAny(Task.Delay(100),deadline);
     }
     throw new TimeoutException("工作区操作尚未确认完成，请检查任务状态。");
    }finally{
     cancel.Cancel();
     ForgetResult(core,key);
    }
   }
  }
  static async void ForgetResult(Microsoft.Web.WebView2.Core.CoreWebView2 core,string key){
   try{await core.ExecuteScriptAsync("delete window."+key);}catch{}
  }
 }
}
