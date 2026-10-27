<#
只生成诊断图，不修改原 PNG，也不更新素材主清单。
例：powershell -File scripts/inspect-plant-tile.ps1 -ImageSourcePath "C:/实际位置/image.png" -RecordName "001_surface_tile"
输出：植物图片素材库/制作记录/<RecordName>.2x2.png 和 <RecordName>.edge-contrast.json
原尺寸复制四份，不修边、不混合、不缩放。数值只辅助判断，不能代替实际2x2目视验收。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ImageSourcePath,
  [string]$RecordName = ''
)
$ErrorActionPreference = 'Stop'

if (-not [IO.Path]::IsPathRooted($ImageSourcePath)) { throw 'ImageSourcePath 必须是绝对路径。' }
$tileSource = [IO.Path]::GetFullPath($ImageSourcePath)
if ([IO.Path]::GetExtension($tileSource) -ine '.png' -or -not (Test-Path -LiteralPath $tileSource -PathType Leaf)) { throw '只接受已有 PNG 文件。' }
if (-not $RecordName) { $RecordName = [IO.Path]::GetFileNameWithoutExtension($tileSource) }
if ($RecordName -notmatch '^[\p{L}\p{N}_-]+$') { throw 'RecordName 只允许文字、数字、下划线和短横线。' }
$tileWorkspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$tileRecords = [IO.Path]::GetFullPath((Join-Path $tileWorkspace '植物图片素材库/制作记录'))
if (-not $tileRecords.StartsWith($tileWorkspace.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '诊断输出越出开发目录。' }
foreach ($tileDirectory in @((Join-Path $tileWorkspace '植物图片素材库'), $tileRecords)) {
  if (Test-Path -LiteralPath $tileDirectory) {
    if ((Get-Item -LiteralPath $tileDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "拒绝符号链接或 junction: $tileDirectory" }
  } else { $null = New-Item -ItemType Directory -Path $tileDirectory }
}
$tilePreview = Join-Path $tileRecords "$RecordName.2x2.png"
$tileReport = Join-Path $tileRecords "$RecordName.edge-contrast.json"
$tileHash = (Get-FileHash -LiteralPath $tileSource -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Test-Path -LiteralPath $tilePreview) -or (Test-Path -LiteralPath $tileReport)) {
  if ((Test-Path -LiteralPath $tilePreview -PathType Leaf) -and (Test-Path -LiteralPath $tileReport -PathType Leaf)) {
    $tileExisting = Get-Content -LiteralPath $tileReport -Raw | ConvertFrom-Json
    $tileActualPreviewHash = (Get-FileHash -LiteralPath $tilePreview -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($tileExisting.sourceSHA256 -eq $tileHash -and $tileExisting.previewSHA256 -eq $tileActualPreviewHash) {
      $tileExisting | ConvertTo-Json -Depth 8
      return
    }
  }
  throw '已有不同或不完整诊断记录；请使用新的 RecordName，脚本不覆盖已有输出。'
}

Add-Type -AssemblyName System.Drawing
if (-not ('PlantTileInspection' -as [type])) {
  $tileDrawingRefs = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Size].Assembly.Location)
  $tileDrawingDir = [IO.Path]::GetDirectoryName([System.Drawing.Bitmap].Assembly.Location)
  $tileDrawingRefs += @(Get-ChildItem -LiteralPath $tileDrawingDir -Filter 'System.Private.Windows.*.dll' | Select-Object -ExpandProperty FullName)
  $tileDrawingRefs += @('System.Runtime', 'System.Runtime.InteropServices')
  Add-Type -ReferencedAssemblies $tileDrawingRefs -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;

public sealed class TileContrast {
    public long sampleCount;
    public double meanAbsoluteRGBDifference;
    public double rootMeanSquareRGBDifference;
    public double p95MeanAbsoluteRGBDifference;
    public double maxMeanAbsoluteRGBDifference;
    public double meanAbsoluteAlphaDifference;
}
public sealed class TileInspectionResult {
    public int width, height;
    public TileContrast leftRightSeam, topBottomSeam, internalHorizontalNeighbors, internalVerticalNeighbors;
    public double leftRightToInternalRatio, topBottomToInternalRatio;
}
public static class PlantTileInspection {
    private sealed class Accumulator {
        public long Count, Sum, SquareSum, AlphaSum;
        public int Max;
        public readonly long[] Histogram = new long[766];
        public void Add(byte[] pixels, int a, int b) {
            int sum = 0;
            for (int channel = 0; channel < 3; channel++) {
                int diff = Math.Abs(pixels[a + channel] - pixels[b + channel]);
                sum += diff; SquareSum += diff * diff;
            }
            Count++; Sum += sum; AlphaSum += Math.Abs(pixels[a + 3] - pixels[b + 3]);
            Max = Math.Max(Max, sum); Histogram[sum]++;
        }
        public TileContrast Finish() {
            if (Count == 0) return new TileContrast();
            long target = (long)Math.Ceiling(Count * 0.95), cumulative = 0;
            int p95 = 0;
            for (; p95 < Histogram.Length; p95++) { cumulative += Histogram[p95]; if (cumulative >= target) break; }
            return new TileContrast { sampleCount = Count,
                meanAbsoluteRGBDifference = Sum / (3.0 * Count),
                rootMeanSquareRGBDifference = Math.Sqrt(SquareSum / (3.0 * Count)),
                p95MeanAbsoluteRGBDifference = p95 / 3.0, maxMeanAbsoluteRGBDifference = Max / 3.0,
                meanAbsoluteAlphaDifference = AlphaSum / (double)Count };
        }
    }
    public static TileInspectionResult Inspect(string source, string preview) {
        using (Bitmap original = new Bitmap(source)) {
            int width = original.Width, height = original.Height;
            if (width < 2 || height < 2 || width > 8192 || height > 8192) throw new ArgumentException("诊断只支持每边 2–8192 像素。");
            using (Bitmap flat = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
                using (Graphics graphics = Graphics.FromImage(flat)) {
                    graphics.CompositingMode = CompositingMode.SourceCopy;
                    graphics.DrawImageUnscaled(original, 0, 0);
                }
                byte[] pixels = new byte[checked(width * height * 4)];
                BitmapData data = flat.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                try {
                    for (int y = 0; y < height; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), pixels, y * width * 4, width * 4);
                } finally { flat.UnlockBits(data); }
                Accumulator leftRight = new Accumulator(), topBottom = new Accumulator(), across = new Accumulator(), down = new Accumulator();
                for (int y = 0; y < height; y++) {
                    leftRight.Add(pixels, y * width * 4, (y * width + width - 1) * 4);
                    for (int x = 1; x < width; x++) across.Add(pixels, (y * width + x - 1) * 4, (y * width + x) * 4);
                }
                for (int x = 0; x < width; x++) {
                    topBottom.Add(pixels, x * 4, ((height - 1) * width + x) * 4);
                    for (int y = 1; y < height; y++) down.Add(pixels, ((y - 1) * width + x) * 4, (y * width + x) * 4);
                }
                TileInspectionResult result = new TileInspectionResult { width = width, height = height,
                    leftRightSeam = leftRight.Finish(), topBottomSeam = topBottom.Finish(),
                    internalHorizontalNeighbors = across.Finish(), internalVerticalNeighbors = down.Finish() };
                result.leftRightToInternalRatio = result.leftRightSeam.meanAbsoluteRGBDifference / Math.Max(0.000001, result.internalHorizontalNeighbors.meanAbsoluteRGBDifference);
                result.topBottomToInternalRatio = result.topBottomSeam.meanAbsoluteRGBDifference / Math.Max(0.000001, result.internalVerticalNeighbors.meanAbsoluteRGBDifference);
                using (Bitmap mosaic = new Bitmap(checked(width * 2), checked(height * 2), PixelFormat.Format32bppArgb)) {
                    using (Graphics graphics = Graphics.FromImage(mosaic)) {
                        graphics.CompositingMode = CompositingMode.SourceCopy;
                        graphics.DrawImageUnscaled(flat, 0, 0); graphics.DrawImageUnscaled(flat, width, 0);
                        graphics.DrawImageUnscaled(flat, 0, height); graphics.DrawImageUnscaled(flat, width, height);
                    }
                    using (FileStream output = new FileStream(preview, FileMode.CreateNew, FileAccess.Write, FileShare.None)) mosaic.Save(output, ImageFormat.Png);
                }
                return result;
            }
        }
    }
}
'@
}
$tileResult = [PlantTileInspection]::Inspect($tileSource, $tilePreview)
$tileReportObject = [ordered]@{
  version = 1
  inspectedAt = [DateTime]::UtcNow.ToString('o')
  sourcePath = $tileSource
  sourceSHA256 = $tileHash
  previewPath = $tilePreview
  previewSHA256 = (Get-FileHash -LiteralPath $tilePreview -Algorithm SHA256).Hash.ToLowerInvariant()
  method = '原尺寸四份2x2拼接；RGB各通道0–255绝对差，对比左右/上下边界和图内相邻像素。未修边或混合。'
  visualReview = 'pending'
  seamCheck2x2 = 'pending'
  note = '边界对比值不自动判定无缝；必须实际打开2x2诊断图复核。PNG结构检查由audit脚本完成。'
  dimensions = @{ width = $tileResult.width; height = $tileResult.height }
  leftRightSeam = $tileResult.leftRightSeam
  topBottomSeam = $tileResult.topBottomSeam
  internalHorizontalNeighbors = $tileResult.internalHorizontalNeighbors
  internalVerticalNeighbors = $tileResult.internalVerticalNeighbors
  leftRightToInternalRatio = $tileResult.leftRightToInternalRatio
  topBottomToInternalRatio = $tileResult.topBottomToInternalRatio
}
$tileJSON = $tileReportObject | ConvertTo-Json -Depth 8
$tileUTF8 = [Text.UTF8Encoding]::new($false)
$tileReportStream = [IO.FileStream]::new($tileReport, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
  $tileReportBytes = $tileUTF8.GetBytes($tileJSON + [Environment]::NewLine)
  $tileReportStream.Write($tileReportBytes, 0, $tileReportBytes.Length)
} finally { $tileReportStream.Dispose() }
$tileJSON
