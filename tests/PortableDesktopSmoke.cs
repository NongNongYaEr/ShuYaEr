using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

internal static class PortableDesktopSmoke
{
    public sealed class Entry { public string path; public long bytes; public string sha256; }
    public sealed class Manifest { public Entry[] files; }
    private static MethodInfo extract;
    private static string Digest(string file) { using (var input = File.OpenRead(file)) using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(input)).Replace("-", "").ToLowerInvariant(); }
    private static void Run(string exe, string folder) { extract.Invoke(null, new object[] { exe, folder, new Action<int, string>((n, s) => {}) }); }
    private static void Reject(string exe, string folder)
    {
        try { Run(exe, folder); }
        catch (TargetInvocationException e) { if (e.InnerException is IOException || e.InnerException is InvalidDataException) return; throw; }
        throw new Exception("Invalid input accepted");
    }
    public static int Main(string[] args)
    {
        try
        {
            string exe = Path.GetFullPath(args[0]), root = Path.GetFullPath(args[1]);
            Directory.CreateDirectory(root); var assembly = Assembly.LoadFile(exe); var payload = assembly.GetType("TreeDuckPortable.Payload");
            extract = payload.GetMethod("EnsureExtracted", BindingFlags.NonPublic | BindingFlags.Static);
            string defaultCache = (string)payload.GetMethod("CacheDirectory", BindingFlags.NonPublic | BindingFlags.Static).Invoke(null, null);
            if (String.IsNullOrEmpty(Environment.GetEnvironmentVariable("BRANCHFORGE_PORTABLE_CACHE_ROOT")) && !defaultCache.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("Default runtime is not under local application data");
            string app = Path.Combine(root, "app"); if (Directory.Exists(app)) throw new Exception("Fresh test directory required");
            Run(exe, app);
            var serializer = new JavaScriptSerializer { MaxJsonLength = 24 * 1024 * 1024 };
            Manifest manifest = serializer.Deserialize<Manifest>(File.ReadAllText(args[2]));
            foreach (Entry item in manifest.files) { string file = Path.Combine(app, item.path); if (new FileInfo(file).Length != item.bytes || Digest(file) != item.sha256) throw new Exception("Extracted bytes differ: " + item.path); }
            if (Directory.GetFiles(app, "*", SearchOption.AllDirectories).Length != manifest.files.Length + 1) throw new Exception("Unexpected extracted file");
            string saved = Path.Combine(app, ".runtime", "preserve-user-project.json"); Directory.CreateDirectory(Path.GetDirectoryName(saved)); File.WriteAllText(saved, "{\"userOwned\":true}");
            Run(Path.Combine(root, "missing.exe"), app); if (File.ReadAllText(saved) != "{\"userOwned\":true}") throw new Exception("Saved data overwritten");
            string boot = Path.Combine(app, "server.ps1"); byte[] original = File.ReadAllBytes(boot);
            try { File.WriteAllText(boot, "local change"); Reject(exe, app); if (File.ReadAllText(boot) != "local change") throw new Exception("Changed runtime overwritten"); } finally { File.WriteAllBytes(boot, original); }
            string corrupt = Path.Combine(root, "corrupt.exe"); File.Copy(exe, corrupt);
            long bytes = (long)assembly.GetType("TreeDuckPortable.PackageConfig").GetField("PayloadBytes").GetRawConstantValue();
            using (var file = new FileStream(corrupt, FileMode.Open, FileAccess.ReadWrite)) { file.Position = file.Length - 24 - bytes + 30; int old = file.ReadByte(); file.Position--; file.WriteByte((byte)(old ^ 1)); }
            string rejected = Path.Combine(root, "rejected"); Reject(corrupt, rejected);
            File.WriteAllBytes(corrupt, new byte[3]); Reject(corrupt, rejected);
            string existing = Path.Combine(root, "existing-user-directory"); Directory.CreateDirectory(existing); File.WriteAllText(Path.Combine(existing, "project.branch.json"), "keep me"); Reject(exe, existing);
            if (File.ReadAllText(Path.Combine(existing, "project.branch.json")) != "keep me" || Directory.Exists(rejected) || Directory.GetDirectories(root, "*.staging-*").Length != 0) throw new Exception("User directory or failed staging protection failed");
            Console.WriteLine("PASS: " + manifest.files.Length + " extracted files match SHA256; warm launch reuses verified runtime; saved data, changed runtime and existing directories preserved; corrupted/truncated payloads rejected; staging removed; default cache uses local application data.");
            return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
