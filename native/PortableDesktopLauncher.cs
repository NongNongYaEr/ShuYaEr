using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;


namespace TreeDuckPortable
{
    internal static class Payload
    {
        internal static string CacheDirectory()
        {
            string root = Environment.GetEnvironmentVariable("BRANCHFORGE_PORTABLE_CACHE_ROOT");
            if (String.IsNullOrEmpty(root)) root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Yaer", "TreeDuck", "Portable");
            return Path.Combine(Path.GetFullPath(root), PackageConfig.Version + "-" + PackageConfig.Flavor + "-" + PackageConfig.PayloadHash.Substring(0, 16));
        }
        private static string HashFile(string file)
        {
            using (FileStream input = File.OpenRead(file))
            using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
        }
        private static void VerifyRuntime(string directory)
        {
            for (int i = 0; i < PackageConfig.CriticalPaths.Length; i++)
            {
                string file = Path.Combine(directory, PackageConfig.CriticalPaths[i]);
                if (!File.Exists(file) || HashFile(file) != PackageConfig.CriticalHashes[i])
                    throw new IOException("运行文件缺失或已改变：" + PackageConfig.CriticalPaths[i] + "\n工程和自建素材仍然保留，本程序不会覆盖它们。\n运行目录：" + directory);
            }
        }
        internal static string EnsureExtracted(string executable, string destination, Action<int, string> progress)
        {
            destination = Path.GetFullPath(destination);
            string marker = Path.Combine(destination, ".package-ready");
            if (Directory.Exists(destination))
            {
                if (!File.Exists(marker) || File.ReadAllText(marker) != PackageConfig.PayloadHash)
                    throw new IOException("运行目录不完整。为保护里面的工程，本程序不会覆盖它：\n" + destination);
                VerifyRuntime(destination);
                return destination;
            }
            string stage = destination + ".staging-" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(stage);
            try
            {
                using (FileStream input = File.OpenRead(executable))
                {
                    if (input.Length < 24) throw new InvalidDataException("程序包不完整，请重新下载。");
                    input.Position = input.Length - 24;
                    BinaryReader footer = new BinaryReader(input, Encoding.UTF8, true);
                    long length = footer.ReadInt64();
                    if (Encoding.ASCII.GetString(footer.ReadBytes(16)) != "TREEDUCK_SFX_V2!" || length != PackageConfig.PayloadBytes || length <= 0 || length > input.Length - 24)
                        throw new InvalidDataException("程序包尾部校验失败，请重新下载。");
                    long offset = input.Length - 24 - length;
                    input.Position = offset;
                    progress(2, "正在检查内置程序和样本…");
                    using (SHA256 hash = SHA256.Create())
                    {
                        byte[] buffer = new byte[1048576]; long remaining = length;
                        while (remaining > 0)
                        {
                            int count = input.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                            if (count <= 0) throw new EndOfStreamException();
                            hash.TransformBlock(buffer, 0, count, buffer, 0); remaining -= count;
                        }
                        hash.TransformFinalBlock(new byte[0], 0, 0);
                        if (BitConverter.ToString(hash.Hash).Replace("-", "").ToLowerInvariant() != PackageConfig.PayloadHash)
                            throw new InvalidDataException("程序包内容校验失败，请重新下载。");
                    }
                    input.Position = offset;
                    if (!PackedResourceReader.TryExtract(input, length, stage, progress)) throw new InvalidDataException("内置资源格式无效。");
                }
                VerifyRuntime(stage);
                File.WriteAllText(Path.Combine(stage, ".package-ready"), PackageConfig.PayloadHash);
                for (int attempt = 0; ; attempt++)
                {
                    try { Directory.Move(stage, destination); break; }
                    catch (IOException) { if (attempt >= 19 || Directory.Exists(destination)) throw; }
                    catch (UnauthorizedAccessException) { if (attempt >= 19 || Directory.Exists(destination)) throw; }
                    Thread.Sleep(250);
                }
                progress(100, "准备完成，正在打开树鸭儿…");
                return destination;
            }
            finally
            {
                if (Directory.Exists(stage) && Path.GetFullPath(stage).StartsWith(destination + ".staging-", StringComparison.OrdinalIgnoreCase)) Directory.Delete(stage, true);
            }
        }
    }

