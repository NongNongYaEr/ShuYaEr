// Annotations from the isolated native material workbench captures.
export const materialTroubleshootingFigures = {
  "optimize-entry": {"src":"troubleshoot-material-optimize-entry.webp","width":303,"height":229},
  "optimize-limited": {"src":"troubleshoot-material-optimize-limited.webp","width":286,"height":527},
  "optimize-review": {"src":"troubleshoot-material-optimize-review.webp","width":862,"height":569},
  "topology-only": {"src":"troubleshoot-material-topology-only.webp","width":305,"height":169},
  "flow-entry": {"src":"troubleshoot-material-flow-entry.webp","width":285,"height":414},
  "flow-candidate": {"src":"troubleshoot-material-flow-candidate.webp","width":870,"height":560},
  "flow-points": {"src":"troubleshoot-material-flow-points.webp","width":781,"height":560},
  "flow-reviewed": {"src":"troubleshoot-material-flow-reviewed.webp","width":870,"height":640},
  "uv-spacing-error": {"src":"troubleshoot-material-uv-spacing-error.webp","width":570,"height":140},
  "uv-repack": {"src":"troubleshoot-material-uv-repack.webp","width":286,"height":307},
  "uv-check": {"src":"troubleshoot-material-uv-check.webp","width":286,"height":823},
  "uv-export-settings": {"src":"troubleshoot-material-uv-export-settings.webp","width":593,"height":70},
  "uv-final-png": {"src":"troubleshoot-material-uv-final-png.webp","width":806,"height":624},
};

