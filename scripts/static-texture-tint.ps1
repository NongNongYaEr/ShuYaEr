param([string]$SourceFile, [string]$Destination, [string]$Tint)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class BranchForgeTextureTint {
 public static void Bake(string source, string destination, double[] tint) {
  using (var input = new Bitmap(source))
  using (var output = new Bitmap(input.Width, input.Height, PixelFormat.Format32bppArgb)) {
   using (var g = Graphics.FromImage(output)) { g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy; g.DrawImageUnscaled(input, 0, 0); }
   var bytes = output.LockBits(new Rectangle(0,0,output.Width,output.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
   try {
    var row = new byte[output.Width * 4]; var table = new byte[3,256];
    for(int channel=0;channel<3;channel++) for(int value=0;value<256;value++) {
     double s = value/255.0; double l = (s<=0.04045?s/12.92:Math.Pow((s+0.055)/1.055,2.4))*tint[2-channel];
     s = l<=0.0031308?12.92*l:1.055*Math.Pow(l,1.0/2.4)-0.055;
     table[channel,value]=(byte)Math.Floor(Math.Max(0,Math.Min(1,s))*255+0.5);
    }
    for(int y=0;y<output.Height;y++) {
     var ptr = IntPtr.Add(bytes.Scan0,y*bytes.Stride); Marshal.Copy(ptr,row,0,row.Length);
     for(int x=0;x<row.Length;x+=4) for(int c=0;c<3;c++) row[x+c]=table[c,row[x+c]];
     Marshal.Copy(row,0,ptr,row.Length);
    }
   } finally { output.UnlockBits(bytes); }
   output.Save(destination,ImageFormat.Png);
  }
 }
}
'@
[BranchForgeTextureTint]::Bake($SourceFile, $Destination, [double[]]($Tint | ConvertFrom-Json))
