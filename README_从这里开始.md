# 树鸭儿 0.3.0 · 精简公开源码

V030 确定版本，Windows x64。允许免费使用、学习、修改以及用软件制作商业作品；商业分发软件、源码、修改版或原始素材库需作者单独书面授权。本项目采用 **源码可用许可**，不宣称为 OSI 标准开源软件。详见 LICENSE.txt、ASSETS_LICENSE.md 和 BRAND_NOTICE.md。

## 目录

- `web/`：当前网页 UI、编辑逻辑、模型算法及前端运行代码。
- `native/`：C# 桌面壳、C++ DX12 模块、着色器和几何内核源码。
- `scripts/`：本地服务、导出、构建与分发工具。
- `tests/`：开发检查与桌面交互验收。
- `sample-resources/`：按原文件压缩保存的样本资源及校验清单，准备时还原。

精简样本覆盖乔木、灌木、观叶、常春藤、花藤、草叶、大叶草本和花卉；实际依赖与数量见资产清单。没有完整素材库、EXE、DLL、旧发布包、缓存或个人恢复草稿。

## 本地准备与运行

1. 取得与本源码对应的 **0.3.0 精简单文件 EXE**。V030 交付中为相邻 `01_精简EXE` 内唯一的 `树鸭儿.exe`。完整目录形式的运行版也继续兼容。
2. 在源码目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-source-runtime.ps1 -RuntimeSource "..\01_精简EXE"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
```

准备脚本先按 `portable-runtime.json` 验证单文件 EXE 的 SHA256，然后以隐藏的仅准备模式读取其内置运行资源，复制 Node / WebView2 / 已验证 DX12 运行库，并按清单还原源码样本。之后双击源码目录中生成的 `树鸭儿.exe`。GitHub 单独下载源码时，先取得对应的单文件 EXE 并传入其路径即可，不依赖原开发磁盘。

3. 开发检查：

```powershell
runtime/node.exe --experimental-loader ./tests/vendor-loader.mjs --test tests/unit-preparation.test.mjs tests/keyboard-transform.test.mjs tests/plant-unit-grid.test.mjs tests/unit-authoring.test.mjs
```

`npm test` 同样运行不依赖完整素材库的核心检查。`npm run test:all` 包含完整素材数量、历史样本及本机桌面条件检查，不作为精简包的一键验收。

## 完整重建 DX12

安装 Visual Studio C++ x64 构建工具和 Windows SDK；Windows 自带 .NET Framework C# 编译器用于桌面壳。运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-native-sdk.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-native-viewport.ps1
```

SDK 版本和下载哈希固定在准备脚本中，生成目录为 `.runtime/native-editor`；用 `scripts/package-professional-desktop.ps1 -BuiltDirectory .runtime/native-editor` 发布到本源码目录。更新前保存并退出本目录中的软件，发布脚本会保护运行中的编辑器。

更改 UI 和 JS 可直接重开软件；更改原生渲染需重建模块。第三方许可见 THIRD_PARTY_NOTICES.md。生成的运行依赖、解压资源和缓存已列入 `.gitignore`，不应重新提交到公开仓库。
