// Bounds are percentages of actual editor screenshots.
export const treeRepairPictures = {
  "prune-stroke": {
    "src": "tree-repair-prune-stroke.webp",
    "width": 972,
    "height": 746
  },
  "prune-result": {
    "src": "tree-repair-prune-result.webp",
    "width": 333,
    "height": 300
  },
  "prune-undo": {
    "src": "tree-repair-prune-undo.webp",
    "width": 237,
    "height": 295
  },
  "prune-line": {
    "src": "tree-repair-prune-line.webp",
    "width": 823,
    "height": 423
  },
  "prune-erase": {
    "src": "tree-repair-prune-erase.webp",
    "width": 975,
    "height": 600
  },
  "prune-retract": {
    "src": "tree-repair-prune-retract.webp",
    "width": 1120,
    "height": 753
  },
  "prune-grow": {
    "src": "tree-repair-prune-grow.webp",
    "width": 935,
    "height": 552
  },
  "join-source": {
    "src": "tree-repair-join-source.webp",
    "width": 339,
    "height": 170
  },
  "join-install-options": {
    "src": "tree-repair-join-install-options.webp",
    "width": 336,
    "height": 180
  },
  "join-install-preview": {
    "src": "tree-repair-join-install-preview.webp",
    "width": 1660,
    "height": 1120
  },
  "join-before": {
    "src": "tree-repair-join-before.webp",
    "width": 1305,
    "height": 760
  },
  "join-after": {
    "src": "tree-repair-join-after.webp",
    "width": 1018,
    "height": 554
  },
  "selection-group": {
    "src": "tree-repair-selection-group.webp",
    "width": 653,
    "height": 224
  },
  "selection-isolated": {
    "src": "tree-repair-selection-isolated.webp",
    "width": 658,
    "height": 483
  },
  "selection-save": {
    "src": "tree-repair-selection-save.webp",
    "width": 336,
    "height": 209
  },
  "selection-restore": {
    "src": "tree-repair-selection-restore.webp",
    "width": 1163,
    "height": 295
  }
};

