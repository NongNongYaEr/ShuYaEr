param([string]$OutputPath)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not $OutputPath){$OutputPath=Join-Path $root "树鸭儿.exe"}
$release=Get-Content -LiteralPath (Join-Path $root 'release-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($release.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid desktop release version'}
$buildDirectory=Join-Path $root ('.runtime/desktop-build/'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
$versionFile=Join-Path $buildDirectory 'DesktopVersion.cs'
$versionSource=@"
[assembly: System.Reflection.AssemblyVersion("$($release.version).0")]
[assembly: System.Reflection.AssemblyFileVersion("$($release.version).0")]
[assembly: System.Reflection.AssemblyInformationalVersion("$($release.version)-$($release.channel)")]
"@
[IO.File]::WriteAllText($versionFile,$versionSource,[Text.UTF8Encoding]::new($false))
& $csc /nologo /target:winexe /platform:x64 /win32icon:"$root\web\brand\tree-duck-v5.ico" /out:"$OutputPath" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:"$root\Microsoft.Web.WebView2.Core.dll" /reference:"$root\Microsoft.Web.WebView2.WinForms.dll" "$root\native\BranchGeneratorDesktop.cs" $versionFile
if($LASTEXITCODE -ne 0){throw 'Desktop build failed'}
