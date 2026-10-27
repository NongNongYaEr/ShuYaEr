using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("树鸭儿")]
[assembly: System.Reflection.AssemblyProduct("树鸭儿")]
[assembly: System.Reflection.AssemblyCompany("鸭儿")]
[assembly: System.Reflection.AssemblyDescription("树鸭儿 · 植物创作工坊")]

namespace BranchGeneratorFBXTool
{
    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main()
        {
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    internal sealed class MainForm : Form
    {
        private readonly WebView2 webView;
        private readonly StartupPanel loadingLabel;
        private Process serverProcess;
        private string serverUrl;
        private bool closing;
        private bool startupCompleted;
        private bool startupFailed;
        private readonly NativeViewportPanel nativePanel;
        private readonly Timer nativeTimer;
        private readonly JavaScriptSerializer nativeJson = new JavaScriptSerializer();
        private CoreWebView2Environment webEnvironment;
        private CoreWebView2SharedBuffer sharedBuffer;
        private IntPtr nativeView;
        private bool nativeVisible;
        private string nativeTransportSession = "";
        private int nativeTick;
        private int nativeAttempt;
        private int testPacketRejections;
        private string testPacketCapture;
        private int testPacketCaptureIndex;
        private long testPacketCaptureBytes;
        private readonly string appDir;
        private readonly string testDirectory;
        private readonly string nativeDirectory;

        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        private static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
        [DllImport("BranchForgeViewport.dll", CallingConvention=CallingConvention.Cdecl, CharSet=CharSet.Unicode)]
        private static extern IntPtr BFViewportCreate(IntPtr hwnd, string folder, string logs);
        [DllImport("BranchForgeViewport.dll", CallingConvention=CallingConvention.Cdecl)]
        private static extern void BFViewportDestroy(IntPtr view);
        [DllImport("BranchForgeViewport.dll", CallingConvention=CallingConvention.Cdecl)]
        private static extern int BFViewportSubmit(IntPtr view, IntPtr bytes, uint length);
        [DllImport("BranchForgeViewport.dll", CallingConvention=CallingConvention.Cdecl)]
        private static extern void BFViewportResize(IntPtr view, int width, int height);
        [DllImport("BranchForgeViewport.dll", CallingConvention=CallingConvention.Cdecl)]
        private static extern void BFViewportPause(IntPtr view, int paused);
        [DllImport("BranchForgeViewport.dll", CallingConvention=CallingConvention.Cdecl)]
        private static extern uint BFViewportStatus(IntPtr view, byte[] bytes, uint capacity);
        [DllImport("BranchForgeViewport.dll", CallingConvention=CallingConvention.Cdecl, CharSet=CharSet.Unicode)]
        private static extern void BFViewportCapture(IntPtr view, string path);

        public MainForm()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
            string overrideRoot = Environment.GetEnvironmentVariable("BRANCHFORGE_APP_ROOT");
            if (!string.IsNullOrEmpty(overrideRoot) && File.Exists(Path.Combine(overrideRoot,"server.ps1")) && Directory.Exists(Path.Combine(overrideRoot,"web"))) appDir=Path.GetFullPath(overrideRoot);
            testDirectory = Environment.GetEnvironmentVariable("BRANCHFORGE_DESKTOP_TEST_DIR");
            if (!string.IsNullOrEmpty(testDirectory)) {
                testDirectory=Path.GetFullPath(testDirectory);
                if(!testDirectory.StartsWith(Path.GetFullPath(Path.Combine(appDir,".runtime"))+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Test profile must stay inside this workspace runtime.");
                Directory.CreateDirectory(testDirectory);
            }
            nativeDirectory=Path.Combine(appDir,"runtime","native");
            string adjacentNative=Path.GetDirectoryName(typeof(MainForm).Assembly.Location);
            if(!string.IsNullOrEmpty(testDirectory)&&File.Exists(Path.Combine(adjacentNative,"BranchForgeViewport.dll")))nativeDirectory=adjacentNative;
            Text = "树鸭儿 · 植物创作工坊";
            MinimumSize = new Size(1080, 700);
            StartPosition = FormStartPosition.CenterScreen;
            WindowState = FormWindowState.Maximized;
            BackColor = Color.FromArgb(29, 36, 28);
            if(!string.IsNullOrEmpty(testDirectory)) {
                // Acceptance hosts stay outside the desktop and never activate
                // or cover the user's current application.
                WindowState=FormWindowState.Normal;StartPosition=FormStartPosition.Manual;
                Size=new Size(1700,1050);Location=new Point(-28000,-28000);ShowInTaskbar=false;
            }
            string iconPath = Path.Combine(appDir, "web", "brand", "tree-duck-v5.ico");
            if (File.Exists(iconPath)) Icon = new Icon(iconPath);

            loadingLabel = new StartupPanel
            {
                Dock = DockStyle.Fill,
                Text = "正在启动植物创作服务…",
                ForeColor = Color.FromArgb(232, 238, 233),
                BackColor = Color.FromArgb(29, 36, 28),
                Font = new Font("Microsoft YaHei UI", 11f, FontStyle.Regular)
            };
            webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = false,
                DefaultBackgroundColor = Color.Transparent
            };
            nativePanel=new NativeViewportPanel { Visible=false, BackColor=Color.FromArgb(29,36,28) };
            nativeTimer=new Timer { Interval=100 };
            nativeTimer.Tick += delegate { PollNative(); };
            Controls.Add(nativePanel);
            Controls.Add(webView);
            Controls.Add(loadingLabel);
            Shown += async delegate { await StartApplicationAsync(); };
            FormClosing += OnFormClosing;
        }

        private async Task StartApplicationAsync()
        {
            try
            {
                string serverScript = Path.Combine(appDir, "server.ps1");
                if (!File.Exists(serverScript)) throw new FileNotFoundException("缺少 server.ps1，程序文件可能没有完整解压。", serverScript);
                int port = ReservePort();
                serverUrl = "http://localhost:" + port + "/";
                StartServer(serverScript, port);
                await WaitForServerAsync(serverUrl, 15000);
                loadingLabel.Text = "正在准备植物工作台…";
                string userData = Path.Combine(appDir, ".runtime", "WebView2");
                if(!string.IsNullOrEmpty(testDirectory))userData=Path.Combine(testDirectory,"WebView2");
                var options=new CoreWebView2EnvironmentOptions();
                string debugPort=Environment.GetEnvironmentVariable("BRANCHFORGE_DEBUG_PORT");int debugNumber;
                if(!string.IsNullOrEmpty(testDirectory)&&int.TryParse(debugPort,out debugNumber)&&debugNumber>1024&&debugNumber<65536)options.AdditionalBrowserArguments="--remote-debugging-port="+debugNumber;
                webEnvironment = await CoreWebView2Environment.CreateAsync(null, userData, options);
                await webView.EnsureCoreWebView2Async(webEnvironment);
                CoreWebView2Settings settings = webView.CoreWebView2.Settings;
                settings.AreDevToolsEnabled = false;
                settings.AreDefaultContextMenusEnabled = false;
                settings.AreBrowserAcceleratorKeysEnabled = false;
                settings.IsStatusBarEnabled = false;
                settings.IsZoomControlEnabled = false;
                await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    "window.__treeDuckDesktopStartup = true;" +
                    "window.__branchForgeNativeRequired = true;" +
                    "window.__branchForgeDesktopBuild = " + nativeJson.Serialize(System.Reflection.Assembly.GetExecutingAssembly().GetName().Version.ToString()) + ";" +
                    "window.__branchForgeNativeHost = "+(File.Exists(Path.Combine(nativeDirectory,"BranchForgeViewport.dll"))?"true;":"false;")+
                    "window.addEventListener('error', function(e) { if (e.message) window.chrome.webview.postMessage('tree-duck:startup-error:' + e.message); });");
                webView.CoreWebView2.WebMessageReceived += OnStartupMessage;
                webView.CoreWebView2.WebMessageReceived += OnNativeMessage;
                webView.CoreWebView2.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
                {
                    if (!args.IsSuccess && !closing) ShowFatal("界面加载失败，错误代码：" + args.WebErrorStatus);
                };
                // Render behind the opaque native splash. A hidden WebView can suspend RAF.
                webView.Visible = true;
                loadingLabel.BringToFront();
                webView.Source = new Uri(serverUrl);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                ShowFatal("系统缺少 Microsoft Edge WebView2 Runtime。请安装后重新启动程序。");
            }
            catch (Exception ex)
            {
                ShowFatal("程序启动失败：\r\n" + ex.Message);
            }
        }

        protected override bool ShowWithoutActivation { get { return !string.IsNullOrEmpty(testDirectory); } }

        private bool TrustedMessage(CoreWebView2WebMessageReceivedEventArgs args) {
            Uri source;return Uri.TryCreate(args.Source,UriKind.Absolute,out source)&&source.GetLeftPart(UriPartial.Authority)==new Uri(serverUrl).GetLeftPart(UriPartial.Authority)&&source.AbsolutePath=="/";
        }
        private void NativeMessage(object value) { if(!closing&&webView.CoreWebView2!=null)webView.CoreWebView2.PostWebMessageAsJson(nativeJson.Serialize(value)); }
        private void OnNativeMessage(object sender,CoreWebView2WebMessageReceivedEventArgs args) {
            if(closing||!TrustedMessage(args))return;
            try {
                string text=args.TryGetWebMessageAsString();if(text==null||text.Length>8192||!text.StartsWith("{"))return;
                var data=nativeJson.Deserialize<Dictionary<string,object>>(text);if(!data.ContainsKey("topic")||(string)data["topic"]!="branchforge-native")return;
                string action=(string)data["action"];
                if(action!="initialize"&&!string.IsNullOrEmpty(nativeTransportSession)){
                    string requested=data.ContainsKey("transportSession")?Convert.ToString(data["transportSession"]):"";
                    // Untagged diagnostics are available only in an isolated
                    // test profile. Tagged packets from old mappings never run.
                    if(requested!=nativeTransportSession&&(data.ContainsKey("transportSession")||string.IsNullOrEmpty(testDirectory)))return;
                }
                if(action=="initialize") {
                    nativeTransportSession=data.ContainsKey("transportSession")?Convert.ToString(data["transportSession"]):"";
                    if(data.ContainsKey("restart")&&Convert.ToBoolean(data["restart"])&&nativeView!=IntPtr.Zero){nativeTimer.Stop();BFViewportDestroy(nativeView);nativeView=IntPtr.Zero;nativePanel.Visible=false;nativeVisible=false;nativePanel.ResetSurface();}
                    if(nativeView==IntPtr.Zero) {
                        string dll=Path.Combine(nativeDirectory,"BranchForgeViewport.dll");
                        if(LoadLibraryEx(dll,IntPtr.Zero,0x1100)==IntPtr.Zero)throw new InvalidOperationException("原生视口运行库加载失败");
                        string logs=string.IsNullOrEmpty(testDirectory)?Path.Combine(appDir,".runtime","native-viewport",Process.GetCurrentProcess().Id.ToString()):testDirectory;
                        if(string.IsNullOrEmpty(testDirectory))logs=Path.Combine(logs,"attempt-"+(++nativeAttempt).ToString()+"-"+DateTime.Now.ToString("yyyyMMdd-HHmmss-fff"));
                        nativeView=BFViewportCreate(nativePanel.Handle,nativeDirectory,logs);if(nativeView==IntPtr.Zero)throw new InvalidOperationException("原生视口创建失败");nativeTimer.Start();
                    }
                    if(sharedBuffer!=null)sharedBuffer.Dispose();sharedBuffer=webEnvironment.CreateSharedBuffer(128UL*1024*1024);
                    webView.CoreWebView2.PostSharedBufferToScript(sharedBuffer,CoreWebView2SharedBufferAccess.ReadWrite,nativeJson.Serialize(new {version=1,transportSession=nativeTransportSession}));
                } else if(action=="packet"&&nativeView!=IntPtr.Zero&&sharedBuffer!=null) {
                    long bytes=Convert.ToInt64(data["bytes"]);if(bytes<8||bytes>(long)sharedBuffer.Size)throw new InvalidOperationException("Invalid viewport packet size");
                    bool accepted;
                    if(!string.IsNullOrEmpty(testDirectory)&&testPacketRejections>0){testPacketRejections--;accepted=false;}
                    else accepted=BFViewportSubmit(nativeView,sharedBuffer.Buffer,(uint)bytes)==1;
                    if(accepted&&testPacketCapture!=null) {
                        // Explicit, bounded diagnostics in an owned test profile only.
                        if(testPacketCaptureIndex>=512||testPacketCaptureBytes+bytes>1024L*1024*1024)throw new InvalidOperationException("Test packet capture limit exceeded");
                        byte[] copy=new byte[(int)bytes];Marshal.Copy(sharedBuffer.Buffer,copy,0,copy.Length);
                        File.WriteAllBytes(Path.Combine(testPacketCapture,(++testPacketCaptureIndex).ToString("D4")+".bin"),copy);testPacketCaptureBytes+=bytes;
                    }
                    NativeMessage(new { topic="branchforge-native",action="ack",accepted=accepted,transportSession=nativeTransportSession });
                } else if(action=="record-test-packets"&&!string.IsNullOrEmpty(testDirectory)) {
                    bool enabled=Convert.ToBoolean(data["enabled"]);
                    if(enabled){testPacketCapture=Path.Combine(testDirectory,"transport-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(testPacketCapture);testPacketCaptureIndex=0;testPacketCaptureBytes=0;}
                    NativeMessage(new {topic="branchforge-native",action="record-test-packets",recording=enabled,directory=testPacketCapture,packets=testPacketCaptureIndex,bytes=testPacketCaptureBytes,transportSession=nativeTransportSession});
                    if(!enabled)testPacketCapture=null;
                } else if(action=="reject-test-packets"&&!string.IsNullOrEmpty(testDirectory)) {
                    testPacketRejections=Math.Max(0,Math.Min(32,Convert.ToInt32(data["count"])));
                } else if(action=="bounds"&&nativeView!=IntPtr.Zero) {
                    var bounds=(Dictionary<string,object>)data["bounds"];double scale=Convert.ToDouble(bounds["dpr"]);
                    int x=(int)Math.Round(Convert.ToDouble(bounds["x"])*scale),y=(int)Math.Round(Convert.ToDouble(bounds["y"])*scale),w=(int)Math.Round(Convert.ToDouble(bounds["width"])*scale),h=(int)Math.Round(Convert.ToDouble(bounds["height"])*scale);
                    nativePanel.SetBounds(x,y,Math.Max(1,w),Math.Max(1,h));BFViewportResize(nativeView,w,h);
                } else if(action=="show") {if(!nativeVisible){nativePanel.Visible=true;nativePanel.SendToBack();nativeVisible=true;if(nativeView!=IntPtr.Zero)BFViewportPause(nativeView,0);}}
                else if(action=="hide") {if(nativeVisible){nativePanel.Visible=false;nativeVisible=false;if(nativeView!=IntPtr.Zero)BFViewportPause(nativeView,1);}}
                else if(action=="capture"&&!string.IsNullOrEmpty(testDirectory)&&nativeView!=IntPtr.Zero)BFViewportCapture(nativeView,Path.Combine(testDirectory,"native-capture.png"));
                else if(action=="close-test-host"&&!string.IsNullOrEmpty(testDirectory))BeginInvoke(new Action(Close));
                else if(action=="fail-test-transport"&&!string.IsNullOrEmpty(testDirectory)&&nativeView!=IntPtr.Zero){byte[] header=Encoding.UTF8.GetBytes("{\"version\":999}");Marshal.WriteInt32(sharedBuffer.Buffer,header.Length);Marshal.Copy(header,0,IntPtr.Add(sharedBuffer.Buffer,4),header.Length);BFViewportSubmit(nativeView,sharedBuffer.Buffer,(uint)(header.Length+4));}
                else if(action=="replay-test-transport"&&!string.IsNullOrEmpty(testDirectory)){NativeMessage(new {topic="branchforge-native",action="status",transportSession=Convert.ToString(data["replayTransport"]),status=new {error="Stale transport test status",ready=false}});}
                else if(action=="dispose") {nativePanel.Visible=false;nativeVisible=false;}
            } catch(Exception error) { NativeMessage(new {topic="branchforge-native",action="error",message=error.Message,transportSession=nativeTransportSession}); }
        }
        private void PollNative() {
            if(closing||nativeView==IntPtr.Zero)return;
            byte[] bytes=new byte[16384];uint length=BFViewportStatus(nativeView,bytes,(uint)bytes.Length);if(length==0)return;
            string text=Encoding.UTF8.GetString(bytes,0,(int)length);
            var data=nativeJson.DeserializeObject(text);NativeMessage(new {topic="branchforge-native",action="status",status=data,transportSession=nativeTransportSession});
            if(!string.IsNullOrEmpty(testDirectory)&&nativeTick++%10==0)File.WriteAllText(Path.Combine(testDirectory,"native-status.json"),text);
        }

        private void OnStartupMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            if (closing || startupCompleted || startupFailed) return;
            Uri source;
            if (!Uri.TryCreate(args.Source, UriKind.Absolute, out source) ||
                source.GetLeftPart(UriPartial.Authority) != new Uri(serverUrl).GetLeftPart(UriPartial.Authority) ||
                source.AbsolutePath != "/") return;
            string message;
            try { message = args.TryGetWebMessageAsString(); } catch { return; }
            const string statusPrefix = "tree-duck:startup-status:";
            const string errorPrefix = "tree-duck:startup-error:";
            if (message == "tree-duck:startup-ready")
            {
                startupCompleted = true;
                webView.BringToFront();
                loadingLabel.Visible = false;
                if(string.IsNullOrEmpty(testDirectory))webView.Focus();
            }
            else if (message.StartsWith(statusPrefix, StringComparison.Ordinal))
            {
                string status = message.Substring(statusPrefix.Length);
                if (status.Length > 0 && status.Length <= 300) loadingLabel.Text = status;
            }
            else if (message.StartsWith(errorPrefix, StringComparison.Ordinal))
                ShowFatal("工作台初始化失败：\r\n" + message.Substring(errorPrefix.Length));
        }

        private static bool IsBrowserPortAllowed(int port)
        {
            if (port < 1024 || port > 65535) return false;
            // WebView2 uses Chromium's HTTP port restrictions. A free TCP
            // port (observed:4045) can still produce ERR_UNSAFE_PORT.
            // https://github.com/chromium/chromium/blob/main/net/base/port_util.cc
            switch (port)
            {
                case 1719: case 1720: case 1723: case 2049: case 3659:
                case 4045: case 5060: case 5061: case 6000: case 6566:
                case 6665: case 6666: case 6667: case 6668: case 6669:
                case 6697: case 10080: return false;
                default: return true;
            }
        }

        private static int ReservePort()
        {
            List<TcpListener> probes = new List<TcpListener>();
            try
            {
                for (int attempt = 0; attempt < 32; attempt++)
                {
                    TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
                    probes.Add(listener);
                    listener.Start();
                    int port = ((IPEndPoint)listener.LocalEndpoint).Port;
                    if (IsBrowserPortAllowed(port)) return port;
                    // Hold rejected probes until another candidate is found,
                    // so a small system port range cannot return the same one.
                }
            }
            finally
            {
                foreach (TcpListener listener in probes) listener.Stop();
            }
            throw new InvalidOperationException("暂时未找到可供界面使用的本机端口，请稍后重试。");
        }

        private void StartServer(string scriptPath, int port)
        {
            ProcessStartInfo info = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + scriptPath + "\" -Port " + port + " -NoBrowser",
                WorkingDirectory = Path.GetDirectoryName(scriptPath),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            if(!string.IsNullOrEmpty(testDirectory))info.EnvironmentVariables["BRANCHFORGE_SESSION_TEST_DIR"]=testDirectory;
            serverProcess = Process.Start(info);
            if (serverProcess == null) throw new InvalidOperationException("无法启动树鸭儿本地服务。");
        }

        private static async Task WaitForServerAsync(string url, int timeoutMs)
        {
            Stopwatch timer = Stopwatch.StartNew();
            Exception lastError = null;
            while (timer.ElapsedMilliseconds < timeoutMs)
            {
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url + "api/config");
                    request.Timeout = 700;
                    request.ReadWriteTimeout = 700;
                    using (HttpWebResponse response = (HttpWebResponse)await request.GetResponseAsync())
                    {
                        if (response.StatusCode == HttpStatusCode.OK) return;
                    }
                }
                catch (Exception ex) { lastError = ex; }
                await Task.Delay(120);
            }
            throw new TimeoutException("树鸭儿启动超时。" + (lastError == null ? "" : " " + lastError.Message));
        }

