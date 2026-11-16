export const workflowMarkers = {
  'resource-center.webp': [
    { x: 1, y: 62.2, w: 12.5, h: 7, label: '树干整理' },
    { x: 1, y: 69.4, w: 12.5, h: 7, label: '模型雕刻' },
    { x: 1, y: 76.7, w: 12.5, h: 6.8, label: '叶花果整理' },
  ],
  'trunk-preparation.webp': [
    { x: 79.2, y: 59.3, w: 9.7, h: 4.2, label: '重定底点' },
    { x: 89, y: 59.3, w: 9.7, h: 4.2, label: '重定朝向' },
    { x: 79.2, y: 65.2, w: 19.5, h: 6.7, label: '底点到朝向点的真实长度（m）' },
  ],
  'trunk-route.webp': [
    { x: 12.3, y: 34.8, w: 14.2, h: 26.6, label: '直接绑定骨骼' },
    { x: 72.8, y: 66.8, w: 13.4, h: 4.9, label: '选择树干 GLB' },
  ],
  'trunk-rig-start.webp': [
    { x: 79.3, y: 50.6, w: 9.4, h: 3.9, label: '重定底点' },
    { x: 89.3, y: 50.6, w: 9.4, h: 3.9, label: '重定朝向' },
    { x: 79.3, y: 55.9, w: 19.4, h: 7, label: '底点到朝向点的真实长度（m）' },
    { x: 79.3, y: 88.9, w: 19.4, h: 4.1, label: '开始自动骨架与绑定' },
  ],
  'trunk-rig-candidate.webp': [
    { x: 81.6, y: 94.5, w: 4.8, h: 4.3, label: '试弯曲' },
    { x: 92.3, y: 94.6, w: 6.4, h: 4.1, label: '确认绑定' },
  ],
  'trunk-rig-review.webp': [
    { x: 79.3, y: 34.9, w: 19.4, h: 3.8, label: '整树试弯' },
    { x: 77.5, y: 94.1, w: 9.8, h: 4.1, label: '保存到当前项目' },
    { x: 88, y: 94.1, w: 10.7, h: 4.1, label: '以此树干开始创作' },
  ],
  'unit-preparation.webp': [
    { x: 79.5, y: 4, w: 8.9, h: 4.6, label: '导入整包 GLB' },
    { x: 20.3, y: 28.3, w: 4.8, h: 4.3, label: '框选' },
    { x: 78.4, y: 39.6, w: 19.1, h: 4.7, label: '提取为单元' },
  ],
  'unit-calibration.webp': [
    { x: 79.3, y: 54.9, w: 14.7, h: 4.3, label: '点底点' },
    { x: 79.3, y: 59.8, w: 14.7, h: 4.4, label: '点朝向点' },
    { x: 78.3, y: 82.8, w: 20.2, h: 4.9, label: '确认当前修改并继续' },
  ],
  'unit-size.webp': [
    { x: 79.7, y: 77.1, w: 8, h: 4, label: '长度 Y（cm）' },
    { x: 78.6, y: 82.9, w: 19.9, h: 4.5, label: '确认当前修改并继续' },
  ],
  'unit-save.webp': [
    { x: 86.1, y: 93.6, w: 12, h: 4.5, label: '保存套装并打开' },
  ],
  'vines-surface-import.webp': [
    { x: 15.1, y: 6.6, w: 5.6, h: 4.6, label: '藤蔓植物' },
    { x: 0.8, y: 37.8, w: 18.7, h: 4.8, label: '沿模型表面生长' },
    { x: 6.3, y: 54.9, w: 9.1, h: 3.7, label: '导入承载模型 GLB / OBJ' },
  ],
  'vines-surface-route.webp': [
    { x: 0.8, y: 66.9, w: 9.4, h: 3.7, label: '点起点 · 向上长' },
    { x: 48.8, y: 44.1, w: 3.1, h: 10, label: '承载面上的藤蔓路线' },
    { x: 83.4, y: 45.6, w: 15.2, h: 5.5, label: '主选 · 攀爬藤群 1' },
    { x: 0.9, y: 78.3, w: 9.2, h: 3.4, label: '刷禁生区' },
    { x: 10.4, y: 78.3, w: 9.2, h: 3.4, label: '结束操作 / 旋转观察' },
  ],
  'lights.webp': [
    { x: 93.6, y: 1.7, w: 4.7, h: 4, label: '灯带' },
    { x: 94.9, y: 12, w: 2.5, h: 2.7, label: '启用灯带' },
    { x: 65.2, y: 24.1, w: 32.1, h: 21.8, label: '离地起点、离地终点和沿枝干每圈' },
  ],
  'light-flow.webp': [
    { x: 65.4, y: 75.5, w: 31.8, h: 3.8, label: '停止流水灯' },
    { x: 83.8, y: 79.6, w: 13.4, h: 4.8, label: '流水速度' },
    { x: 83.8, y: 84.6, w: 13.4, h: 4.8, label: '流水方向' },
  ],
  'wind-preview.webp': [
    { x: 61.1, y: 13, w: 7.9, h: 4.5, label: '风动预览' },
    { x: 81, y: 23.1, w: 17.4, h: 27.5, label: '风力、阵风变化和随机变化' },
    { x: 32.5, y: 87.7, w: 37.6, h: 6.4, label: '播放控制' },
  ],
  'export.webp': [
    { x: 3.9, y: 67.5, w: 27.5, h: 6.1, label: '格式下拉框' },
    { x: 3.9, y: 74.4, w: 27.6, h: 6.4, label: '导出 UE FBX' },
    { x: 36.1, y: 74.5, w: 27.7, h: 6.2, label: 'UE/PVE 完整单元枝包' },
  ],
  'export-output-tab.webp': [
    { x: 81.6, y: 8.9, w: 14.5, h: 56.8, label: '点左侧「输出」' },
  ],
  'export-location.webp': [
    { x: 4, y: 10, w: 26, h: 18, label: '展开「输出位置」' },
    { x: 80.8, y: 76.2, w: 10.7, h: 21.3, label: '点文件夹图标选择路径' },
  ],
  'export-glb.webp': [
    { x: 4.1, y: 73, w: 27.3, h: 6, label: '静态 GLB · 完整模型' },
    { x: 4.1, y: 80.5, w: 27.3, h: 6, label: '导出静态 GLB' },
  ],
};
