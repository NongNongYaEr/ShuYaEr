import { sculptedTreeCasePhotos } from './help-wiki-case-sculpted-tree-markers.js';
import { directBoundTreeCasePhotoSizes } from './help-wiki-case-direct-bound-tree-markers.js';

function photo(key, alt, caption) {
  return { ...sculptedTreeCasePhotos[key], alt, caption };
}

function sharedPhoto(name, alt, caption) {
  const src = `case-direct-${name}.webp`;
  const [width, height] = directBoundTreeCasePhotoSizes[src];
  return { src, width, height, alt, caption };
}

const sourceTree = photo('high-source-detail', '同一棵直立雕刻树干未制作树皮时的原始网格', '练习副本保留原网格和 UV，已移除原树皮材质。');
const finishedTree = sharedPhoto('after', '这棵直立雕刻树干完成材质和枝叶装配后的整树', '用本案例烘焙的同一份树干装配香樟枝叶。');

export const sculptedTreeCase = {
  id: 'case-sculpted-trunk-tree',
  title: '用雕刻树干做材质，再做成整树',
  summary: '导入雕刻树干 GLB，准备网格和 UV，做树皮、绑定骨架，再装配枝叶和导出整树。',
  keywords: '整树实战 雕刻高模 雕刻树干 无贴图 一键准备 高模完整处理 树皮 UV 自动骨架 装配枝叶 骨骼 GLB',
  comparison: { before: sourceTree, after: finishedTree },
  sections: [
    {
      title: '选处理方式并校准雕刻树干',
      steps: [
        {
          title: '从资源中心选择高模完整处理',
          actions: [
            '打开「资源中心 → 树干整理」，准备一份静态雕刻树干 GLB。示例从一份约 1.59 万面的直立树干练习副本开始，原网格与 UV 已保留，原树皮材质已移除。',
            '选「高模完整处理」来减面并重新拆 UV。示例设「目标三角面」1.5 万、「贴图规格」1K，再点「选择树干 GLB」。',
            '如果源模型面数和 UV 已满足交付需求，可以选「保留模型，只制作材质」。',
          ],
          figure: photo('high-import', '高模完整处理卡片、目标三角面、贴图规格和导入按钮', '选处理方式后再选 GLB。目标面数和贴图规格可以按资产需要调整。'),
          related: ['trunk-import-routes'],
          check: '模型准备页显示导入的树干，右侧「当前处理方式」为「高模完整处理」。',
        },
        {
          title: '定好底点、朝向与真实长度',
          actions: [
            '确认根部朝下。需要重新设定时，点「重定底点」后在主干落地处点一下，再点「重定朝向」并点主干上方。',
            '用实测值填写「底点到朝向点的真实长度（m）」。练习树设为 5 m。转动视角确认底点、竖直方向和树干比例。',
            '点「一键准备并制作材质」。等待减面、树结构 UV 和树皮走势分析完成。',
          ],
          figure: photo('high-calibrate', '雕刻树干模型准备页的底点、朝向、真实长度和一键准备按钮', '先校准树干，再进入材质工坊。'),
          check: '材质工作台打开后，顶部显示工作模型面数和 UV 就绪状态。本例的工作副本为 1.5 万面。',
        },
      ],
    },
    {
      title: '制作树皮并把成品交给骨架工作台',
      steps: [
        {
          title: '在表面材质页调整树皮',
          actions: [
            '打开「02 表面材质」的「基础材质」。从左侧材质库选树皮，再在右侧「基础材质 · 树皮基底」检查参数。',
            '拉近看树皮的比例与走势，重点检查分叉和根部。图中把「树皮单次宽度」设为 0.45 m。需要减弱反光时提高「粗糙度」。',
            '看满意后点顶部「03 检查与保存」，或用下方的「下一步：检查与保存」。',
          ],
          figure: photo('high-bark', '材质工坊的树皮素材、树皮单次宽度和粗糙度', '同页的左侧材质库与右侧参数区。'),
          check: '树皮的比例与明暗随参数更新，材质页显示模型和 UV 已就绪。',
        },
        {
          title: '确认 UV 和 PBR 贴图',
          actions: [
            '在「03 检查与保存」核对「UV」「材质」状态。查看右侧的 BaseColor、Normal 与 ORM 三张图。',
            '检查近景是否有明显拉伸或错色。发现 UV 问题时，回「模型准备」修好后再继续。',
            '需要把完成材质的树干单独交给别人时，可点右上「生成最终 GLB」，保存带贴图的树干。',
          ],
          figure: photo('high-check', '检查与保存页的 UV 状态、最终 GLB 按钮和三张 PBR 贴图', '同页的导出状态与贴图区。'),
          related: ['manual-uv-review'],
          check: '右侧三张贴图可查看，UV 状态允许继续导出。',
        },
        {
          title: '保存材质并进入自动骨架',
          actions: [
            '点树干整理底部「保存并进入自动骨架」。这个入口会烘焙带贴图的 GLB 并把它传回树干整理。',
            '等转接完成。继续操作同一棵树干，保留已校准尺寸。',
          ],
          figure: photo('high-return', '树干整理检查与保存阶段底部的保存并进入自动骨架按钮', '用底部按钮把带材质的树干交给骨架工作台。'),
          check: '顶部切到「04 自动骨架与绑定」，视口出现有树皮材质的树干和候选控制枝。',
        },
      ],
    },
    {
      title: '试弯并开始制作整树',
      steps: [
        {
          title: '检查候选控制枝和试弯结果',
          actions: [
            '转动视角，让根部、主干和分叉都能看见。检查青色控制枝是否落在对应的木干内。',
            '点「试弯曲」，拖角度滑条观察主要分叉。检查通过后点「结束试弯曲」，再点「确认绑定」。',
          ],
          figure: photo('high-rig', '带树皮材质的雕刻树干与试弯曲控件', '试弯时同时观察分叉内侧与外侧。'),
          related: ['trunk-control-skeleton', 'trunk-skin-weights'],
          check: '拖角度时木干随对应控制枝变形，确认后出现「下一步：弯曲与绑定检查」。',
        },
        {
          title: '用这个树干创建整树',
          actions: [
            '点「下一步：弯曲与绑定检查」。在「弯曲检查与素材保存」右侧向下滚动，拖「整树试弯」再看一次，随后把角度恢复为 0°。',
            '如果某根枝条带动了旁边的木干，可在「单骨旋转检查」选对应控制枝与骨架段定位。',
            '点底部「以此树干开始创作」。有需要保留的当前工程时，按提示先保存。',
          ],
          figure: photo('high-start-tree', '确认绑定后的单骨旋转检查和以此树干开始创作入口', '检查分叉变形后，用当前已绑定的树干新建整树。'),
          check: '返回「整树造型」，视口中央显示刚才处理过的树干，树皮、尺寸和承重枝随工程载入。',
        },
      ],
    },
    {
      title: '装配树冠、保存重开并导出',
      steps: [
        {
          title: '从素材库加入三类香樟单元枝',
          actions: [
            '从右侧「当前植物装配」点「素材库 · 添加装配」，再点左侧「＋ 添加单元枝」。',
            '搜「香樟」，选深绿紧凑侧枝、混合短弯细梢和嫩绿短弯细梢。每选一种，点「加入当前工程」，三种都加入后关闭素材库。',
          ],
          figure: sharedPhoto('library', '香樟单元枝素材库的搜索框、深绿紧凑侧枝卡片与加入当前工程按钮', '这棵树使用三种带枝叶的香樟单元。'),
          check: '左侧「当前工程 · 单元枝素材」列出三个样本。',
        },
        {
          title: '按内部、中间和末端装配',
          actions: [
            '把深绿紧凑侧枝拖到右侧「内部」，把混合短弯细梢拖到「中间」，把嫩绿短弯细梢拖到「末端」。右侧可向下滚动。',
            '也可以先点左侧样本，再点右侧分区底部「拖入或点击添加样本」。',
          ],
          figure: sharedPhoto('attach', '左侧深绿样本与右侧内部装配分区', '先接近主干的深绿枝，最后放嫩绿末梢。'),
          related: ['manual-branch-installation'],
          check: '三个分区显示各自的样本，树上出现装配的枝叶。',
        },
        {
          title: '调整数量并检查枝根',
          actions: [
            '在右侧「冠层填充 · 三类单元枝」填写「目标单元枝数量」。练习例填 54，核对本树上限后点「应用数量」。',
            '转到侧面，查看粗枝和新枝的连接。树冠挡住主要雕刻细节时，可以降低对应分区倍率。',
          ],
          figure: sharedPhoto('density', '冠层填充的目标单元枝数量、应用数量及本树上限', '先设数量，再从不同角度看树冠。'),
          related: ['assembly-fill-count', 'manual-branch-installation'],
          check: '右侧装配统计更新。示例有 3 类、54 支单元枝。',
        },
        {
          title: '保存可编辑的工程',
          actions: [
            '点顶部「保存工程」，选「工程文件」，填写名称并点「选择位置并保存」，生成 .branch.json。',
          ],
          figure: sharedPhoto('save', '雕刻整树案例的工程文件保存窗口', '先存可继续编辑的工程，再导出交付模型。'),
          check: '软件提示「已保存工程」，所选目录出现 .branch.json。',
        },
        {
          title: '重开工程核对树皮和冠层',
          actions: [
            '点顶部「打开」并选刚存的 .branch.json。从同一视角检查树皮、树干和枝叶装配。',
          ],
          figure: sharedPhoto('reopened', '重新打开的整树工程、打开入口和右侧装配数量', '打开后核对整树外观与装配统计。'),
          check: '重新打开后，树皮仍可见，树冠数量和位置与保存前一致。',
        },
        {
          title: '导出带蒙皮的整树 GLB',
          actions: [
            '点顶栏「导出模型」，选「骨骼 GLB · 含蒙皮绑定」。要改保存位置时，打开左侧「输出」，点「输出位置」右侧的文件夹按钮。',
            '确认保存位置后，回到「导出模型」，点「导出骨骼 GLB」。',
            '等出现导出完成提示，核对生成的 .glb 和刚才的 .branch.json。',
          ],
          figure: sharedPhoto('export', '雕刻整树案例在导出窗口中选择骨骼 GLB', '需要保留骨架与蒙皮时选择骨骼 GLB。'),
          related: ['model-export'],
          check: '输出目录里有可继续编辑的工程和带骨架、蒙皮、树皮贴图及枝叶的 GLB。',
        },
      ],
    },
  ],
};