export const materialTroubleshootingMarkers = {
  "troubleshoot-material-optimize-entry.webp": [
    {"x":3.96,"y":20.52,"w":45.71,"h":13.54,"label":"打开减面精修"},
    {"x":10.89,"y":66.89,"w":77.56,"h":14.41,"label":"优化当前模型 / 原高模"},
  ],
  "troubleshoot-material-optimize-limited.webp": [
    {"x":8.74,"y":9.1,"w":37.06,"h":6.45,"label":"目标 100 三角面"},
    {"x":8.74,"y":22.96,"w":37.06,"h":6.45,"label":"误差预算 0.01 cm"},
    {"x":8.74,"y":31.31,"w":76.92,"h":7.41,"label":"保护开放边界"},
    {"x":8.74,"y":68.05,"w":76.92,"h":6.26,"label":"生成 / 更新候选"},
    {"x":8.74,"y":76.21,"w":76.92,"h":7.28,"label":"保护与误差约束下未达到目标"},
  ],
  "troubleshoot-material-optimize-review.webp": [
    {"x":69.72,"y":22.26,"w":25.52,"h":3.37,"label":"核对实际面数"},
    {"x":69.72,"y":42.07,"w":12.47,"h":5.27,"label":"减面前参考"},
    {"x":82.77,"y":42.07,"w":12.47,"h":5.27,"label":"减面后"},
    {"x":69.72,"y":48.75,"w":25.52,"h":6.86,"label":"叠加线框检查"},
    {"x":69.72,"y":67.79,"w":25.52,"h":5.8,"label":"采用候选并制作材质"},
    {"x":82.77,"y":74.99,"w":12.47,"h":5.27,"label":"取消并返回原工程"},
  ],
  "troubleshoot-material-topology-only.webp": [
    {"x":3.93,"y":26.04,"w":92.46,"h":20.71,"label":"导出拓扑 GLB"},
    {"x":3.93,"y":50.3,"w":92.46,"h":20.71,"label":"自动拆分并排布 UV"},
    {"x":3.93,"y":74.56,"w":92.46,"h":20.71,"label":"导出 UV GLB"},
  ],
  "troubleshoot-material-flow-entry.webp": [
    {"x":4.21,"y":80.33,"w":90.88,"h":7.97,"label":"检查 / 调整树皮走势"},
  ],
  "troubleshoot-material-flow-candidate.webp": [
    {"x":63.79,"y":11.76,"w":31.49,"h":6.07,"label":"走势检查 · 方向条纹"},
    {"x":82.87,"y":63.18,"w":12.41,"h":13.78,"label":"分析走势候选"},
    {"x":63.79,"y":87.18,"w":9.2,"h":9.14,"label":"采用候选"},
    {"x":74.14,"y":87.18,"w":9.2,"h":9.14,"label":"丢弃候选"},
  ],
  "troubleshoot-material-flow-points.webp": [
    {"x":24.82,"y":67.77,"w":2.05,"h":2.86,"label":"先在树皮点起点"},
    {"x":25.85,"y":64.2,"w":1.54,"h":2.14,"label":"沿希望方向点终点"},
    {"x":59.67,"y":40.35,"w":13.83,"h":6.61,"label":"两点方向校正"},
    {"x":59.67,"y":52.89,"w":35.08,"h":6.07,"label":"校正范围（米）"},
    {"x":59.67,"y":60.74,"w":35.08,"h":3.14,"label":"起点已选，接着点终点"},
  ],
  "troubleshoot-material-flow-reviewed.webp": [
    {"x":63.79,"y":2.01,"w":31.49,"h":5.31,"label":"切回材质效果"},
    {"x":63.79,"y":57.56,"w":31.49,"h":5.5,"label":"核对校正已生效"},
    {"x":77.36,"y":93.28,"w":9.2,"h":5.78,"label":"清空校正"},
  ],
  "troubleshoot-material-uv-spacing-error.webp": [
    {"x":26.38,"y":5.71,"w":13.68,"h":38.21,"label":"每侧扩色 12px"},
    {"x":2.77,"y":62.01,"w":94.45,"h":32.28,"label":"查看间距不足提示"},
  ],
  "troubleshoot-material-uv-repack.webp": [
    {"x":8.74,"y":12.11,"w":76.92,"h":24.45,"label":"常规 · 岛距≥13px / 每侧扩色6px"},
    {"x":8.74,"y":78.85,"w":17.92,"h":19.22,"label":"仅重排 · 保留UV岛"},
  ],
  "troubleshoot-material-uv-check.webp": [
    {"x":8.74,"y":3.19,"w":76.92,"h":26.73,"label":"候选 UV"},
    {"x":8.74,"y":30.78,"w":76.92,"h":30.62,"label":"核对候选岛距与重叠"},
    {"x":8.74,"y":68.93,"w":76.92,"h":4.74,"label":"标记间距、边界与岛内重叠"},
    {"x":8.74,"y":95.9,"w":37.59,"h":3.52,"label":"采用候选"},
    {"x":48.08,"y":95.9,"w":37.59,"h":3.52,"label":"丢弃"},
    {"x":8.74,"y":76.84,"w":37.59,"h":3.52,"label":"重新测量间距"},
  ],
  "troubleshoot-material-uv-export-settings.webp": [
    {"x":1.92,"y":11.43,"w":22.93,"h":76.43,"label":"核对导出分辨率"},
    {"x":25.86,"y":11.43,"w":13.15,"h":76.43,"label":"采用后同步每侧扩色"},
    {"x":78.48,"y":31.07,"w":19.39,"h":51.43,"label":"生成最终 GLB"},
  ],
  "troubleshoot-material-uv-final-png.webp": [
    {"x":10.3,"y":95.67,"w":16.98,"h":2.24,"label":"确认当前是烘焙贴图"},
    {"x":34.62,"y":94.23,"w":10.42,"h":5.13,"label":"检查导出PNG"},
    {"x":76.55,"y":15.3,"w":17.61,"h":4.01,"label":"切到最终 PNG"},
    {"x":70.35,"y":22.84,"w":28.66,"h":26.79,"label":"放大 BaseColor"},
    {"x":70.35,"y":55.71,"w":28.66,"h":26.79,"label":"放大 Normal"},
  ],
};
