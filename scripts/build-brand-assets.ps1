$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$brandDir=Join-Path (Split-Path -Parent $PSScriptRoot) 'web/brand'
$source=[Drawing.Image]::FromFile((Join-Path $brandDir 'tree-duck-v5.png'))
$sizes=@(16,24,32,48,64,128,256)
$frames=New-Object 'System.Collections.Generic.List[byte[]]'
try {
 foreach($size in $sizes){
  $bitmap=New-Object Drawing.Bitmap($size,$size)
  $graphics=[Drawing.Graphics]::FromImage($bitmap)
  $stream=New-Object IO.MemoryStream
  try {
   $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
   $graphics.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
   $attributes=New-Object Drawing.Imaging.ImageAttributes
   try {
    $attributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $graphics.DrawImage($source,[Drawing.Rectangle]::new(0,0,$size,$size),0,0,$source.Width,$source.Height,[Drawing.GraphicsUnit]::Pixel,$attributes)
   }finally{$attributes.Dispose()}
   $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
   if($size -eq 256){[IO.File]::WriteAllBytes((Join-Path $brandDir 'tree-duck-v5-256.png'),$stream.ToArray())}
   # Classic 32-bit DIB frames also work with the .NET Framework shell icon reader.
   $dibStream=New-Object IO.MemoryStream
   $dib=New-Object IO.BinaryWriter($dibStream)
   $maskStride=[int]([Math]::Ceiling($size/32.0)*4)
   try {
    $dib.Write([uint32]40);$dib.Write([int]$size);$dib.Write([int]($size*2))
    $dib.Write([uint16]1);$dib.Write([uint16]32);$dib.Write([uint32]0)
    $dib.Write([uint32]($size*$size*4+$maskStride*$size))
    $dib.Write([int]0);$dib.Write([int]0);$dib.Write([uint32]0);$dib.Write([uint32]0)
    $pixels=$bitmap.LockBits([Drawing.Rectangle]::new(0,0,$size,$size),[Drawing.Imaging.ImageLockMode]::ReadOnly,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
     $row=New-Object byte[] ($size*4)
     for($y=$size-1;$y -ge 0;$y--){
      [Runtime.InteropServices.Marshal]::Copy([IntPtr]::Add($pixels.Scan0,$y*$pixels.Stride),$row,0,$row.Length)
      $dib.Write([byte[]]$row)
     }
    }finally{$bitmap.UnlockBits($pixels)}
    $dib.Write([byte[]](New-Object byte[] ($maskStride*$size)))
    $frames.Add($dibStream.ToArray())
   }finally{$dib.Dispose();$dibStream.Dispose()}
  }finally{$stream.Dispose();$graphics.Dispose();$bitmap.Dispose()}
 }
 $file=[IO.File]::Create((Join-Path $brandDir 'tree-duck-v5.ico'))
 $writer=New-Object IO.BinaryWriter($file)
 try {
  $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$sizes.Count)
  $offset=6+16*$sizes.Count
  for($i=0;$i -lt $sizes.Count;$i++){
   $dimension=if($sizes[$i] -eq 256){0}else{$sizes[$i]}
   $writer.Write([byte]$dimension);$writer.Write([byte]$dimension)
   $writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32)
   $writer.Write([uint32]$frames[$i].Length);$writer.Write([uint32]$offset)
   $offset+=$frames[$i].Length
  }
  foreach($frame in $frames){$writer.Write([byte[]]$frame)}
 }finally{$writer.Dispose();$file.Dispose()}
}finally{$source.Dispose()}
Write-Output 'Exported approved v5 artwork as 256px PNG and 7-size Windows ICO.'
