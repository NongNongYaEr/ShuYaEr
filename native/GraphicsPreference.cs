using System;
using System.IO;
using System.Text;

namespace ShuYaErV050 {
 internal static class GraphicsPreference {
  internal const string Auto = "auto";
  internal const string DirectX = "dx12";
  internal const string Compatibility = "compatibility";

  internal static bool IsMode(string mode) {
   return mode == Auto || mode == DirectX || mode == Compatibility;
  }

  static string SettingsPath(string root) {
   return Path.Combine(root, ".runtime", "graphics-mode.txt");
  }

  internal static string Read(string root) {
   try {
    string file = SettingsPath(root);
    if (!File.Exists(file) || new FileInfo(file).Length > 64) return Auto;
    string mode = File.ReadAllText(file).Trim();
    return IsMode(mode) ? mode : Auto;
   } catch (IOException) { return Auto; }
   catch (UnauthorizedAccessException) { return Auto; }
  }

  internal static void Save(string root, string mode) {
   if (!IsMode(mode)) throw new ArgumentException("无效的图形模式。");
   string file = SettingsPath(root);
   Directory.CreateDirectory(Path.GetDirectoryName(file));
   string temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
   try {
    File.WriteAllText(temporary, mode, new UTF8Encoding(false));
    if (File.Exists(file)) File.Replace(temporary, file, null);
    else File.Move(temporary, file);
   } finally {
    if (File.Exists(temporary)) File.Delete(temporary);
   }
  }
 }
}
