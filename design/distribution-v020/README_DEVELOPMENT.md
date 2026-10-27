# 树鸭儿 {{VERSION}} · 全资产开发副本

这是 V020 确定版本的干净开发副本，可直接运行根目录 `树鸭儿.exe`，也可继续修改 `web`、`native` 和当前 `scripts`。本目录使用自身的配置与缓存，不依赖旧开发目录。

保留当前完整单元枝、叶花果、预制枝干和整株样板库，并附带 Blender 原件、初始样本、次枝制作资产、植物图片素材及相关开发说明。未复制 `.runtime`、旧发布包、历史备份、导出历史和测试生成目录。原目录仍然保留，不作删除或移动。

样板的预览图已整理到当前库内；旧样本源图和制作文件继续保留在原有相对目录。运行版样板入口不指向旧盘。当前资产数量及原文件校验见上级目录交付记录。

本副本沿用 V020 的免费使用与源码公开许可；第三方组件仍遵守自身许可。详见 LICENSE.txt、ASSETS_LICENSE.md、BRAND_NOTICE.md 和 THIRD_PARTY_NOTICES.md。不要直接把此全资产目录上传到公开源码仓库。

开发检查：`runtime/node.exe --experimental-loader ./tests/vendor-loader.mjs --test tests/*.test.mjs`。部分桌面和 UE 检查需要本机工具链或测试环境；精简源码中的核心检查同样可用。

构建桌面壳用 `scripts/build-desktop.ps1`。原生重建先 `scripts/prepare-native-sdk.ps1`，再 `scripts/build-native-viewport.ps1`；不复制旧 SDK 缓存，按固定官方版本重新准备。项目格式 4、视口 ABI 1 及 UE/PVE 约定保持。

单文件分发使用 `scripts/build-portable-desktop.ps1 -AppDirectory <已校验的运行目录> -OutputPath <新的单EXE路径>`，它将目录中的已验证程序、依赖及资产去重打包。V020 的 01 为单文件 EXE，首次打开自动准备到系统应用数据目录，后续复用；源码运行环境准备脚本同时兼容单文件和完整目录。`prepare-v020-distributions.mjs` 生成四套基础目录后，再对精简运行目录执行此单文件打包步骤。
