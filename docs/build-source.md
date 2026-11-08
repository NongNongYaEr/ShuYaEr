[项目首页](../README.md) / [使用文档](README.md) / 构建源码

> 本次公开精简源码与样本。准备运行依赖时，需要作者提供的对应 V071 精简 EXE。

# 树鸭儿 0.7.1 · 精简公开源码

完整功能源码与八类植物样本。软件采用《树鸭儿免费使用与源码公开许可 1.0》。允许内部生产和商业作品创作，商业分发软件、源码、修改版或原始素材库需作者书面授权。许可及资源说明见 `LICENSE.txt`、`ASSETS_LICENSE.md`、`BRAND_NOTICE.md` 和 `THIRD_PARTY_NOTICES.md`。

## 准备与重建

取得同版本的「01_精简EXE」后，在本目录执行。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-source-runtime.ps1 -RuntimeSource "..\01_精简EXE"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
```

准备脚本按 `portable-runtime.json` 校验同版 EXE，再还原运行依赖和样本。重建后双击「树鸭儿V071.exe」。系统需有 WebView2。

`web` 和 `native` 为植物工作台，`material` 为材质工作台。八类样本存于 `sample-resources` 的压缩资源块。公开包的运行二进制由同版 EXE 提取，完整素材库和制作原件随私有开发版保存。

对应 EXE 的 SHA256 见 [portable-runtime.json](../portable-runtime.json)。将 `-RuntimeSource` 指向同版 EXE 的文件或目录即可。
