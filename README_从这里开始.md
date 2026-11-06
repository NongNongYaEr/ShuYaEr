# 树鸭儿 0.5.2 · 精简公开源码

完整功能源码与八类用途样本。采用《树鸭儿免费使用与源码公开许可 1.0》，允许内部生产和商业作品创作；商业分发软件、源码、修改版或原始素材库需单独书面授权。见 LICENSE.txt、ASSETS_LICENSE.md、BRAND_NOTICE.md 和 THIRD_PARTY_NOTICES.md。本项目是源码可用许可。

## 准备与重建

取得对应 V052 精简单文件 EXE，在本目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-source-runtime.ps1 -RuntimeSource "..\01_精简EXE"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
```

准备脚本先检查 portable-runtime.json 固定的 EXE 哈希，再以隐藏的仅准备模式提取 Node、WebView2、植物和材质两套已验证的 DX12 依赖，并按样本清单还原压缩资源。之后双击生成的“树鸭儿V052.exe”。无需原开发磁盘或开发者缓存。

`web/` 与 `native/` 是植物工作台；`material/web/`、`material/core/`、`material/native/` 是嵌入式材质工作台；`scripts/` 包含构建及服务。样本在 `sample-resources/` 按内容块去重压缩，保留校验清单。公开目录不含 EXE、DLL、CSO、私人工程、恢复资料或完整植物库。

```powershell
runtime/node.exe --experimental-loader ./tests/vendor-loader.mjs --test tests/unit-preparation.test.mjs tests/keyboard-transform.test.mjs tests/plant-unit-grid.test.mjs tests/unit-authoring.test.mjs tests/sculpt-material-response.test.mjs tests/sculpt-distribution-templates.test.mjs tests/local-endgrain.test.mjs
```

源码自带构建记录、第三方许可和原生模块源码。普通 C# 桌面重建复用经过校验的 DX12 运行库；修改原生渲染后需按构建脚本安装 Visual Studio C++、Windows SDK 和着色器翻译工具，再重建对应模块。`test:all` 包含全资产、历史夹具和桌面环境测试，不等于精简包的一键验收。

材质资源包含设计/推导 PBR，来源和实际尺寸随资源登记。48 方向、60 叠加和 18 组合的功能验收与逐套展示级美术审核分开。
