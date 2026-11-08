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
            var cacheDirectory = payload.GetMethod("CacheDirectory", BindingFlags.NonPublic | BindingFlags.Static);
            string overrideRoot = Environment.GetEnvironmentVariable("BRANCHFORGE_PORTABLE_CACHE_ROOT");
            string testExe = Path.Combine(root, "test.exe");
            try
            {
                Environment.SetEnvironmentVariable("BRANCHFORGE_PORTABLE_CACHE_ROOT", null);
                string defaultCache = (string)cacheDirectory.Invoke(null, new object[] { testExe });
                if (!String.Equals(Path.GetDirectoryName(defaultCache), Path.Combine(root, "树鸭儿数据"), StringComparison.OrdinalIgnoreCase))
                    throw new Exception("Default runtime is not beside the EXE");
                string explicitRoot = Path.Combine(root, "explicit-cache");
                Environment.SetEnvironmentVariable("BRANCHFORGE_PORTABLE_CACHE_ROOT", explicitRoot);
                string explicitCache = (string)cacheDirectory.Invoke(null, new object[] { testExe });
                if (!String.Equals(Path.GetDirectoryName(explicitCache), explicitRoot, StringComparison.OrdinalIgnoreCase))
                    throw new Exception("Explicit runtime override was ignored");
            }
            finally { Environment.SetEnvironmentVariable("BRANCHFORGE_PORTABLE_CACHE_ROOT", overrideRoot); }
            string app = Path.Combine(root, "app"); if (Directory.Exists(app)) throw new Exception("Fresh test directory required");
            Run(exe, app);
            var serializer = new JavaScriptSerializer { MaxJsonLength = 24 * 1024 * 1024 };
            Manifest manifest = serializer.Deserialize<Manifest>(File.ReadAllText(args[2]));
            foreach (Entry item in manifest.files) { string file = Path.Combine(app, item.path); if (new FileInfo(file).Length != item.bytes || Digest(file) != item.sha256) throw new Exception("Extracted bytes differ: " + item.path); }
            if (Directory.GetFiles(app, "*", SearchOption.AllDirectories).Length != manifest.files.Length + 1) throw new Exception("Unexpected extracted file");
            string saved = Path.Combine(app, ".runtime", "preserve-user-project.json"); Directory.CreateDirectory(Path.GetDirectoryName(saved)); File.WriteAllText(saved, "{\"userOwned\":true}");
            Run(Path.Combine(root, "missing.exe"), app); if (File.ReadAllText(saved) != "{\"userOwned\":true}") throw new Exception("Saved data overwritten");
            string migrated = Path.Combine(root, "migrated");
            var prepare = payload.GetMethod("EnsurePrepared", BindingFlags.NonPublic | BindingFlags.Static);
            prepare.Invoke(null, new object[] { testExe, migrated, app, new Action<int, string>((n, s) => {}) });
            string migratedProject = Path.Combine(migrated, ".runtime", "preserve-user-project.json");
            if (Digest(migratedProject) != Digest(saved)) throw new Exception("Legacy project was not migrated intact");
            File.WriteAllText(migratedProject, "{\"userOwned\":true,\"edited\":true}");
            prepare.Invoke(null, new object[] { testExe, migrated, app, new Action<int, string>((n, s) => {}) });
            if (!File.ReadAllText(migratedProject).Contains("edited") || File.ReadAllText(saved).Contains("edited"))
                throw new Exception("Migrated or legacy project was overwritten");
            string boot = Path.Combine(app, "server.ps1"); byte[] original = File.ReadAllBytes(boot);
            try { File.WriteAllText(boot, "local change"); Reject(exe, app); if (File.ReadAllText(boot) != "local change") throw new Exception("Changed runtime overwritten"); } finally { File.WriteAllBytes(boot, original); }
            string corrupt = Path.Combine(root, "corrupt.exe"); File.Copy(exe, corrupt);
            long bytes = (long)assembly.GetType("TreeDuckPortable.PackageConfig").GetField("PayloadBytes").GetRawConstantValue();
            using (var file = new FileStream(corrupt, FileMode.Open, FileAccess.ReadWrite)) { file.Position = file.Length - 24 - bytes + 30; int old = file.ReadByte(); file.Position--; file.WriteByte((byte)(old ^ 1)); }
            string rejected = Path.Combine(root, "rejected"); Reject(corrupt, rejected);
            File.WriteAllBytes(corrupt, new byte[3]); Reject(corrupt, rejected);
            string existing = Path.Combine(root, "existing-user-directory"); Directory.CreateDirectory(existing); File.WriteAllText(Path.Combine(existing, "project.branch.json"), "keep me"); Reject(exe, existing);
            if (File.ReadAllText(Path.Combine(existing, "project.branch.json")) != "keep me" || Directory.Exists(rejected) || Directory.GetDirectories(root, "*.staging-*").Length != 0) throw new Exception("User directory or failed staging protection failed");
            Console.WriteLine("PASS: " + manifest.files.Length + " extracted files match SHA256; adjacent default and explicit override; legacy project migrated once; existing data preserved; invalid payloads rejected and staging removed.");
            return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
