param([switch]$CheckOnly,[string]$OutputName)
$ErrorActionPreference='Stop'
$vRoot=Split-Path -Parent $PSScriptRoot
$release=Get-Content -LiteralPath (Join-Path $vRoot 'release-config.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($release.version -notmatch '^\d+\.\d+\.\d+$' -or $release.entry -notmatch '^树鸭儿V\d+\.exe$'){throw 'Invalid integrated release configuration'}
if(-not $OutputName){$OutputName=$release.entry}
$next=[IO.Path]::GetFileNameWithoutExtension($release.entry)+'.next.exe'
if($OutputName -notin @($release.entry,$next)){throw 'Use the configured versioned executable name'}
$vCsc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$vBuild=Join-Path $vRoot '.runtime/v050-build';[IO.Directory]::CreateDirectory($vBuild)|Out-Null
$vMaterialSource=[IO.File]::ReadAllText((Join-Path $vRoot 'material/native/TreeMaterialDesktop.cs'))
$vMaterialSource=[regex]::Replace($vMaterialSource,'(?m)^\[assembly:.*\]\r?\n','')
$vGenerated=Join-Path $vBuild 'MaterialDesktop.cs';[IO.File]::WriteAllText($vGenerated,$vMaterialSource,[Text.UTF8Encoding]::new($true))
$vVersion=Join-Path $vBuild 'Version.cs'
$assemblyVersion=$release.version+'.0'
$versionSource=@"
[assembly: System.Reflection.AssemblyVersion("$assemblyVersion")]
[assembly: System.Reflection.AssemblyFileVersion("$assemblyVersion")]
"@
[IO.File]::WriteAllText($vVersion,$versionSource,[Text.UTF8Encoding]::new($true))
$vFiles=@('native/BranchGeneratorDesktop.cs','native/PlantIntegration.cs','native/MaterialIntegration.cs','native/V050Integration.cs','native/V050PageCall.cs','native/V050Probe.cs','native/V050ReleaseProbe.cs','material/native/NativeDX12Host.cs','material/native/CloseProtocol.cs','material/native/LocalServiceProtocol.cs','material/native/OwnedProcessJob.cs')|ForEach-Object {Join-Path $vRoot $_}
$vOutput=Join-Path $vRoot $OutputName
& $vCsc /nologo /target:winexe /platform:x64 /main:ShuYaErV050.Program /win32icon:"$vRoot/web/brand/tree-duck-v5.ico" /out:"$vOutput" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:"$vRoot/Microsoft.Web.WebView2.Core.dll" /reference:"$vRoot/Microsoft.Web.WebView2.WinForms.dll" $vFiles $vGenerated $vVersion
if($LASTEXITCODE -ne 0){throw 'V050 desktop build failed'}
$digest=(Get-FileHash -LiteralPath $vOutput -Algorithm SHA256).Hash.ToLowerInvariant()
if($OutputName -eq $release.entry){
 $manifestPath=Join-Path $vRoot 'runtime/native/manifest.json'
 $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
 $manifest.product_version=$release.version
 $manifest.entry=$release.entry
 $manifest.entry_sha256=$digest
 [IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json -Depth 20)+"`n",[Text.UTF8Encoding]::new($false))
}
[pscustomobject]@{version=$release.version;entry=$vOutput;launched=$false;sha256=$digest}|ConvertTo-Json
