using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace TreeDuckPortable
{
    internal static class PackedResourceReader
    {
        public sealed class Block { public int bytes; public int compressedBytes; public long offset; public string sha256; }
        public sealed class FileEntry { public string path; public long bytes; public string sha256; public int[] blocks; }
        public sealed class Manifest { public int version; public FileEntry[] files; public Block[] blocks; public long unpackedBytes; }
        private static string Digest(byte[] bytes)
        {
            using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }
        internal static bool TryExtract(string archivePath, string stage, Action<int, string> progress)
        {
            using (FileStream input = File.OpenRead(archivePath))
            {
                return TryExtract(input, input.Length, stage, progress);
            }
        }
        // Read the appended payload directly from its bounded range in the EXE.
        internal static bool TryExtract(Stream input, long archiveLength, string stage, Action<int, string> progress)
        {
            long archiveStart = input.Position;
            if (archiveLength < 24 || archiveLength > input.Length - archiveStart) return false;
            long archiveEnd = archiveStart + archiveLength;
            {
                BinaryReader reader = new BinaryReader(input, Encoding.UTF8, true);
                if (Encoding.ASCII.GetString(reader.ReadBytes(16)) != "TREEDUCK_PACK_V1") return false;
                long metadataLength = reader.ReadInt64();
                if (metadataLength <= 0 || metadataLength > 24 * 1024 * 1024 || metadataLength > archiveLength - 24) throw new InvalidDataException("资源索引不完整。");
                JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = 24 * 1024 * 1024 };
                Manifest manifest = serializer.Deserialize<Manifest>(Encoding.UTF8.GetString(reader.ReadBytes((int)metadataLength)));
                if (manifest == null || manifest.version != 1 || manifest.files == null || manifest.blocks == null || manifest.files.Length > 20000 || manifest.blocks.Length > 500000) throw new InvalidDataException("资源索引无效。");
                long dataOffset = input.Position, restoredBytes = 0;
                string root = Path.GetFullPath(stage) + Path.DirectorySeparatorChar;
                Dictionary<int, byte[]> cache = new Dictionary<int, byte[]>(); Queue<int> cacheOrder = new Queue<int>(); long cacheBytes = 0;
                for (int fileIndex = 0; fileIndex < manifest.files.Length; fileIndex++)
                {
                    FileEntry file = manifest.files[fileIndex];
                    if (file == null || String.IsNullOrEmpty(file.path) || file.path.Contains(":") || file.bytes < 0 || file.blocks == null) throw new InvalidDataException("资源文件路径无效。");
                    string target = Path.GetFullPath(Path.Combine(stage, file.path));
                    if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("资源文件路径越界。");
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    long length = 0;
                    using (FileStream output = new FileStream(target, FileMode.CreateNew))
                    using (SHA256 fileHash = SHA256.Create())
                    {
                        foreach (int id in file.blocks)
                        {
                            if (id < 0 || id >= manifest.blocks.Length) throw new InvalidDataException("资源块引用无效。");
                            byte[] bytes;
                            if (!cache.TryGetValue(id, out bytes))
                            {
                                Block block = manifest.blocks[id];
                                if (block == null || block.bytes <= 0 || block.bytes > 524288 || block.compressedBytes <= 0 || block.compressedBytes > 1048576 || block.offset < 0 || block.offset > archiveEnd - dataOffset - block.compressedBytes) throw new InvalidDataException("资源块范围无效。");
                                input.Position = dataOffset + block.offset;
                                byte[] compressed = reader.ReadBytes(block.compressedBytes);
                                if (compressed.Length != block.compressedBytes) throw new EndOfStreamException();
                                bytes = new byte[block.bytes];
                                using (MemoryStream compressedStream = new MemoryStream(compressed, false))
                                using (DeflateStream decompressed = new DeflateStream(compressedStream, CompressionMode.Decompress))
                                {
                                    int done = 0;
                                    while (done < bytes.Length) { int count = decompressed.Read(bytes, done, bytes.Length - done); if (count <= 0) throw new EndOfStreamException(); done += count; }
                                    if (decompressed.ReadByte() != -1) throw new InvalidDataException("资源块长度无效。");
                                }
                                if (Digest(bytes) != block.sha256) throw new InvalidDataException("资源块校验失败。");
                                while (cacheBytes + bytes.Length > 32 * 1024 * 1024 && cacheOrder.Count > 0) { int old = cacheOrder.Dequeue(); cacheBytes -= cache[old].Length; cache.Remove(old); }
                                cache.Add(id, bytes); cacheOrder.Enqueue(id); cacheBytes += bytes.Length;
                            }
                            length += bytes.Length; if (length > file.bytes) throw new InvalidDataException("资源文件长度无效。");
                            output.Write(bytes, 0, bytes.Length); fileHash.TransformBlock(bytes, 0, bytes.Length, bytes, 0);
                        }
                        fileHash.TransformFinalBlock(new byte[0], 0, 0);
                        if (length != file.bytes || BitConverter.ToString(fileHash.Hash).Replace("-", "").ToLowerInvariant() != file.sha256) throw new InvalidDataException("资源文件校验失败。");
                    }
                    restoredBytes += length;
                    progress(10 + (int)(85L * (fileIndex + 1) / manifest.files.Length), "首次准备资源 " + (fileIndex + 1) + " / " + manifest.files.Length);
                }
                if (restoredBytes != manifest.unpackedBytes) throw new InvalidDataException("资源总长度校验失败。");
                return true;
            }
        }
    }
}
