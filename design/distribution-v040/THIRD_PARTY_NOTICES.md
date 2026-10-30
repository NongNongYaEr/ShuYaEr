# 第三方组件

自有代码使用 LICENSE.txt 中的免费使用与源码公开许可。以下组件保留原许可及权利人声明，树鸭儿自身的商业分发限制不覆盖这些第三方组件本身。

| 组件 | 随附许可位置 |
| --- | --- |
| Three.js | `web/vendor/THREE-LICENSE.txt` |
| Lucide | `web/vendor/LUCIDE-LICENSE.txt` |
| fflate | `web/vendor/FFLATE-LICENSE.txt` |
| FBX Exporter | `web/vendor/FBX-EXPORTER-LICENSE.txt` |
| nlohmann/json | `native/vendor/nlohmann/LICENSE.MIT`（源码）或 `runtime/native/nlohmann-json-LICENSE.MIT`（运行版） |
| Node.js 21.0.0 及其组件 | `runtime/NODE-LICENSE.txt`、`runtime/NOTICE.txt` |
| Microsoft WebView2 | 根目录 `WEBVIEW2-LICENSE.txt`、`WEBVIEW2-NOTICE.txt` |
| NVIDIA Streamline | `runtime/native/NVIDIA-Streamline-license.txt`、`NVIDIA-third-party-licenses.md` |
| NVIDIA DLSS | `runtime/native/nvngx_dlss.license.txt` |

公开源码目录不提交 Node.exe、WebView2 DLL、NVIDIA DLL 或其他预编译 EXE/DLL。可从对应版本的 EXE 发行目录按哈希验证准备运行依赖。完整重建 DX12 模块时，`scripts/prepare-native-sdk.ps1` 按固定版本与 SHA256 获取官方 SDK，编译方法见源码 README。

公开源码包中 `sample-resources` 压缩存放资源文件，运行准备后还原至原路径；其中的供应商 JS / wasm 继续使用供应商原许可，植物样本和品牌图片分别见资产及品牌说明。
