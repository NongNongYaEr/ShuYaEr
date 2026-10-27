using System;
using System.IO;
using System.Reflection;
using System.Text;

internal static class SingleFileLauncherSmoke
{
    private static MethodInfo extract;
    private static void Run(string executable, string destination)
    {
        extract.Invoke(null, new object[] { executable, destination, new Action<int, string>((value, text) => {}) });
    }
    private static void Reject(string executable, string destination)
    {
        try { Run(executable, destination); }
        catch (TargetInvocationException error)
        {
            if (!(error.InnerException is IOException) && !(error.InnerException is InvalidDataException)) throw;
            return;
        }
        throw new Exception("Invalid input was accepted: " + executable);
    }
    public static int Main(string[] args)
    {
        try
        {
            string executable = Path.GetFullPath(args[0]), root = Path.GetFullPath(args[1]);
            Directory.CreateDirectory(root);
            extract = Assembly.LoadFile(executable).GetType("TreeDuckPortable.Payload")
                .GetMethod("EnsureExtracted", BindingFlags.NonPublic | BindingFlags.Static);
            string destination = Path.Combine(root, "app");
            if (Directory.Exists(destination)) throw new Exception("Use a fresh test directory.");
            Run(executable, destination);
            if (!File.Exists(Path.Combine(destination, "树鸭儿.exe"))) throw new Exception("Missing application.");
            string saved = Path.Combine(destination, ".runtime", "single-file-test-user-data.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(saved));
            File.WriteAllText(saved, "Saved user data must survive warm launch.");
            // A cached launch must not even require reading the original package again.
            Run(Path.Combine(root, "missing.exe"), destination);
            if (File.ReadAllText(saved) != "Saved user data must survive warm launch.") throw new Exception("User data changed.");
            string broken = Path.Combine(root, "corrupt.exe");
            using (var stream = File.Create(broken))
            using (var writer = new BinaryWriter(stream))
            {
                writer.Write(new byte[16]); writer.Write((long)16);
                writer.Write(Encoding.ASCII.GetBytes("TREEDUCK_SFX_V1!"));
            }
            string rejected = Path.Combine(root, "rejected");
            Reject(broken, rejected);
            if (Directory.Exists(rejected) || Directory.GetDirectories(root, "rejected.staging-*").Length != 0)
                throw new Exception("Corrupt input left incomplete runtime files.");
            File.WriteAllBytes(broken, new byte[3]);
            Reject(broken, rejected);
            string incomplete = Path.Combine(root, "existing-user-directory");
            Directory.CreateDirectory(incomplete);
            File.WriteAllText(Path.Combine(incomplete, "project.branch.json"), "keep me");
            Reject(executable, incomplete);
            if (File.ReadAllText(Path.Combine(incomplete, "project.branch.json")) != "keep me") throw new Exception("Existing project overwritten.");
            Console.WriteLine("PASS: extraction, warm reuse, saved data preservation, corrupt/truncated package rejection, staging cleanup, incomplete directory preservation.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
