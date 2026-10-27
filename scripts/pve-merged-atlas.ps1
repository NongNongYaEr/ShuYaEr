param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class PveAtlasPixelCopy {
    public static void Copy(Bitmap source, Bitmap target, int x, int y) {
        var src=source.LockBits(new Rectangle(0,0,source.Width,source.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
        BitmapData dst=null;
        try {
            dst=target.LockBits(new Rectangle(0,0,target.Width,target.Height),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
            var row=new byte[source.Width*4];
            int left=Math.Max(0,x-8),right=Math.Min(target.Width,x+source.Width+8);
            var padded=new byte[(right-left)*4];
            for(int j=Math.Max(0,y-8);j<Math.Min(target.Height,y+source.Height+8);j++) {
                int sy=Math.Max(0,Math.Min(source.Height-1,j-y));
                Marshal.Copy(IntPtr.Add(src.Scan0,sy*src.Stride),row,0,row.Length);
                for(int i=left;i<right;i++) Buffer.BlockCopy(row,Math.Max(0,Math.Min(source.Width-1,i-x))*4,padded,(i-left)*4,4);
                Marshal.Copy(padded,0,IntPtr.Add(dst.Scan0,j*dst.Stride+left*4),padded.Length);
            }
        } finally {if(dst!=null)target.UnlockBits(dst);source.UnlockBits(src);}
    }
}
'@
$layout=[Console]::In.ReadToEnd() | ConvertFrom-Json
foreach($channel in @('color','normal')) {
    if($channel -eq 'normal' -and -not ($layout.sources | Where-Object normal)) { continue }
    $canvas=[Drawing.Bitmap]::new($layout.width,$layout.height,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics=[Drawing.Graphics]::FromImage($canvas)
    try {
        $graphics.CompositingMode=[Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.Clear($(if($channel -eq 'normal'){[Drawing.Color]::FromArgb(255,128,128,255)}else{[Drawing.Color]::Transparent}))
        $graphics.Dispose();$graphics=$null
        foreach($source in $layout.sources) {
            $uri=$source.$channel
            if(-not $uri) { continue }
            $stream=[IO.MemoryStream]::new([Convert]::FromBase64String(($uri -split ',',2)[1]))
            $image=$null
            try {
                $image=[Drawing.Image]::FromStream($stream,$true,$true)
                if($image.Width -ne $source.width -or $image.Height -ne $source.height){throw 'Color/normal atlas dimensions differ; textures were not resized'}
                # Copy original pixels, including alpha. Never resample source textures.
                [PveAtlasPixelCopy]::Copy($image,$canvas,[int]$source.x,[int]$source.y)
            } finally {if($image){$image.Dispose()};$stream.Dispose()}
        }
        $canvas.Save((Join-Path $OutputDirectory "leaf_atlas_$channel.png"),[Drawing.Imaging.ImageFormat]::Png)
    } finally {if($graphics){$graphics.Dispose()};$canvas.Dispose()}
}