        private void ShowFatal(string message)
        {
            if (closing || startupFailed) return;
            startupFailed = true;
            loadingLabel.Text = message;
            loadingLabel.Visible = true;
            loadingLabel.BringToFront();
            MessageBox.Show(this, message, "树鸭儿 · 植物创作工坊", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            closing = true;
            nativeTimer.Stop();
            if(nativeView!=IntPtr.Zero){BFViewportDestroy(nativeView);nativeView=IntPtr.Zero;}
            if(sharedBuffer!=null){sharedBuffer.Dispose();sharedBuffer=null;}
            try
            {
                if (!string.IsNullOrEmpty(serverUrl))
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(serverUrl + "api/shutdown");
                    request.Method = "POST";
                    request.Timeout = 500;
                    using (request.GetResponse()) { }
                }
            }
            catch { }
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    if (!serverProcess.WaitForExit(700)) serverProcess.Kill();
                }
            }
            catch { }
        }
    }

    internal sealed class NativeViewportPanel : Panel
    {
        public void ResetSurface() { RecreateHandle(); }
    }

    internal sealed class StartupPanel : Control
    {
        private readonly Image illustration;
        private readonly Image mark;
        public StartupPanel()
        {
            DoubleBuffered = true;
            ResizeRedraw = true;
            string dir = Path.Combine(Path.GetDirectoryName(typeof(StartupPanel).Assembly.Location), "web", "brand");
            if (File.Exists(Path.Combine(dir, "startup-workshop-v1.png"))) illustration = Image.FromFile(Path.Combine(dir, "startup-workshop-v1.png"));
            if (File.Exists(Path.Combine(dir, "tree-duck-v5-256.png"))) mark = Image.FromFile(Path.Combine(dir, "tree-duck-v5-256.png"));
        }
        protected override void OnTextChanged(EventArgs e) { base.OnTextChanged(e); Invalidate(); }
        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            float width = Math.Min(1100, Math.Min(ClientSize.Width - 48, (ClientSize.Height - 48) * 16f / 9f));
            if (width < 100) return;
            float height = width * 9f / 16f;
            float x = (ClientSize.Width - width) / 2f, y = (ClientSize.Height - height) / 2f;
            using (Brush background = new SolidBrush(Color.FromArgb(20, 43, 35)))
                e.Graphics.FillRectangle(background, x, y, width, height);
            e.Graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            if (illustration != null) e.Graphics.DrawImage(illustration, x, y, width, height);
            float scale = width / 1100f, left = x + width * .06f;
            if (mark != null) e.Graphics.DrawImage(mark, left, y + height * .14f, 60 * scale, 60 * scale);
            using (Font title = new Font("Microsoft YaHei UI", 32 * scale, FontStyle.Bold))
            using (Font subtitle = new Font("Microsoft YaHei UI", 15 * scale))
            using (Font small = new Font("Microsoft YaHei UI", 9 * scale))
            using (Brush foreground = new SolidBrush(Color.FromArgb(240, 240, 229)))
            using (Brush muted = new SolidBrush(Color.FromArgb(185, 197, 167)))
            {
                e.Graphics.DrawString("树鸭儿", title, foreground, left, y + height * .28f);
                e.Graphics.DrawString("把灵感，种成风景。", subtitle, foreground, left, y + height * .42f);
                e.Graphics.DrawString("树木塑形 / 枝条创作 / 藤蔓生长", small, muted, left, y + height * .5f);
                e.Graphics.DrawString(Text, small, foreground, new RectangleF(left, y + height * .77f, width * .37f, height * .14f));
                e.Graphics.DrawString("鸭儿出品 · 为创作而生", small, muted, left, y + height * .92f);
            }
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) { if (illustration != null) illustration.Dispose(); if (mark != null) mark.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
