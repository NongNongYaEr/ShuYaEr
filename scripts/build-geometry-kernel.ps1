param([string]$ZigPath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(-not $ZigPath){$ZigPath=Join-Path $projectRoot '.runtime/toolchains/zig-x86_64-windows-0.14.1/zig.exe'}
if(-not(Test-Path -LiteralPath $ZigPath)){throw 'Missing pinned portable Zig toolchain; provide -ZigPath.'}
$version=(& $ZigPath version).Trim()
if($version -ne '0.14.1'){throw "Expected Zig 0.14.1, found $version"}
$nativeSource=Join-Path $projectRoot 'native/geometry/BfGeometry.cpp'
$outputFolder=Join-Path $projectRoot 'web/native'
New-Item -ItemType Directory -Path $outputFolder -Force | Out-Null
$wasmFile=Join-Path $outputFolder 'geometry-kernel-v1.wasm'
$env:ZIG_GLOBAL_CACHE_DIR=Join-Path $projectRoot '.runtime/toolchains/zig-global-cache'
$env:ZIG_LOCAL_CACHE_DIR=Join-Path $projectRoot '.runtime/toolchains/zig-local-cache'
& $ZigPath c++ $nativeSource --target=wasm32-freestanding -O3 -fno-exceptions -fno-rtti -ffp-contract=off -fno-builtin -nostdlib '-Wl,--no-entry' '-Wl,--export=bf_abi_version' '-Wl,--export=bf_normals' '-Wl,--export=bf_tangents' '-Wl,--export=bf_surface_tangents' '-Wl,--export=__heap_base' '-Wl,--export-memory' '-Wl,--initial-memory=131072' '-Wl,--max-memory=268435456' '-Wl,-z,stack-size=65536' -o $wasmFile
if($LASTEXITCODE -ne 0){throw 'C++ geometry kernel build failed'}
$record=[ordered]@{abi=1;compiler='Zig '+$version;target='wasm32-freestanding';floating_point='strict IEEE operations; contraction disabled';source='native/geometry/BfGeometry.cpp';source_sha256=(Get-FileHash -LiteralPath $nativeSource -Algorithm SHA256).Hash.ToLowerInvariant();wasm_sha256=(Get-FileHash -LiteralPath $wasmFile -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $wasmFile).Length}
[IO.File]::WriteAllText((Join-Path $outputFolder 'geometry-kernel-v1.source.json'),($record | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$record | ConvertTo-Json -Compress
