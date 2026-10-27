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

[assembly: AssemblyTitle("树鸭儿")]
[assembly: AssemblyProduct("树鸭儿 V0.1 精简试用版")]
[assembly: AssemblyCompany("鸭儿")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace TreeDuckPortable
{
    // This envelope deters direct archive browsing; the local key is not DRM.
    internal static class Payload
    {
        internal static string CacheDirectory()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Yaer", "TreeDuck", "Portable", "0.1-lite-" + PackageConfig.CipherHash.Substring(0, 16));
        }

        internal static string EnsureExtracted(string executable, string destination, Action<int, string> progress)
        {
            destination = Path.GetFullPath(destination);
            string marker = Path.Combine(destination, ".package-ready");
            if (Directory.Exists(destination))
            {
                if (File.Exists(marker) && File.ReadAllText(marker) == PackageConfig.CipherHash
                    && File.Exists(Path.Combine(destination, "树鸭儿.exe"))
                    && File.Exists(Path.Combine(destination, "server.ps1"))) return destination;
                throw new IOException("运行目录不完整。为保护里面的工程，本程序不会覆盖它。请先备份该目录再重试：\n" + destination);
            }
            string stage = destination + ".staging-" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(stage);
            try
            {
                using (FileStream source = File.OpenRead(executable))
                {
                    if (source.Length < 24) throw new InvalidDataException("程序包不完整，请重新下载。");
                    source.Position = source.Length - 24;
                    BinaryReader footer = new BinaryReader(source, Encoding.UTF8, true);
                    long length = footer.ReadInt64();
                    string magic = Encoding.ASCII.GetString(footer.ReadBytes(16));
                    if (magic != "TREEDUCK_SFX_V1!" || length <= 0 || length > source.Length - 24)
                        throw new InvalidDataException("程序包尾部校验失败，请重新下载。");
                    long offset = source.Length - 24 - length;
                    source.Position = offset;
                    byte[] buffer = new byte[1024 * 1024]; long remaining = length;
                    using (SHA256 hash = SHA256.Create())
                    {
                        while (remaining > 0)
                        {
                            int count = source.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                            if (count == 0) throw new EndOfStreamException();
                            hash.TransformBlock(buffer, 0, count, buffer, 0); remaining -= count;
                        }
                        hash.TransformFinalBlock(new byte[0], 0, 0);
                        if (BitConverter.ToString(hash.Hash).Replace("-", "").ToLowerInvariant() != PackageConfig.CipherHash)
                            throw new InvalidDataException("程序包已损坏或内容发生变化，请重新下载。");
                    }
                    progress(5, "正在准备内置植物与运行资源…");
                    string archivePath = Path.Combine(stage, ".payload.tmp");
                    source.Position = offset; remaining = length;
                    using (Aes aes = Aes.Create())
                    {
                        aes.Key = Convert.FromBase64String(PackageConfig.Key);
                        aes.IV = Convert.FromBase64String(PackageConfig.IV);
                        using (FileStream output = File.Create(archivePath))
                        using (CryptoStream decrypted = new CryptoStream(output, aes.CreateDecryptor(), CryptoStreamMode.Write))
                        {
                            while (remaining > 0)
                            {
                                int count = source.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                                if (count == 0) throw new EndOfStreamException();
                                decrypted.Write(buffer, 0, count); remaining -= count;
                            }
                            decrypted.FlushFinalBlock();
                        }
                    }
                    using (ZipArchive archive = ZipFile.OpenRead(archivePath))
                    {
                        int index = 0; string root = stage + Path.DirectorySeparatorChar;
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string name = entry.FullName.Replace('\\', '/');
                            string prefix = PackageConfig.ArchiveRoot + "/";
                            if (!name.StartsWith(prefix, StringComparison.Ordinal)) throw new InvalidDataException("资源目录无效。");
                            string relative = name.Substring(prefix.Length);
                            if (relative.Length == 0) continue;
                            if (relative.Contains(":")) throw new InvalidDataException("资源路径无效。");
                            string target = Path.GetFullPath(Path.Combine(stage, relative));
                            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("资源路径越界。");
                            if (name.EndsWith("/")) Directory.CreateDirectory(target);
                            else
                            {
                                Directory.CreateDirectory(Path.GetDirectoryName(target));
                                using (Stream input = entry.Open())
                                using (FileStream output = new FileStream(target, FileMode.CreateNew)) input.CopyTo(output);
                            }
                            progress(10 + (int)(85L * ++index / archive.Entries.Count), "首次准备资源 " + index + " / " + archive.Entries.Count);
                        }
                    }
                    File.Delete(archivePath);
                }
                File.WriteAllText(Path.Combine(stage, ".package-ready"), PackageConfig.CipherHash);
                // Antivirus scanners can briefly hold freshly extracted DLL/EXE handles.
                // Retry the atomic rename without replacing an existing runtime directory.
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
                // Only our random staging directory is removed; never the user's runtime directory.
                if (Directory.Exists(stage) && Path.GetFullPath(stage).StartsWith(destination + ".staging-", StringComparison.OrdinalIgnoreCase))
                    Directory.Delete(stage, true);
            }
        }
    }

    internal sealed class PrepareWindow : Form
    {
        private readonly Label status;
        private readonly ProgressBar progress;
        private bool canClose;
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
                    Hide(); await Task.Run(() => Program.RunApplication(directory));
                }
                catch (Exception error) { MessageBox.Show(this, error.Message, "树鸭儿启动未完成", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
                finally { canClose = true; Close(); }
            };
        }
    }

    internal static class Program
    {
        internal static void RunApplication(string directory)
        {
            ProcessStartInfo start = new ProcessStartInfo(Path.Combine(directory, "树鸭儿.exe"));
            start.WorkingDirectory = directory; start.UseShellExecute = false;
            using (Process child = Process.Start(start)) child.WaitForExit();
        }
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            bool owner;
            using (Mutex mutex = new Mutex(true, "Local\\Yaer.TreeDuck.Portable." + PackageConfig.CipherHash.Substring(0, 16), out owner))
            {
                if (!owner) { MessageBox.Show("树鸭儿正在准备或已经运行，请切换到现有窗口。", "树鸭儿"); return; }
                try
                {
                    string directory = Payload.CacheDirectory();
                    if (Directory.Exists(directory)) RunApplication(Payload.EnsureExtracted(Application.ExecutablePath, directory, (value, text) => { }));
                    else Application.Run(new PrepareWindow());
                }
                catch (Exception error) { MessageBox.Show(error.Message, "树鸭儿启动未完成", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
                finally { mutex.ReleaseMutex(); }
            }
        }
    }
}
