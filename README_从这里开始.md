# 树鸭儿 V096 · 精简公开源码

版本 0.9.6。本目录提供植物工作台、树干整理、材质工作台的源码和精简样本。许可见 LICENSE.txt、ASSETS_LICENSE.md、BRAND_NOTICE.md 和 THIRD_PARTY_NOTICES.md。

## 准备与重建

将同版「01_精简EXE」放在本目录旁。在本目录中运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-source-runtime.ps1 -RuntimeSource "..\01_精简EXE"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
```

准备脚本根据 `portable-runtime.json` 核验便携 EXE，再提取 Node、WebView2 与 DX12 运行依赖，并还原精简样本。完成后可运行「树鸭儿V096.exe」。

`web/` 与 `native/` 是植物工作台和桌面宿主。`material/` 是嵌入式材质工作台。`scripts/` 提供构建和服务脚本。

```powershell
runtime/node.exe --experimental-loader ./tests/vendor-loader.mjs --test tests/unit-preparation.test.mjs tests/tree-light-wrap.test.mjs tests/release-files.test.mjs
```

桌面重建会复用准备好的 DX12 运行库。修改原生渲染代码时，按相应构建脚本准备 Visual Studio C++、Windows SDK 和着色器工具。