export const treeRepairMarkers = {
  "tree-repair-prune-stroke.webp": [
    {
      "x": 3.29,
      "y": 88.2,
      "w": 4.48,
      "h": 5.76,
      "label": "展开修剪生长并选修剪"
    },
    {
      "x": 33.61,
      "y": 6.97,
      "w": 15.64,
      "h": 3.75,
      "label": "选中枝条及子枝"
    },
    {
      "x": 78.89,
      "y": 50.64,
      "w": 7,
      "h": 9.12,
      "label": "笔迹穿过想保留的枝段末端"
    },
    {
      "x": 90.21,
      "y": 33.3,
      "w": 6.07,
      "h": 7.91,
      "label": "裁切位置以外的子枝"
    }
  ],
  "tree-repair-prune-result.webp": [
    {
      "x": 36.17,
      "y": 63.12,
      "w": 19.52,
      "h": 21.67,
      "label": "母枝剪后留下的端点"
    },
    {
      "x": 69.63,
      "y": 17.48,
      "w": 19.52,
      "h": 21.67,
      "label": "被裁切移除的远端子枝位置"
    },
    {
      "x": 9.86,
      "y": 39.99,
      "w": 20.12,
      "h": 22.33,
      "label": "仍然保留的近端子枝"
    }
  ],
  "tree-repair-prune-undo.webp": [
    {
      "x": 57.33,
      "y": 17.77,
      "w": 27.43,
      "h": 22.03,
      "label": "撤销后恢复的远端子枝"
    },
    {
      "x": 13.62,
      "y": 63.82,
      "w": 25.74,
      "h": 20.68,
      "label": "恢复原长度的承重枝"
    }
  ],
  "tree-repair-prune-line.webp": [
    {
      "x": 3.95,
      "y": 79.2,
      "w": 5.29,
      "h": 10.17,
      "label": "划线剪"
    },
    {
      "x": 85.12,
      "y": 12.35,
      "w": 10.45,
      "h": 20.33,
      "label": "起点和终点之间的直线切过枝条"
    }
  ],
  "tree-repair-prune-erase.webp": [
    {
      "x": 3.28,
      "y": 85.33,
      "w": 4.46,
      "h": 7.17,
      "label": "删除枝"
    },
    {
      "x": 90.11,
      "y": 8.79,
      "w": 6.15,
      "h": 10,
      "label": "在独立子枝上刷过"
    }
  ],
  "tree-repair-prune-retract.webp": [
    {
      "x": 2.9,
      "y": 88.31,
      "w": 3.88,
      "h": 5.71,
      "label": "回缩"
    },
    {
      "x": 71.49,
      "y": 41.27,
      "w": 6.16,
      "h": 9.16,
      "label": "沿界面向下拖动"
    },
    {
      "x": 91.88,
      "y": 6.91,
      "w": 4.91,
      "h": 1.99,
      "label": "沿枝路回缩"
    }
  ],
  "tree-repair-prune-grow.webp": [
    {
      "x": 3.42,
      "y": 84.06,
      "w": 4.65,
      "h": 7.79,
      "label": "延长"
    },
    {
      "x": 87.53,
      "y": 9.56,
      "w": 8.56,
      "h": 14.49,
      "label": "从枝梢区域向新方向拖动"
    }
  ],
  "tree-repair-join-source.webp": [
    {
      "x": 3.54,
      "y": 30.95,
      "w": 85.84,
      "h": 20.23,
      "label": "连接点与根部"
    },
    {
      "x": 3.54,
      "y": 55.29,
      "w": 9.44,
      "h": 18.24,
      "label": "移动连接点"
    },
    {
      "x": 14.45,
      "y": 55.29,
      "w": 9.44,
      "h": 18.24,
      "label": "旋转连接方向"
    },
    {
      "x": 25.37,
      "y": 55.29,
      "w": 9.44,
      "h": 18.24,
      "label": "连接点归根"
    }
  ],
  "tree-repair-join-install-options.webp": [
    {
      "x": 4.46,
      "y": 29.21,
      "w": 84.82,
      "h": 10.33,
      "label": "自动匹配安装粗度"
    },
    {
      "x": 4.46,
      "y": 43.98,
      "w": 84.82,
      "h": 10.33,
      "label": "自然连接过渡"
    },
    {
      "x": 4.46,
      "y": 58.76,
      "w": 23.81,
      "h": 16.11,
      "label": "预览安装"
    }
  ],
  "tree-repair-join-install-preview.webp": [
    {
      "x": 46.14,
      "y": 46.01,
      "w": 5.54,
      "h": 8.21,
      "label": "预览枝根与母枝接合的位置"
    },
    {
      "x": 23.86,
      "y": 88.95,
      "w": 21.39,
      "h": 1.34,
      "label": "核对挂接母枝和位置"
    },
    {
      "x": 77.35,
      "y": 88.37,
      "w": 1.69,
      "h": 2.5,
      "label": "确认安装"
    }
  ],
  "tree-repair-join-before.webp": [
    {
      "x": 24.6,
      "y": 51.3,
      "w": 8.97,
      "h": 15.39,
      "label": "检查程序侧枝根部与母枝的硬交界"
    },
    {
      "x": 2.49,
      "y": 88.42,
      "w": 3.33,
      "h": 5.66,
      "label": "粗细截面分组下的接点"
    },
    {
      "x": 78.85,
      "y": 6.84,
      "w": 20,
      "h": 2.45,
      "label": "连接过渡暂未启用"
    }
  ],
  "tree-repair-join-after.webp": [
    {
      "x": 3.2,
      "y": 70.11,
      "w": 11.79,
      "h": 21.66,
      "label": "根部过渡后的交界"
    },
    {
      "x": 72.89,
      "y": 9.39,
      "w": 25.64,
      "h": 3.36,
      "label": "启用连接过渡"
    },
    {
      "x": 72.89,
      "y": 14.19,
      "w": 12.33,
      "h": 10.4,
      "label": "缩放过渡长度"
    },
    {
      "x": 86.2,
      "y": 14.19,
      "w": 12.33,
      "h": 10.4,
      "label": "调整根部外扩"
    },
    {
      "x": 72.89,
      "y": 36.78,
      "w": 25.64,
      "h": 3.36,
      "label": "匹配母枝粗度"
    }
  ],
  "tree-repair-selection-group.webp": [
    {
      "x": 4.97,
      "y": 40.52,
      "w": 13.48,
      "h": 39.29,
      "label": "准备保留的一束枝"
    },
    {
      "x": 57.73,
      "y": 23.37,
      "w": 12.5,
      "h": 12.95,
      "label": "整束，加入本枝下的子枝"
    },
    {
      "x": 57.73,
      "y": 38.99,
      "w": 38.74,
      "h": 12.95,
      "label": "隔离 / 显示全部"
    }
  ],
  "tree-repair-selection-isolated.webp": [
    {
      "x": 4.92,
      "y": 73.38,
      "w": 12.61,
      "h": 17.18,
      "label": "隔离后的枝束"
    },
    {
      "x": 45.9,
      "y": 10.77,
      "w": 8.51,
      "h": 5.38,
      "label": "隔离编辑状态"
    },
    {
      "x": 58.05,
      "y": 71.29,
      "w": 38.45,
      "h": 6,
      "label": "再次点击恢复全树"
    }
  ],
  "tree-repair-selection-save.webp": [
    {
      "x": 3.87,
      "y": 25.19,
      "w": 77.68,
      "h": 17.79,
      "label": "展开多选与选择集"
    },
    {
      "x": 4.46,
      "y": 62.13,
      "w": 72.62,
      "h": 16.27,
      "label": "输入选择集名称"
    },
    {
      "x": 78.87,
      "y": 62.13,
      "w": 10.42,
      "h": 16.27,
      "label": "保存选择集"
    }
  ],
  "tree-repair-selection-restore.webp": [
    {
      "x": 2.15,
      "y": 58.59,
      "w": 18.56,
      "h": 4.75,
      "label": "点击名字重新选中保存的枝束"
    },
    {
      "x": 1.29,
      "y": 32.83,
      "w": 24.51,
      "h": 5.76,
      "label": "复选 3 枝"
    },
    {
      "x": 40.89,
      "y": 17.78,
      "w": 5.85,
      "h": 23.05,
      "label": "其他枝条已恢复显示"
    },
    {
      "x": 89.42,
      "y": 55,
      "w": 7.48,
      "h": 29.49,
      "label": "重新高亮的承重枝束"
    }
  ]
};
