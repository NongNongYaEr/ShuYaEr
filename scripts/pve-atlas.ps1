param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$stream = [IO.MemoryStream]::new([Convert]::FromBase64String([Console]::In.ReadToEnd()))
$image = $null
try {
    $image = [Drawing.Image]::FromStream($stream, $true, $true)
    $image.Save($Destination, [Drawing.Imaging.ImageFormat]::Png)
} finally {
    if ($image) { $image.Dispose() }
    $stream.Dispose()
}
