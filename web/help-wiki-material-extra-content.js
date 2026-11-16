export const materialExtraArticles = [
  {
    id: 'retain-source-material',
    title: '在原材质上加积雪、苔藓和贴花',
    summary: '把已有树皮作为底层，给指定材质槽加效果，并导出新的 GLB。',
    keywords: '保留原材质 原始贴图 叠加效果 后期叠加 局部贴花 材质槽 雪 苔藓 DX12 生成最终 GLB',
    callout: '此流程需要 DX12 材质视口。准备阶段会为效果生成工作 UV，原 GLB 和原材质仍可保留。',
    sections: [
      {
        title: '导入已有材质的树干',
        steps: [
          {
            title: '选择保留原材质的导入方式',
            actions: [
              '从「资源中心」打开「树干整理」。点第二张卡片「保留原材质 · 叠加效果」。',
              '按需要设置下方「贴图规格」，再点右下的「选择树干 GLB」，选中已有树皮材质的模型。',
            ],
            figure: {
              src: 'source-overlay-route.webp', width: 1138, height: 602,
              alt: '树干整理中选中保留原材质叠加效果，右下为选择树干 GLB',
              caption: '选择第二张卡片，再导入树干。',
            },
          },
          {
            title: '从模型准备打开原材质效果',
            text: '在「01 模型准备」右侧确认方向和实际尺寸，再点底部「打开原材质效果」。',
            figure: {
              src: 'source-overlay-start.webp', width: 320, height: 174,
              alt: '树干整理右侧尺寸读数和打开原材质效果按钮',
              caption: '进入工作台后等原材质与烘焙 UV 准备完成。',
            },
            check: '「02 表面材质」显示「原始材质 · 已锁定」。',
          },
        ],
      },
      {
        title: '选择材质槽并放置贴花',
        steps: [
          {
            title: '指定哪些原材质槽要叠加',
            actions: [
              '选中左侧图层栈的「原始材质 · 已锁定」，在右侧勾选需要受影响的材质槽。',
              '如果只想加雪或苔藓，可以在该面板直接点「上向薄雪」或「薄散苔藓」。',
            ],
            figure: {
              src: 'source-overlay-slots.webp', width: 338, height: 218,
              alt: '原始材质已锁定面板的勾选项与薄雪、苔藓按钮',
              caption: '先核对勾选的材质槽，再添加所需效果。',
            },
          },
          {
            title: '从后期叠加库选一张局部贴花',
            actions: [
              '在中间的「材质库」切到「后期叠加」，点一张带「局部贴花」标签的卡片，例如「平整年轮切口」。',
              '点击材质库底部的「在模型上放置」。视口出现放置提示后，在要贴的树干表面点一下。',
            ],
            figure: {
              src: 'source-overlay-library.webp', width: 225, height: 786,
              alt: '后期叠加材质库选择平整年轮切口，底部为在模型上放置',
              caption: '选中卡片后，在材质库最下方启动定位。',
            },
            check: '出现「贴花已定位」提示，右侧出现「局部定位与投影」。',
          },
          {
            title: '调整投影位置和尺寸',
            text: '选中左侧新建的贴花层。在右侧展开「局部定位与投影」，修改宽度和高度，向下可调旋转、边缘柔化和投射深度。需要挪动时点「重新定位 · 点击模型」，再点新的表面位置。',
            figure: {
              src: 'source-overlay-applied.webp', width: 337, height: 241,
              alt: '放置后的局部定位与投影参数和重新定位按钮',
              caption: '贴花已经定位时，右侧会显示可调的尺寸参数。',
            },
          },
        ],
      },
      {
        title: '对比并导出',
        steps: [
          {
            title: '对照原材质',
            text: '点视口右上「对比原材质」看原贴图，再点同一按钮切回叠加。旋转查看贴花是否贴在指定位置，也检查其他材质槽。',
            figure: {
              src: 'source-overlay-compare.webp', width: 178, height: 50,
              alt: '视口工具条的对比原材质按钮',
              caption: '用同一个按钮往返查看原贴图与叠加效果。',
            },
          },
          {
            title: '生成带效果的最终 GLB',
            text: '切到顶部「03 检查与保存」，检查 UV 和材质状态，点右上黄色「生成最终 GLB」。未参与叠加的材质槽沿用原材质。',
            figure: {
              src: 'source-overlay-export.webp', width: 654, height: 77,
              alt: '检查与保存上方的材质状态与生成最终 GLB 按钮',
              caption: 'UV 可用、材质就绪后，可生成最终 GLB。',
            },
            check: '生成完成后点「下载最终 GLB」，即可取用带叠加效果的模型。',
          },
        ],
      },
    ],
  },
  {
    id: 'manual-uv-review',
    title: '用 UV 精修比较候选并采用',
    summary: '在保留现有 UV 岛的前提下重排，先检查质量和间距，再决定是否采用。',
    keywords: 'UV 精修 仅重排 保留 UV 岛 候选 比较 采用 丢弃 间距 扩色 UV GLB',
    sections: [
      {
        title: '保留 UV 岛并生成重排候选',
        steps: [
          {
            title: '进入 UV 精修',
            text: '模型有一套可用 UV 时，回到材质工坊的「01 模型准备」。向下滚动左侧面板，在「分步操作与导出」上方点「UV 精修」。',
            figure: {
              src: 'manual-uv-open.webp', width: 420, height: 344,
              alt: '模型准备左侧的 UV 精修按钮和分步操作与导出',
              caption: '按钮在「减面精修」右侧。',
            },
            check: '右侧打开「UV 整理与比较」。',
          },
          {
            title: '设定间距并运行仅重排',
            actions: [
              '在右侧「重排间距」选需要的扩色规格，例如「紧凑 · 岛距≥7px / 每侧扩色3px」。',
              '点「仅重排 · 保留UV岛」。它保持现有 UV 岛的分组与形状，重新安排位置和朝向。',
            ],
            figure: {
              src: 'manual-uv-generate.webp', width: 336, height: 377,
              alt: 'UV 整理与比较顶部的重排间距和仅重排保留 UV 岛按钮',
              caption: '设置间距后，点击左侧「仅重排 · 保留UV岛」。',
            },
            check: '状态提示「UV 候选已生成 · 比较后采用」，此时当前 UV 保持原样。',
          },
        ],
      },
      {
        title: '检查候选并决定是否采用',
        steps: [
          {
            title: '比较当前 UV 和候选 UV',
            text: '在右侧往下滚动，分别查看「当前 UV」与「候选 UV」。对照两张排布图和下方读数。先检查有没有重叠、越界或零面积，再核对实测间距能否满足所选扩色，最后比较覆盖率与拉伸。',
            figure: {
              src: 'manual-uv-candidate.webp', width: 336, height: 691,
              alt: '重排后的候选 UV 图和覆盖率、重叠、拉伸与实测间距读数',
              caption: '示例保留了原有 UV 岛，候选没有重叠，实测间距满足每侧扩色 3 px。',
            },
          },
          {
            title: '采用候选或丢弃重做',
            actions: [
              '确认候选合适后，继续下滚，点底部「采用候选」。',
              '如果间距或排布不合适，点「丢弃」，改参数后再生成。',
              '需要交付网格时，回到左侧「分步操作与导出」，点「导出 UV GLB」。',
            ],
            figure: {
              src: 'manual-uv-adopt.webp', width: 336, height: 59,
              alt: 'UV 整理与比较底部的采用候选和丢弃按钮',
              caption: '采用后才会用候选替换当前 UV。',
            },
            check: '采用成功后出现「新 UV 已采用」，右侧「当前 UV」更新。',
          },
        ],
      },
    ],
  },
];
