param([string]$InputFile,[string]$AtlasFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
public static class AtlasAudit {
 public static string Hash(Bitmap image,Rectangle region) {
  var d=image.LockBits(region,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try {using(var sha=SHA256.Create()) {
   var row=new byte[region.Width*4];
   for(int y=0;y<region.Height;y++){Marshal.Copy(IntPtr.Add(d.Scan0,y*d.Stride),row,0,row.Length);sha.TransformBlock(row,0,row.Length,null,0);}
   sha.TransformFinalBlock(new byte[0],0,0);return BitConverter.ToString(sha.Hash);
  }} finally {image.UnlockBits(d);}
 }
}
'@
$sources=Get-Content -LiteralPath $InputFile -Raw | ConvertFrom-Json
$atlas=[Drawing.Bitmap]::new($AtlasFile)
try {
 foreach($source in $sources) {
  $stream=[IO.MemoryStream]::new([Convert]::FromBase64String(($source.color -split ',',2)[1]))
  $image=[Drawing.Image]::FromStream($stream,$true,$true)
  try {
   $expected=[AtlasAudit]::Hash($image,[Drawing.Rectangle]::new(0,0,$image.Width,$image.Height))
   $actual=[AtlasAudit]::Hash($atlas,[Drawing.Rectangle]::new($source.x,$source.y,$source.width,$source.height))
   if($actual -ne $expected){throw ('Atlas pixel mismatch: '+$source.key)}
  } finally {$image.Dispose();$stream.Dispose()}
 }
 Write-Output 'All source atlas RGBA pixels match.'
} finally {$atlas.Dispose()}
