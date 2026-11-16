// Bounds are percentages of each current screenshot after cropping.
export const materialMarkers = {
  'sculpt-replace-entry.webp': [
    { x: 71.7, y: 26.7, w: 25.3, h: 66.7, label: '点击「预览应用到当前树」' },
  ],
  'staged-import.webp': [
    { x: 80.03, y: 20.62, w: 18.21, h: 41.49, label: '选择「高模分步处理」' },
    { x: 1.58, y: 70.02, w: 19.33, h: 6.31, label: '设置「目标三角面」' },
    { x: 79.17, y: 86.45, w: 17.22, h: 7.64, label: '点击「选择树干 GLB」' },
  ],
  'staged-start-topology.webp': [
    { x: 5.94, y: 68.39, w: 88.44, h: 21.92, label: '点击「开始拓扑减面」' },
  ],
  'staged-topology.webp': [
    { x: 0.85, y: 25.72, w: 9.39, h: 4.29, label: '设置「目标三角面」' },
    { x: 0.85, y: 41.71, w: 19.09, h: 4.98, label: '需要重新减面时，点击「拓扑减面当前模型」' },
    { x: 0.85, y: 92, w: 19.09, h: 4.4, label: '点击「导出拓扑 GLB」' },
  ],
  'staged-uv.webp': [
    { x: 0.85, y: 82.39, w: 19.09, h: 4.63, label: '点击「自动拆分并排布 UV」' },
    { x: 83.03, y: 36.27, w: 15.39, h: 31.52, label: '查看右侧「当前 UV」' },
    { x: 0.85, y: 87.49, w: 19.09, h: 4.63, label: '点击「导出 UV GLB」' },
  ],
  'staged-material.webp': [
    { x: 18.91, y: 10.31, w: 6.67, h: 4.06, label: '切到「基础材质」' },
    { x: 18.91, y: 39.51, w: 13.21, h: 9.85, label: '点击树皮卡片，例如「AI 斑驳树皮 01」' },
    { x: 78.85, y: 32.79, w: 20.24, h: 4.98, label: '调节「总凹凸强度」' },
    { x: 78.85, y: 58.98, w: 20.24, h: 4.87, label: '调节「粗糙度」' },
  ],
  'staged-overlay.webp': [
    { x: 25.7, y: 10.31, w: 6.67, h: 4.06, label: '切到「后期叠加」' },
    { x: 18.91, y: 41.95, w: 13.21, h: 9.85, label: '选择「平整年轮切口」等局部贴花' },
  ],
  'staged-check-save.webp': [
    { x: 58.91, y: 7.88, w: 8.85, h: 3.94, label: '选择输出「分辨率」' },
    { x: 82.36, y: 20.28, w: 17.09, h: 75.43, label: '检查 BaseColor、Normal 和 ORM 预览' },
    { x: 88, y: 6.6, w: 7.58, h: 4.87, label: '点击「生成最终 GLB」' },
  ],
  'sculpt-entry.webp': [
    { x: 18.97, y: 77.53, w: 8.57, h: 17.62, label: '点击「模型雕刻」' },
  ],
  'sculpt-brush.webp': [
    { x: 0.64, y: 42.69, w: 8.85, h: 4.38, label: '选择「鼓起 / 压入」' },
    { x: 16.28, y: 21.88, w: 7.95, h: 4.27, label: '调节笔刷「半径」' },
    { x: 28.59, y: 21.88, w: 8.27, h: 4.27, label: '调节笔刷「强度」' },
    { x: 40.45, y: 51.23, w: 11.67, h: 19.74, label: '将圆形笔刷移到树干表面，按左键拖动' },
  ],
  'sculpt-compare.webp': [
    { x: 12.12, y: 15.8, w: 5.9, h: 4.16, label: '点击「本次开始前」查看原轮廓' },
    { x: 18.01, y: 15.8, w: 5.19, h: 4.16, label: '点击「雕刻结果」对比' },
    { x: 90.38, y: 93.81, w: 8.33, h: 4.16, label: '点击「进入树干整理」' },
  ],
};
