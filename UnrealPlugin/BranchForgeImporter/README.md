# BranchForge Importer

这是只在 Unreal Editor 中加载的辅助插件，不参与游戏运行时和打包。

## 安装

1. 把整个 `BranchForgeImporter` 文件夹复制到 UE 项目的 `Plugins` 目录。
2. 重新生成项目文件并编译 Editor Target。
3. 在插件管理器确认 `Python Editor Script Plugin` 与 `BranchForge Importer` 已启用。

## 使用

在 BranchForge 中导出时启用“UE 导入脚本”。进入 Unreal Editor 后选择：

`Tools > Import BranchForge Package...`

选择同目录下的 `.ue-import.py`。脚本会导入 LOD0、挂接其他 LOD、应用屏幕尺寸和 Nanite 策略并保存 Static Mesh。

也可以在编辑器控制台执行：

```text
BranchForge.Import D:/Exports/MyBranch.ue-import.py
```

材质实例参数、质量门禁和配方分别保存在 `.materials.json`、`.validation.json` 与 `.recipe.json`，便于项目侧继续做自动化处理。
