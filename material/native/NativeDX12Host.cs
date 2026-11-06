// Shared-buffer / child-panel boundary adapted from ShuYaEr V040.
// Original project remains read-only. Material commands use a separate ABI.
using System;using System.Collections.Generic;using System.IO;using System.Runtime.InteropServices;using System.Text;using System.Web.Script.Serialization;using System.Windows.Forms;using Microsoft.Web.WebView2.Core;using Microsoft.Web.WebView2.WinForms;
namespace TreeMaterialLab {
 sealed class NativeDX12Host:IDisposable {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
  [DllImport("TreeMaterialDX12.dll",CallingConvention=CallingConvention.Cdecl,CharSet=CharSet.Unicode)]static extern IntPtr TMLDX12Create(IntPtr hwnd,string folder);
  [DllImport("TreeMaterialDX12.dll",CallingConvention=CallingConvention.Cdecl)]static extern void TMLDX12Destroy(IntPtr value);
  [DllImport("TreeMaterialDX12.dll",CallingConvention=CallingConvention.Cdecl)]static extern int TMLDX12Submit(IntPtr value,IntPtr bytes,uint length,IntPtr output,UIntPtr capacity);
  [DllImport("TreeMaterialDX12.dll",CallingConvention=CallingConvention.Cdecl)]static extern uint TMLDX12Status(IntPtr value,byte[] bytes,uint capacity);
  readonly WebView2 web;readonly Panel panel;readonly string root;readonly Action<string> log;readonly JavaScriptSerializer json=new JavaScriptSerializer();readonly Timer timer=new Timer{Interval=33};IntPtr device;CoreWebView2SharedBuffer input,output;string session,lastStatus;bool disposed,loggedReady;
  public NativeDX12Host(Control owner,WebView2 view,string directory,Action<string> logger){web=view;root=directory;log=logger;panel=new Panel{Visible=false,BackColor=System.Drawing.Color.FromArgb(33,43,38)};owner.Controls.Add(panel);panel.SendToBack();timer.Tick+=delegate{Poll();};}
  void Post(object value){if(!disposed&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(json.Serialize(value));}
  public void Handle(Dictionary<string,object> data){if(disposed)return;string action=Convert.ToString(data["action"]),requested=Convert.ToString(data["session"]);try{
   if(action=="initialize"){
    if(device!=IntPtr.Zero)throw new InvalidOperationException("DX12会话已存在，请重新打开软件。");if(string.IsNullOrEmpty(requested)||requested.Length>80)throw new InvalidOperationException("DX12会话编号无效。");session=requested;
    string native=Path.Combine(root,"runtime","native-material"),dll=Path.Combine(native,"TreeMaterialDX12.dll");if(!File.Exists(dll)||LoadLibraryEx(dll,IntPtr.Zero,0x1100)==IntPtr.Zero)throw new InvalidOperationException("DX12运行库加载失败："+Marshal.GetLastWin32Error());
    device=TMLDX12Create(panel.Handle,native);if(device==IntPtr.Zero)throw new InvalidOperationException("DX12原生视口创建失败。");input=web.CoreWebView2.Environment.CreateSharedBuffer(128UL*1024*1024);output=web.CoreWebView2.Environment.CreateSharedBuffer(64UL*1024*1024);
    web.CoreWebView2.PostSharedBufferToScript(input,CoreWebView2SharedBufferAccess.ReadWrite,json.Serialize(new {session=session,role="input"}));web.CoreWebView2.PostSharedBufferToScript(output,CoreWebView2SharedBufferAccess.ReadOnly,json.Serialize(new {session=session,role="output"}));timer.Start();
   }else{
    if(requested!=session||device==IntPtr.Zero)return;
    if(action=="packet"){long length=Convert.ToInt64(data["bytes"]);if(length<8||length>(long)input.Size||TMLDX12Submit(device,input.Buffer,(uint)length,output.Buffer,(UIntPtr)output.Size)!=1)throw new InvalidOperationException("DX12未接受本次资源/绘制批次。");}
    else if(action=="bounds"){var b=(Dictionary<string,object>)data["bounds"];double dpr=Convert.ToDouble(b["dpr"]);if(dpr<.5||dpr>8)throw new InvalidOperationException("DX12视口缩放无效。");int x=(int)Math.Round(Convert.ToDouble(b["x"])*dpr),y=(int)Math.Round(Convert.ToDouble(b["y"])*dpr),w=(int)Math.Round(Convert.ToDouble(b["width"])*dpr),h=(int)Math.Round(Convert.ToDouble(b["height"])*dpr);if(w<1||h<1||w>16384||h>16384)return;panel.SetBounds(x,y,w,h);}
    else if(action=="show"){panel.Visible=true;panel.SendToBack();}
    else if(action=="hide"){panel.Visible=false;}
    else if(action=="dispose"){Dispose();}
   }
  }catch(Exception error){log("DX12 "+error.Message);Post(new {topic="tree-material-dx12",session=session??requested,error=error.Message});}}
  void Poll(){if(disposed||device==IntPtr.Zero)return;var bytes=new byte[16384];uint size=TMLDX12Status(device,bytes,(uint)bytes.Length);if(size==0)return;string text=Encoding.UTF8.GetString(bytes,0,(int)size);if(text==lastStatus)return;lastStatus=text;try{var value=json.Deserialize<Dictionary<string,object>>(text);value["topic"]="tree-material-dx12";value["session"]=session;Post(value);if(value.ContainsKey("error"))log("DX12 "+Convert.ToString(value["error"]));else if(value.ContainsKey("adapter")&&!loggedReady){loggedReady=true;log("DX12 "+text);}}catch(Exception error){log("DX12状态读取失败："+error.Message);}}
  IntPtr StopViewport(){
   disposed=true;
   timer.Stop();
   timer.Dispose();
   panel.Visible=false;
   IntPtr handle=device;
   device=IntPtr.Zero;
   return handle;
  }
  void ReleaseViewport(){
   if(input!=null){input.Dispose();input=null;}
   if(output!=null){output.Dispose();output=null;}
   panel.Dispose();
  }
  internal async System.Threading.Tasks.Task DisposeAsync(){
   if(disposed)return;
   IntPtr handle=StopViewport();
   try{if(handle!=IntPtr.Zero)await System.Threading.Tasks.Task.Run(()=>TMLDX12Destroy(handle));}
   finally{ReleaseViewport();}
  }
  public void Dispose(){
   if(disposed)return;
   IntPtr handle=StopViewport();
   try{if(handle!=IntPtr.Zero)TMLDX12Destroy(handle);}
   finally{ReleaseViewport();}
  }
 }
}
