$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$workspaceRoot=Split-Path -Parent $PSScriptRoot
$outputDir=Join-Path $workspaceRoot '.runtime/brand-approved'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$assembly=[Reflection.Assembly]::LoadFrom((Join-Path $workspaceRoot '树鸭儿.exe'))
$panel=[Activator]::CreateInstance($assembly.GetType('BranchGeneratorFBXTool.StartupPanel'))
$bitmap=New-Object Drawing.Bitmap(1280,800)
try {
 $panel.Size=New-Object Drawing.Size(1280,800)
 $panel.BackColor=[Drawing.Color]::FromArgb(29,36,28)
 $panel.Text='Starting Tree Duck...'
 $panel.DrawToBitmap($bitmap,[Drawing.Rectangle]::new(0,0,1280,800))
 $bitmap.Save((Join-Path $outputDir 'native-startup.png'),[Drawing.Imaging.ImageFormat]::Png)
}finally{$bitmap.Dispose();$panel.Dispose()}
$iconPath=Join-Path $workspaceRoot 'web/brand/tree-duck-v5.ico'
foreach($size in @(16,24,32,48,64,128,256)){
 $icon=New-Object Drawing.Icon($iconPath,$size,$size)
 $image=$icon.ToBitmap()
 try{$image.Save((Join-Path $outputDir ('icon-'+$size+'.png')),[Drawing.Imaging.ImageFormat]::Png)}finally{$image.Dispose();$icon.Dispose()}
}
Write-Output 'Native startup rendered offscreen; all seven Windows icon sizes loaded.'
