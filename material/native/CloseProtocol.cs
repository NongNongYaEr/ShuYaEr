using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace TreeMaterialLab {
    // Pure state/token validation; no windows, WebView or processes required.
    sealed class CloseProtocol {
        public string State {get;private set;}
        public string RequestId {get;private set;}
        public CloseProtocol(){State="open";}
        public bool Begin(string id){Guid parsed;if(id==null||id.Length!=32||!Guid.TryParseExact(id,"N",out parsed)||id!=id.ToLowerInvariant()||State=="waiting"||State=="prepared"||State=="approved"||State=="closed")return false;RequestId=id;State="waiting";return true;}
        public bool Reply(string id,bool ok){if(State!="waiting"||id!=RequestId)return false;State=ok?"prepared":"failed";return true;}
        public bool Fail(string id){if(id!=RequestId||(State!="waiting"&&State!="prepared"))return false;State="failed";return true;}
        public bool Abort(string id){if(id!=RequestId||State=="approved"||State=="closed")return false;RequestId=null;State="open";return true;}
        public bool Approve(string id){if(State!="prepared"||id!=RequestId)return false;State="approved";return true;}
        public bool ApproveStartup(){if(State!="open")return false;State="approved";return true;}
        public bool ApproveDiscard(){if(State!="failed")return false;State="approved";return true;}
        public void Closed(){if(State!="approved")throw new InvalidOperationException("Unapproved close");State="closed";}
        public static CloseReply Parse(Dictionary<string,object> data){
            object value;string id=data.TryGetValue("requestId",out value)?value as string:null;Guid parsed;
            if(id==null||id.Length!=32||!Guid.TryParseExact(id,"N",out parsed)||!data.TryGetValue("ok",out value)||!(value is bool))return null;
            var reply=new CloseReply{RequestId=id,Ok=(bool)value};
            if(!reply.Ok){reply.Error=data.TryGetValue("error",out value)?value as string:null;if(reply.Error==null||reply.Error.Length>2000)return null;return reply;}
            if(!data.TryGetValue("saved",out value)||!(value is bool))return null;
            if((bool)value){foreach(string field in new[]{"projectId","revision"})if(!data.TryGetValue(field,out value)||!(value is string)||!Guid.TryParseExact((string)value,"D",out parsed))return null;}
            else if(!data.TryGetValue("noProject",out value)||!(value is bool)||!(bool)value)return null;
            return reply;
        }
        static void Check(bool value){if(!value)throw new Exception("Close protocol self-test failed");}
        public static void Verify(string root){
            string a=Guid.NewGuid().ToString("N"),b=Guid.NewGuid().ToString("N");var gate=new CloseProtocol();
            Check(!gate.Begin("invalid")&&gate.Begin(a)&&!gate.Begin(b)&&!gate.Reply(b,true));
            Check(gate.Reply(a,false)&&!gate.Approve(a)&&gate.Abort(a)&&gate.Begin(b));
            Check(!gate.Reply(a,true)&&gate.Reply(b,true)&&gate.Fail(b)&&gate.Abort(b));
            Check(gate.Begin(a)&&gate.Reply(a,true)&&gate.Approve(a)&&!gate.Abort(a));gate.Closed();Check(gate.State=="closed");
            var discard=new CloseProtocol();Check(!discard.ApproveDiscard()&&discard.Begin(a)&&discard.Fail(a)&&discard.ApproveDiscard());discard.Closed();
            var startup=new CloseProtocol();Check(startup.ApproveStartup());startup.Closed();
            var data=new Dictionary<string,object>{{"requestId",a},{"ok",true},{"saved",true}};Check(Parse(data)==null);data["projectId"]=Guid.NewGuid().ToString();data["revision"]=Guid.NewGuid().ToString();Check(Parse(data)!=null);data["ok"]="true";Check(Parse(data)==null);
            Directory.CreateDirectory(Path.Combine(root,".runtime"));File.WriteAllText(Path.Combine(root,".runtime","close-protocol-check.json"),new JavaScriptSerializer().Serialize(new {ok=true,windowsOpened=false,executableSHA256=BitConverter.ToString(System.Security.Cryptography.SHA256.Create().ComputeHash(File.ReadAllBytes(System.Reflection.Assembly.GetExecutingAssembly().Location))).Replace("-","").ToLowerInvariant(),scope="pure native state, stale nonce and reply validation; actual window close not tested"}),new UTF8Encoding(false));
        }
    }
    sealed class CloseReply {public string RequestId;public bool Ok;public string Error;}
}