    internal sealed class PrepareWindow : Form
    {
        private readonly Label status;
        private readonly ProgressBar progress;
        private bool canClose;
        internal int Result = 1;
        public PrepareWindow()
        {
            Text = "树鸭儿 · 首次准备"; ClientSize = new Size(490, 205);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(37, 40, 43);
            ForeColor = Color.WhiteSmoke; Font = new Font("Microsoft YaHei UI", 10);
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Label title = new Label { Text = "树鸭儿，准备开始创作", Left = 26, Top = 24, Width = 430, Height = 34,
                Font = new Font("Microsoft YaHei UI", 16, FontStyle.Bold), ForeColor = Color.FromArgb(255, 216, 72) };
            status = new Label { Text = "正在检查完整程序包…", Left = 28, Top = 76, Width = 432, Height = 28 };
            progress = new ProgressBar { Left = 28, Top = 113, Width = 432, Height = 14 };
            Label note = new Label { Text = "仅首次运行准备资源，以后双击即可启动。", Left = 28, Top = 153, Width = 432, Height = 24,
                ForeColor = Color.Silver };
            Controls.AddRange(new Control[] { title, status, progress, note });
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (!canClose) e.Cancel = true; };
            Shown += async delegate
            {
                try
                {
                    string directory = await Task.Run(() => Payload.EnsureExtracted(Application.ExecutablePath, Payload.CacheDirectory(),
                        (value, text) => BeginInvoke((Action)(() => { progress.Value = value; status.Text = text; }))));
                    Hide(); Result = await Task.Run(() => Program.RunApplication(directory));
                }
                catch (Exception error) { MessageBox.Show(this, error.Message, "树鸭儿启动未完成", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
                finally { canClose = true; Close(); }
            };
        }
    }

    internal static class Program
    {
        internal static int RunApplication(string directory)
        {
            ProcessStartInfo start = new ProcessStartInfo(Path.Combine(directory, "树鸭儿.exe"));
            start.WorkingDirectory = directory; start.UseShellExecute = false;
            start.EnvironmentVariables["BRANCHFORGE_APP_ROOT"] = directory;
            using (Process child = Process.Start(start)) { child.WaitForExit(); return child.ExitCode; }
        }
        [STAThread]
        private static int Main(string[] args)
        {
            bool prepareOnly = args.Length == 2 && args[0] == "--prepare-only";
            bool testQuiet = Environment.GetEnvironmentVariable("BRANCHFORGE_PORTABLE_TEST_QUIET") == "1" && !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("BRANCHFORGE_PORTABLE_CACHE_ROOT"));
            try
            {
                if (prepareOnly) { Payload.EnsureExtracted(Application.ExecutablePath, args[1], (value, text) => { }); return 0; }
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                bool owner;
                using (Mutex mutex = new Mutex(true, "Local\\Yaer.TreeDuck.Portable." + PackageConfig.PayloadHash.Substring(0, 16), out owner))
                {
                    if (!owner) { if (!testQuiet) MessageBox.Show("树鸭儿正在准备或已经运行，请切换到现有窗口。", "树鸭儿"); return 0; }
                    try
                    {
                        string directory = Payload.CacheDirectory();
                        if (testQuiet || Directory.Exists(directory)) return RunApplication(Payload.EnsureExtracted(Application.ExecutablePath, directory, (value, text) => { }));
                        using (PrepareWindow window = new PrepareWindow()) { Application.Run(window); return window.Result; }
                    }
                    finally { mutex.ReleaseMutex(); }
                }
            }
            catch (Exception error)
            {
                if (prepareOnly || testQuiet) Console.Error.WriteLine(error);
                else MessageBox.Show(error.Message, "树鸭儿启动未完成", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return 1;
            }
        }
    }
}
