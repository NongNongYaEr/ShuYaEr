param([Parameter(Mandatory=$true)][string]$AppDirectory,[Parameter(Mandatory=$true)][string]$OutputPath,[string]$BuildDirectory,[string]$Flavor='v020-lite')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$AppDirectory=(Resolve-Path -LiteralPath $AppDirectory).Path
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
if(Test-Path -LiteralPath $OutputPath){throw 'Use a fresh single-file output path'}
if(-not $BuildDirectory){$BuildDirectory=Join-Path $projectRoot ('.runtime/portable-build/'+[Guid]::NewGuid().ToString('N'))}
$BuildDirectory=[IO.Path]::GetFullPath($BuildDirectory)
if((Test-Path -LiteralPath $BuildDirectory) -and @(Get-ChildItem -LiteralPath $BuildDirectory -Force).Count){throw 'Use a fresh build directory'}
[IO.Directory]::CreateDirectory($BuildDirectory)|Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($OutputPath))|Out-Null
$node=Join-Path $projectRoot 'runtime/node.exe'
$helper=Join-Path $PSScriptRoot 'portable-desktop-package.mjs'
& $node $helper prepare $AppDirectory $BuildDirectory
if($LASTEXITCODE -ne 0){throw 'Portable application input verification failed'}
$pack=Join-Path $BuildDirectory 'resources.pack'
& $node (Join-Path $PSScriptRoot 'pack-release-resources.mjs') $AppDirectory (Join-Path $BuildDirectory 'input-manifest.json') $pack
if($LASTEXITCODE -ne 0){throw 'Portable resource packing failed'}
& $node $helper config $AppDirectory $BuildDirectory '树鸭儿 V020 精简单文件版' $Flavor
if($LASTEXITCODE -ne 0){throw 'Portable configuration failed'}
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /target:winexe /platform:x64 ('/out:'+(Join-Path $BuildDirectory 'launcher.exe')) ('/win32icon:'+(Join-Path $projectRoot 'web/brand/tree-duck-v5.ico')) /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $projectRoot 'native/PortableDesktopLauncher.cs') (Join-Path $projectRoot 'native/PackedResourceReader.cs') (Join-Path $BuildDirectory 'PackageConfig.cs')
if($LASTEXITCODE -ne 0){throw 'Single-file launcher compilation failed'}
& $node $helper finish $AppDirectory $BuildDirectory $OutputPath
if($LASTEXITCODE -ne 0){throw 'Single-file assembly failed'}
# These are exact temporary files inside this fresh build directory.
Remove-Item -LiteralPath $pack,($pack+'.blocks')
