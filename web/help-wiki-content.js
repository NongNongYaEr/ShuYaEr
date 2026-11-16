import { assemblyArticles } from './help-wiki-assembly-content.js';
import { barkArticle } from './help-wiki-bark-content.js';
import { bonsaiArticle } from './help-wiki-bonsai-content.js';
import { branchVariantsArticle } from './help-wiki-branch-variants-content.js';
import { directBoundTreeCase } from './help-wiki-case-direct-bound-tree.js';
import { facadeVineCase } from './help-wiki-case-facade.js';
import { fastTreeCase } from './help-wiki-case-fast-tree.js';
import { sculptedTreeCase } from './help-wiki-case-sculpted-tree.js';
import { branchTransferArticle, deliveryTroubleshootingSections } from './help-wiki-delivery-extra.js';
import { libraryArticles } from './help-wiki-library-content.js';
import { materialExpandedArticles, materialExpandedSections } from './help-wiki-material-expanded.js';
import { materialExtraArticles } from './help-wiki-material-extra-content.js';
import { projectExpandedArticles, projectExpandedSections } from './help-wiki-project-expanded.js';
import { regionPaintArticle } from './help-wiki-region-paint-content.js';
import { selectionExtraSections, treeRepairArticles } from './help-wiki-tree-repair-content.js';
import { treeWorkbenchArticles, treeWorkbenchSections } from './help-wiki-tree-workbench-expanded.js';
import { materialTroubleshootingSections } from './help-wiki-troubleshoot-material.js';
import { vineExpandedArticles, vineExpandedSections } from './help-wiki-vines-expanded.js';
import { sizeReferenceArticle, studioArticle, treeVariantsArticle } from './help-wiki-viewport-extra-content.js';

const navigation = {
  id: 'viewport-navigation',
  title: '旋转、平移与缩放视口',
  summary: '选择熟悉的鼠标操作方式，在整树、树干整理和材质工坊查看模型。',
  keywords: '鼠标 相机 摄像机 旋转 平移 缩放 Blender 3ds Max 3DMAX 3D Max Maya 滚轮 中键 设置 导航',
  navigation: true,
  sections: [
    {
      title: '切换操作方式',
      steps: [
        {
          title: '点击顶栏的设置齿轮',
          text: '在软件右上方找到「生成」和「导出模型」。点击夹在两者之间的齿轮。',
          figure: {
            src: 'settings-toolbar.webp', width: 318, height: 63,
            alt: '生成与导出模型之间的设置齿轮',
            caption: '点红圈里的齿轮，打开「设置」。',
          },
        },
        {
          title: '在设置里选择 Blender、3ds Max 或 Maya',
          actions: [
            '在「视口导航」右侧点「操作方式」下拉菜单，选你熟悉的一套。',
            '看下方三格，确认旋转、平移和缩放的鼠标按键。',
          ],
          figure: {
            src: 'navigation.webp',
            width: 1013,
            height: 245,
            alt: '视口导航设置中的操作方式和鼠标手势',
            caption: '图中以 Maya 为例。',
          },
          check: '左下显示「导航设置已保存」。现在可以关闭设置，回到视口试用。重启后会继续使用这套手势。',
        },
      ],
    },
    {
      title: '重新取景',
      steps: [{
        title: '点击网格按钮右侧的适应视图图标',
        text: '在整树视口右上方，找到「尺寸参照」和网格按钮。点网格右侧的四角图标。树干整理中点文字按钮「适应模型」。',
        figure: {
          src: 'fit-toolbar.webp', width: 390, height: 52,
          alt: '视口右上网格旁边的适应视图按钮',
          caption: '将鼠标停在圈内图标上，可以看到「适应视图并保留观察方向」。',
        },
        check: '模型重新进入画面，当前观察方向保持。',
      }],
    },
  ],
  callout: '切换视口操作后，编辑模型仍用 G 移动、R 旋转、S 缩放。Maya 的 Alt＋左键用于旋转视口，在雕刻、单元枝笔刷和叶花果框选里用 Ctrl＋Alt＋左键执行原有的反向或减选操作。',
};

const selection = {
  id: 'selection',
  title: '点选、框选和作用范围',
  summary: '先确定要编辑承重结构还是整支单元枝，再选范围。',
  keywords: '选择 V 点选 框选 套索 Shift Ctrl 补选 减选 主枝干 单元枝',
  sections: [
    {
      title: '选中需要编辑的对象',
      steps: [
        {
          title: '点选承重枝或单元枝',
          actions: [
            '在整树视口顶部点「主枝干」。要选完整的带叶单元枝时，改点旁边的「单元枝」。',
            '点击视口左侧「点选 V」，也可以直接按 V。',
            '左键点枝条。要编辑该枝的形状，再点枝上的控制点。',
          ],
          figure: {
            src: 'select-tools.webp',
            width: 1055,
            height: 999,
            alt: '主枝干点选模式下显示青色控制点，顶部显示当前编辑范围',
            caption: '图中演示点选承重枝上的控制点。',
            markers: [1, 2, 3],
          },
          check: '选中的承重枝显示青色曲线和控制点。在「单元枝」模式下，点中叶片也会选中它所属的整支单元枝。',
        },
        {
          title: '框选多个对象',
          actions: [
            '点视口左侧「框选」，把鼠标移到枝条旁的空白处。',
            '按住左键拖出矩形，包住要选的枝条或控制点，再松开。需要沿不规则边缘圈选时，用下面的「套索」。',
            '补选时按住 Shift 再拖框，减选时按住 Ctrl 再拖框。',
          ],
          figure: {
            src: 'select-box.webp',
            width: 1055,
            height: 999,
            alt: '框选工具拖动时的青色虚线矩形',
            caption: '左侧点「框选」，在视口拖出选区，松开鼠标完成选择。',
          },
          check: '拖动时出现青色虚线框，松开后框内目标成为当前选区。',
        },
      ],
    },
    {
      title: '限定工具作用范围',
      steps: [{
        title: '从顶部下拉菜单限定作用范围',
        text: '在「主枝干」模式下，打开「裁切 / 雕刻范围」右侧的下拉菜单。只改这一根时选「仅选中枝条」，需要带动下级时选「选中枝条及子枝」。',
        figure: {
          src: 'select-tools.webp', width: 1055, height: 999,
          alt: '顶部裁切和雕刻范围下拉菜单',
          caption: '用红圈里的菜单切换范围，再开始裁切或用笔刷。',
          markers: [4],
        },
        check: '下拉菜单显示刚选的范围，下面的提示会更新可编辑枝条数。',
      }],
    },
  ],
};

const transform = {
  id: 'transform',
  title: '移动、旋转和缩放模型',
  summary: 'G 移动，R 旋转，S 缩放。实际调整的范围取决于当前选中的对象。',
  keywords: 'GRS G R S Enter Esc 取消 确认 变换 尺寸 粗细 Alt+S',
  sections: [
    {
      title: '调整整支单元枝',
      steps: [{
        title: '切到单元枝，再选中整支',
        actions: [
          '在整树视口顶部点「单元枝」，在树上左键点一支枝的木枝或叶片。',
          '按 G 更换挂接位置，按 R 绕枝根旋转，按 S 调整整支大小。每次执行其中一种。',
          '移动鼠标预览或输入数值。满意后按 Enter 或点击左键，按 Esc 可取消本次调整。',
        ],
        figure: {
          src: 'unit-assembly.webp',
          width: 1600,
          height: 1030,
          alt: '整树视口顶部的单元枝模式与 G R S 微调提示',
          caption: '先点「单元枝」。右侧「点选 · 微调单元枝」也是进入点选的入口。',
          markers: [1, 3],
        },
        check: '整支的摆放发生变化，内部木枝、叶片和花果随整支一起移动。',
      }],
    },
    {
      title: '调整承重枝',
      steps: [{
        title: '将选中的承重枝绕 Y 轴转 15°',
        actions: [
          '顶部点「主枝干」，再点树上的承重枝。要绕枝根转，选整支枝。',
          '点击左侧「旋转 R」或按 R，接着按 Y，输入 15。',
          '确认左下角显示 Y · 15°，按 Enter 应用。按 Esc 可取消。',
        ],
        figure: {
          src: 'transform-tools.webp',
          width: 1055,
          height: 999,
          alt: '整根承重枝绕枝根旋转时，视口读数显示 Y 轴 15 度',
          caption: '圈 1 是旋转入口，圈 2 是旋转轴、角度和确认提示。',
        },
        check: '整支承重枝绕枝根转动。要只改枝条后半段，可先点中间控制点，再用 R 或 S。',
      }],
    },
  ],
};

const brushes = {
  id: 'brush-shortcuts',
  title: '笔刷、撤销和保存',
  summary: '查阅整树常用笔刷快捷键，以及撤销、重做和保存。',
  keywords: 'Ctrl+Z Ctrl+Y Ctrl+S Ctrl+Alt B C F Shift+F 撤回 快捷键 快捷操作 笔刷反向',
  sections: [
    {
      title: '使用笔刷',
      steps: [
        {
          title: '选择梳理，再检查这一笔会影响哪几支',
          actions: [
            '顶部切到「单元枝」，点视口左侧「梳理 C」。编辑主枝形状时可以切回「主枝干」，用「拉动 B」或「梳理 C」。',
            '顶部设好「作用范围」。把鼠标移到枝叶上，看提示里的命中数。',
            '命中范围正确后，按住左键沿目标方向拖动，再松开。',
          ],
          figure: {
            src: 'brush-tools.webp',
            width: 1055,
            height: 999,
            alt: '单元枝梳理笔刷的圆形范围及命中 9 支的提示',
            caption: '黄色轮廓标出本笔会影响的单元枝，旁边的提示显示命中数量。',
          },
          check: '命中的完整单元枝随拖动方向调整朝向。误刷时按 Ctrl＋Z 撤销。',
        },
        {
          title: '调节半径和强度',
          text: '梳理工具开启时，把鼠标移回视口。按 F 调半径，或按 Shift＋F 调强度。移动鼠标调整数值，再按 Enter 确认。',
          figure: {
            src: 'brush-radius.webp',
            width: 1055,
            height: 999,
            alt: '按 F 调整梳理笔刷半径时的圆圈与数值',
            caption: '按 F 后，圆圈随鼠标变化。确认合适的覆盖范围后再开始拖动。',
          },
          check: '调整提示收起。把鼠标移到下一支枝叶上，查看新的覆盖范围和命中数。',
        },
      ],
    },
    {
      title: '确认与保存',
      steps: [{
        title: '撤销误操作，再保存工程',
        text: '先结束当前笔刷或数值输入。按 Ctrl＋Z 撤销，按 Ctrl＋Y 重做。要保存时，按 Ctrl＋S 或点击软件顶部「保存工程」。',
        figure: {
          src: 'project-toolbar.webp', width: 538, height: 63,
          alt: '主界面顶部保存工程按钮',
          caption: '红圈内是「保存工程」。',
          markers: [3],
        },
        check: '首次保存工程时，选择「工程文件」，再点「选择位置并保存」。',
      }],
    },
    {
      title: 'Maya 模式的反向和减选',
      text: '在 Maya 模式下，用 Ctrl＋Alt＋左键拖动执行雕刻笔刷反向、单元枝擦除、密度刷反向或叶花果框选减选。',
    },
  ],
};

const firstTree = {
  id: 'first-tree',
  title: '新建整树与保存工程',
  summary: '从默认树或整树样板开始，完成承重枝和枝叶装配，再保存成可继续编辑的工程。',
  keywords: '程序树 默认树 香樟 样板模板 整树生成 branch.json 保存 打开 新手',
  sections: [
    {
      title: '打开一个起点',
      steps: [
        {
          title: '在整树造型中点新建',
          text: '先点顶栏下面的「整树造型」，再点顶栏左侧「新建」。已有工程时，点「我的工程」查找，或点「打开」选择 .branch.json 文件。',
          figure: {
            src: 'project-toolbar.webp', width: 538, height: 63,
            alt: '顶部的新建、打开和我的工程按钮',
            caption: '做新树用「新建」。加载本地文件用「打开」。',
            markers: [1, 2, 4],
          },
          check: '新建完成后，整树视口出现可直接编辑的默认树。',
        },
      ],
    },
    {
      title: '修改树形和枝叶',
      steps: [
        {
          title: '先拖一个承重枝控制点',
          actions: [
            '视口顶部点「主枝干」，再点左侧「点选 V」。',
            '点一根粗枝，等青色控制点出现。按住其中一个中间控制点往目标方向拖，松开后观察枝形。',
          ],
          figure: {
            src: 'select-tools.webp', width: 1055, height: 999,
            alt: '整树承重枝上选中的圆形控制点',
            caption: '图中白色圆点是当前选中的控制点。',
            markers: [1, 2, 3],
          },
          check: '这根枝的曲线随控制点改变。结果不合适时按 Ctrl＋Z。',
        },
        {
          title: '从左侧拖一张单元枝卡片到右侧分区',
          actions: [
            '在右侧「当前植物装配」点「素材库 · 添加装配」，打开左侧素材列表。',
            '按住左侧一张单元枝卡片，拖到右侧目标装配分区，例如「内部」，再松开。',
          ],
          figure: {
            src: 'unit-assembly.webp', width: 1600, height: 1030,
            alt: '右侧的添加装配入口、左侧素材卡片和右侧装配分区',
            caption: '按圈号先打开素材库，再把左侧卡片拖到右侧分区。',
            markers: [2, 6, 4],
          },
          check: '右侧分区出现该素材的卡片，或同款卡片的已用数量更新。',
        },
      ],
    },
    {
      title: '保存成可继续编辑的工程',
      steps: [{
        title: '选择工程文件和保存位置',
        actions: [
          '点软件顶部「保存工程」。在打开的「保存工程与样板」中选择「工程文件」。',
          '填写「名称」，点右下「选择位置并保存」。在系统对话框选目录，确认保存。',
        ],
        figure: {
          src: 'project-save.webp', width: 1100, height: 1163,
          alt: '保存工程窗口中的工程文件选项、名称字段和选择位置并保存按钮',
          caption: '按圈 1、2、3 选择保存类型、填写名称、打开系统保存窗口。',
        },
        check: '得到 .branch.json 文件。之后可以用「打开」加载，也能从「我的工程」继续。',
      }],
    },
  ],
};

const importTrunk = {
  id: 'import-trunk',
  title: '导入树干、校准和绑定',
  summary: '把雕刻或 AI 生成的静态树干 GLB 整理为带真实尺寸和控制骨架的素材。',
  keywords: 'AI模型 雕刻树干 导入GLB 自动骨架 绑定 蒙皮 尺寸 米制 树干整理',
  sections: [
    {
      title: '导入与校准',
      steps: [
        {
          title: '打开树干整理',
          text: '准备好已带 UV 和材质的静态 GLB，本例从直接绑定骨骼开始。',
          actions: [
            '点软件顶部「资源中心」。',
            '在左侧「制作工具」下点「树干整理」。',
          ],
          check: '进入标题为「先选处理方式，再导入树干」的页面。',
          figure: {
            src: 'resource-center.webp',
            width: 1600,
            height: 1009,
            markers: [1],
            alt: '资源中心左侧的制作工具入口与中间的素材目录',
            caption: '「树干整理」在资源中心左侧的「制作工具」区。',
          },
        },
        {
          title: '选择直接绑定并导入',
          text: '使用已做好的网格、UV 和材质。',
          actions: [
            '点中间最左侧的「直接绑定骨骼」卡片。',
            '点卡片下方右侧的黄色「选择树干 GLB」，在文件窗口选中树干文件。',
          ],
          check: '进入「01 模型准备」，中央出现树干，右侧「当前处理方式」显示「直接绑定骨骼」。',
          figure: {
            src: 'trunk-route.webp',
            width: 1600,
            height: 1030,
            alt: '树干整理的处理方式卡片，直接绑定骨骼已选中，右下有选择树干 GLB',
            caption: '选第一张卡片后，点下方黄色「选择树干 GLB」。',
          },
        },
        {
          title: '校准尺寸并开始识别骨架',
          text: '先给树干确定挂接底点和向上的生长方向。',
          actions: [
            '点右侧「重定底点」，到模型上点靠近地面的主干底部。',
            '点右侧「重定朝向」，到模型上点主干上方，用这两点确定生长方向。',
            '在右侧「底点到朝向点的真实长度（m）」输入实测长度。切到「整理结果」检查树干竖直、底点落地。',
            '点右下「开始自动骨架与绑定」，等待识别主干和分叉。',
          ],
          check: '进入「04 自动骨架与绑定」的骨架修整界面，中央显示候选控制枝。',
          figure: {
            src: 'trunk-rig-start.webp',
            width: 1600,
            height: 1030,
            alt: '直接绑定路线的模型准备页，右侧为底点、朝向、真实长度和开始自动骨架与绑定按钮',
            caption: '在右侧依次设置底点、朝向和真实长度，核对后点右下开始绑定。',
          },
        },
      ],
    },
    {
      title: '生成骨架并检查绑定',
      steps: [
        {
          title: '检查候选并确认绑定',
          text: '候选出现后，逐一核对需要摆动的木干。想从骨架页重新生成时，可点左侧「自动识别骨架」，再点右侧「生成候选骨架」。',
          actions: [
            '在视口工具栏选「模型＋骨架」，转动视角，沿主干和分叉确认控制枝落在对应的木干内。点选并调整明显偏离的控制点。',
            '在窗口底部点「试弯曲」，拖动出现的角度滑条，检查相邻枝干是否各自跟随。',
            '点「结束试弯曲」，再点窗口右下黄色「确认绑定」。',
          ],
          check: '确认后进入「弯曲检查与素材保存」，底部提示弯曲与绑定检查通过。',
          figure: {
            src: 'trunk-rig-candidate.webp',
            width: 1600,
            height: 1030,
            alt: '树干骨架候选布满青色控制点，窗口底部有试弯曲和确认绑定按钮',
            caption: '检查青色控制点的位置，试弯曲后确认绑定。',
          },
        },
        {
          title: '检查变形并保存树干',
          text: '在「弯曲检查与素材保存」检查实际变形。',
          actions: [
            '拖动右侧「整树试弯」，看树洞、分叉和相邻木干是否按预期跟随。检查单段时，可点视口里的骨架段，用 R 试转。',
            '检查完成后，将试弯角度恢复到 0°。',
            '底部点「保存到当前项目」，并在主界面点「保存工程」。想立即装配整树时，底部点「以此树干开始创作」。',
          ],
          check: '选择保存时，底部提示「树干素材已保存到当前项目」。',
          figure: {
            src: 'trunk-rig-review.webp',
            width: 1600,
            height: 1030,
            alt: '绑定检查页右侧有整树试弯滑条，右下有保存到当前项目和以此树干开始创作',
            caption: '右侧试弯检查，底部可保存素材或直接开始创作。',
          },
        },
      ],
    },
  ],
  callout: '已有树皮贴图且只需加积雪或苔藓时，导入前选「保留原材质 · 叠加效果」。高模需要减面或拆 UV 时，选「高模分步处理」。',
};

const sculpt = {
  id: 'sculpt-trunk',
  title: '模型雕刻与替换当前树干',
  summary: '修改树干表面，检查雕刻后的骨架与挂点，再应用到当前整树。',
  keywords: '雕刻替换 树皮 笔刷 Grab 拓扑 原始模型 挂接 灯带',
  sections: [
    {
      title: '从雕刻到替换',
      steps: [
        {
          title: '打开模型雕刻',
          text: '可从已导入的树干继续雕刻，也可直接导入 GLB。',
          actions: [
            '在「树干整理」的视口上方，点「整理结果」右边的「模型雕刻」。',
            '若从「资源中心」左侧直接打开「模型雕刻」，在雕刻窗口右上点「导入 GLB」并选择文件。',
          ],
          check: '中央出现待雕刻的树干，顶部可选择「本次开始前」「雕刻结果」或「原始 GLB」。',
          figure: {
            src: 'sculpt-entry.webp',
            width: 1260,
            height: 227,
            alt: '树干整理的模型准备页，视口工具栏有模型雕刻按钮',
            caption: '桌面版「树干整理」导入模型后，点击「整理结果」右侧的「模型雕刻」。',
          },
        },
        {
          title: '选择笔刷并修改表面',
          text: '以「鼓起 / 压入」为例，在树干局部做一笔调整。',
          actions: [
            '点左侧「表面修整」里的「鼓起 / 压入」。右侧「当前工具」随之更新。',
            '在视口上方的笔刷栏设置「半径」和「强度」。',
            '把圆圈移到要调整的木干表面，按住左键短拖一笔，松手结束。',
          ],
          check: '「雕刻结果」视图显示变形后的表面。可从底部点「撤销」回退这一笔。',
          figure: {
            src: 'sculpt-brush.webp',
            width: 1560,
            height: 937,
            alt: '雕刻窗口中选中的鼓起压入工具和树干上的圆形笔刷',
            caption: '左侧选「鼓起 / 压入」，顶部改半径和强度。圆圈覆盖网格后即可落笔。',
          },
        },
        {
          title: '对比结果并进入树干整理',
          text: '确认造型后，将当前雕刻版本交给树干整理。',
          actions: [
            '点视口左上「本次开始前」，看编辑前的轮廓。',
            '点旁边「雕刻结果」，回到当前版本，检查同一处表面。',
            '确认后点底部右侧「进入树干整理」。草稿也可稍后从左侧「继续草稿」恢复。',
          ],
          check: '回到「树干整理」后，中央显示雕刻后的树干，可继续复核尺寸和骨架。',
          figure: {
            src: 'sculpt-compare.webp',
            width: 1560,
            height: 937,
            alt: '雕刻窗口选择本次开始前视图，右下有进入树干整理按钮',
            caption: '先用顶部两个按钮对比轮廓，再点右下「进入树干整理」。',
          },
        },
        {
          title: '复查并替换当前整树里的树干',
          text: '这一步适用于当前整树已有同源树干，并且整理窗口底部显示「预览应用到当前树」。',
          actions: [
            '在「树干整理」检查方向、尺寸、控制枝与挂点。',
            '点底部「预览应用到当前树」，在替换窗口选择「替换目标」，并比较「当前整树」与「替换雕刻网格后」。',
            '确认分叉和已挂接枝叶位置后，点右下「应用到当前树」，再点主界面「保存工程」。',
          ],
          figure: {
            src: 'sculpt-replace-entry.webp', width: 534, height: 60,
            alt: '树干整理底部右侧的预览应用到当前树按钮',
            caption: '同源树干在当前整树上有装配时，树干整理底部右侧出现这个入口。',
          },
          check: '整树视口显示更新后的树干，可以直接检查原有挂接。',
        },
      ],
    },
  ],
  callout: '同源、同拓扑替换会更新表面挂点，已有灯带会沿新树皮重新贴合。替换和灯带贴合可一起撤销。',
};

const stagedModel = {
  id: 'staged-model',
  title: '高模分步处理与树皮材质',
  summary: '按需要在拓扑、UV 或材质阶段交付 GLB。',
  keywords: '高模 低模 减面 拓扑 UV 自动拆分 贴图 PBR GLB 叠加材质 批量制作',
  callout: '当前版本的内嵌材质工作台按单模型处理。多个模型可依次准备、检查并各自导出。',
  sections: [
    {
      title: '拓扑 GLB · 交付网格',
      steps: [
        {
          title: '选择高模分步处理',
          text: '从「资源中心」左侧的「树干整理」进入。',
          actions: [
            '点最右侧的「高模分步处理」卡片。',
            '在卡片下方设置「目标三角面」，例如 1.5 万。',
            '点右下黄色「选择树干 GLB」，在文件窗口选中高模文件。',
          ],
          check: '树干出现在「01 模型准备」，右侧「当前处理方式」显示「高模分步处理」。',
          figure: {
            src: 'staged-import.webp',
            width: 1138,
            height: 602,
            alt: '树干整理中选中高模分步处理卡片，下方显示目标三角面与选择树干 GLB',
            caption: '从右侧选高模分步处理，设好目标面数后打开 GLB。',
          },
        },
        {
          title: '开始拓扑减面',
          text: '确认右侧的树干方向和实际尺寸，再进入分步流程。',
          actions: [
            '点「01 模型准备」右下的「开始拓扑减面」。',
            '等材质工坊打开后，确认左侧处理方式是「分步处理 · 拓扑后暂停」。',
          ],
          check: '拓扑处理完成后，视口上方提示「拓扑已就绪」。',
          figure: {
            src: 'staged-start-topology.webp',
            width: 320,
            height: 174,
            alt: '树干整理右侧模型准备面板的尺寸读数与开始拓扑减面按钮',
            caption: '在右侧核对尺寸，再点面板底部「开始拓扑减面」。',
          },
        },
        {
          title: '减面并导出拓扑',
          text: '如果前一步已完成拓扑，可直接导出。如果要改面数，在材质工坊里重新减面。',
          actions: [
            '需要改面数时，在「模型准备」左侧调整「目标三角面」，点同一列的「拓扑减面当前模型」。',
            '查看上方结果条，确认出现「拓扑已就绪」。',
            '向下滚动左侧面板，在「分步操作与导出」点「导出拓扑 GLB」。',
          ],
          check: '导出后出现「拓扑 GLB 已生成」，保存的是这个阶段的网格。',
          figure: {
            src: 'staged-topology.webp',
            width: 1650,
            height: 863,
            alt: '分步模型准备完成拓扑减面，显示拓扑已就绪和导出拓扑 GLB',
            caption: '目标面数、减面按钮和导出按钮都在左列。上方结果条显示减面前后的面数。',
          },
        },
      ],
    },
    {
      title: 'UV GLB · 交付已拆排的模型',
      steps: [
        {
          title: '拆排并导出 UV',
          text: '继续使用「01 模型准备」中的当前网格。',
          actions: [
            '向下滚动左侧，在「分步操作与导出」点「自动拆分并排布 UV」。',
            '等待完成，查看右侧「当前 UV」里的岛屿排布。用「UV 精修」手动修改时，检查结果后点「采用候选」。',
            '左侧「导出 UV GLB」可点后，点击生成带 UV 的 GLB。',
          ],
          check: '左下提示「UV 已就绪」，导出时出现「已采用的 UV GLB 已生成」。',
          figure: {
            src: 'staged-uv.webp',
            width: 1650,
            height: 863,
            alt: '模型准备页左下方是拆排和导出 UV 按钮，右侧显示排布后的 UV 岛',
            caption: '右侧「当前 UV」显示采用后的排布。左下「导出 UV GLB」启用后，可保存带这套 UV 的模型。',
          },
        },
      ],
    },
    {
      title: '材质 GLB · 交付带贴图的模型',
      steps: [
        {
          title: '选择基础材质',
          text: '完成 UV 后，点底部「下一步：表面材质」，开始调整树皮基底。',
          actions: [
            '在材质库上方点「基础材质」。',
            '点想要的树皮卡片，例如「AI 斑驳树皮 01」。',
            '点左侧图层里的「树皮 · 固定基底」，在右侧调整「总凹凸强度」「粗糙度」或「树皮颜色」。',
          ],
          check: '中央模型显示新的基底效果，右侧仍可修改树皮参数。',
          figure: {
            src: 'staged-material.webp',
            width: 1650,
            height: 863,
            alt: '表面材质页的基础材质库、树皮视口和右侧树皮基底参数',
            caption: '左侧选基础材质，中央看树皮效果，右侧微调纹理宽度和表面质感。',
          },
        },
        {
          title: '添加叠加效果或贴花',
          text: '需要增加苔藓、切口等局部变化时，再添加叠加效果。',
          actions: [
            '在材质库上方切到「后期叠加」。',
            '双击想添加的效果卡片，例如标有「局部贴花」的「平整年轮切口」。',
            '当视口提示「点击树表面放置贴花」时，在模型的目标表面点一下。普通叠加效果可双击添加到图层。',
          ],
          check: '左侧图层栈出现新效果；对贴花可转动视角检查它是否贴在指定表面。',
          figure: {
            src: 'staged-overlay.webp',
            width: 1650,
            height: 863,
            alt: '材质库打开后期叠加，显示平整年轮切口等局部贴花',
            caption: '「后期叠加」里可查找整体效果和局部贴花。图中的切口卡片提示在模型上点击定位。',
          },
        },
        {
          title: '检查并导出最终 GLB',
          text: '点底部「下一步：检查与保存」，或从顶部切到「03 检查与保存」。',
          actions: [
            '在上方「分辨率」选择需要的贴图规格，检查同一栏的 UV 和材质状态。',
            '查看右侧「PBR 贴图」里的 BaseColor、Normal 与 ORM。',
            '点上方黄色「生成最终 GLB」。还需回到树干绑定时，点底部「保存并进入自动骨架」。',
          ],
          check: '生成成功后显示「下载最终 GLB」。下载的是内嵌贴图的模型。',
          figure: {
            src: 'staged-check-save.webp',
            width: 1650,
            height: 863,
            alt: '检查与保存页显示模型、PBR 贴图预览和生成最终 GLB 按钮',
            caption: '右侧可检查三种 PBR 贴图，上方黄色按钮生成最终 GLB。',
          },
        },
      ],
    },
  ],
};

const foliage = {
  id: 'foliage-units',
  title: '拆分和校准叶花果',
  summary: '从共享贴图的 GLB 中提取叶片、花朵和果实，保存为可在单元枝上使用的套装。',
  keywords: '叶片 花朵 果实 素材包 共用图集 叶花 贴图 atlas 尺寸',
  sections: [
    {
      title: '从整包提取单元',
      steps: [
        {
          title: '打开叶花果整理',
          text: '可以用软件内置的弯枝和叶花果练习，也可以准备自己的整包 GLB。',
          actions: [
            '点顶部「资源中心」。',
            '点左侧「制作工具」里的「叶花果整理」。',
          ],
          check: '打开「叶花果拆分与校准」窗口。',
          figure: {
            src: 'resource-center.webp',
            width: 1600,
            height: 1009,
            markers: [3],
            alt: '资源中心左侧制作工具区域的叶花果整理入口',
            caption: '从「制作工具」里的「叶花果整理」打开拆分窗口。',
          },
        },
        {
          title: '导入整包 GLB',
          text: '在拆分窗口装入共享贴图的整包模型。',
          actions: [
            '第一次练习时，点窗口上方「打开内置测试」。',
            '使用自己的模型时，点「导入整包 GLB」，在文件窗口选中 GLB。',
          ],
          check: '左侧显示「整包总览」，中央能看到整包里的各个网格。',
          figure: {
            src: 'unit-preparation.webp',
            width: 1600,
            height: 1011,
            markers: [1],
            alt: '叶花果拆分窗口右上角的导入整包 GLB 按钮',
            caption: '先用窗口右上「导入整包 GLB」装入原始模型。',
          },
        },
        {
          title: '框选并提取',
          text: '先从模型间距较大的一个完整单元开始。',
          actions: [
            '在视口上方选「框选」。想同时选到背面时，保留「穿透框选」勾选。',
            '用左键拖出选框，完整圈住目标叶簇或果实，确认选区高亮只覆盖这个单元。',
            '在右侧选好「提取类型」，再点「提取为单元」。框住弯枝时选「基础枝」。',
          ],
          check: '左侧「整理单元」增加一个条目，视口只显示刚提取的单元，右侧进入「底点与方向」。',
          figure: {
            src: 'unit-preparation.webp',
            width: 1600,
            height: 1011,
            markers: [2, 3],
            alt: '叶花果整包视口中选中的叶簇与右侧已启用的提取按钮',
            caption: '选中的叶簇会高亮，核对选区后点击右侧「提取为单元」。',
          },
        },
        {
          title: '设置底点与朝向',
          text: '在左侧点刚提取的条目，从右侧设置「单元名称」与「类型」。',
          actions: [
            '点右侧「点底点」，再点模型中希望挂到枝上的位置，例如叶柄根部。',
            '点右侧「点朝向点」，再点模型生长方向一侧，例如叶梢方向。',
          ],
          check: '两个按钮旁都显示「已设置」，视口可切到「校准结果」。',
          figure: {
            src: 'unit-calibration.webp',
            width: 1600,
            height: 1011,
            markers: [1, 2],
            alt: '提取出的叶簇与右侧的底点、朝向点设置',
            caption: '提取后，视口单独显示当前单元。用右侧的按钮，依次在叶簇上指定挂接底点和朝向点。',
          },
        },
        {
          title: '输入真实大小并确认',
          text: '底点和朝向设置好后，按实际测量值校准尺寸。',
          actions: [
            '向下滚动右侧到「真实大小」，按实际厘米数填写「长度 Y（cm）」或「最大边（cm）」。',
            '核对视口的长度与宽度，再点右侧黄色「确认当前修改并继续」。',
          ],
          check: '回到「整包总览」时，左侧刚校准的条目标为「已确认」。',
          figure: {
            src: 'unit-size.webp',
            width: 1600,
            height: 1011,
            alt: '校准结果中显示 12 厘米，右侧有真实大小与确认当前修改并继续',
            caption: '在右侧填入实测尺寸，检查中央预览，再确认当前单元。',
          },
        },
        {
          title: '保存套装',
          text: '左侧已确认数量达到总数后，点窗口右下「保存套装并打开」。',
          check: '套装收入内容库，可以从枝条工作台选择这些已校准的叶花果。',
          figure: {
            src: 'unit-save.webp',
            width: 1600,
            height: 1011,
            alt: '已确认 1 个整理单元，右下角保存套装并打开按钮已启用',
            caption: '核对左侧已确认数量，再点右下黄色的「保存套装并打开」。',
          },
        },
      ],
    },
  ],
};

const unitBranches = {
  id: 'unit-branches',
  title: '制作单元枝并装配到树上',
  summary: '在枝条工作台编辑枝叶素材，在整树上摆放它的实例。',
  keywords: '完整枝 实例 次枝 素材库 模型复用 叶花果 装配 挂点',
  sections: [
    {
      title: '在枝条工作台制作并保存',
      steps: [
        {
          title: '打开枝条工作台并新建单枝',
          actions: [
            '点顶部「枝条工作台」，切到左侧「创建」。',
            '点左侧「新建单枝」。在中央视口点选枝条或控制点，再调整木枝和叶片。',
            '想直接试贴面组装时，切到「装配」，将组装方式选为「基础枝组装」，选择「内置测试 · 弯枝与叶花果」，再点「使用这根基础枝」。',
          ],
          figure: {
            src: 'unit-branches.webp', width: 1600, height: 1030,
            alt: '枝条工作台的入口、新建单枝按钮与单枝视口',
            caption: '进入工作台后，「新建单枝」位于左侧创建页上方。',
          },
          check: '中央视口显示当前单枝，可以单独编辑枝形和内部叶花果。',
        },
        {
          title: '保存单元枝素材',
          actions: [
            '点左侧上方的「素材」标签。检查或修改「素材名称」。',
            '点「保存素材」保存当前造型。需要独立新素材时，点下面的「另存新素材」。',
          ],
          figure: {
            src: 'unit-asset-save.webp',
            width: 1600,
            height: 1030,
            alt: '左侧素材标签及保存素材、另存新素材按钮',
            caption: '圈 2 保存当前素材，圈 3 另建一份独立素材。',
          },
          check: '在左侧「当前工程 · 单元枝素材」找到刚保存的卡片。',
        },
      ],
    },
    {
      title: '添加到整树并调整摆放',
      steps: [
        {
          title: '添加到整树',
          actions: [
            '点顶部「整树造型」返回树。点右侧「素材库 · 添加装配」。',
            '从左侧素材列表拖入右侧分区，例如「内部」，然后松开。',
          ],
          figure: {
            src: 'unit-assembly.webp',
            width: 1600,
            height: 1030,
            alt: '整树的单元枝模式，左侧有素材卡片，右侧显示整树装配',
            caption: '打开左侧素材库后，从圈 2 拖到圈 3。圈 4 显示已用数量。',
            markers: [2, 6, 4, 5],
          },
          check: '在右侧对应分区看到刚拖入的素材，整树视口更新枝叶装配。',
        },
        {
          title: '点选树上的一支来微调',
          text: '点右侧「点选 · 微调单元枝」，再点树上的木枝或叶片。按 G 调挂接位置、R 调方向、S 调大小。改内部造型时，在右侧对应卡片的「更多」菜单点「编辑源单元枝」。',
          figure: {
            src: 'unit-assembly.webp', width: 1600, height: 1030,
            alt: '整树模式下右侧的点选微调单元枝按钮',
            caption: '点圈内的按钮，再到视口点选一支。',
            markers: [3],
          },
          check: '变换时整支单元枝一起移动，叶片和木枝维持原有相对位置。',
        },
      ],
    },
  ],
};

const lights = {
  id: 'tree-lights',
  title: '绕树灯带与流水预览',
  summary: '让灯带沿程序树或导入树干缠绕，调整高度和密度，并预览流水方向。',
  keywords: '灯光 灯条 流水灯 绕线 高度 密度 两套UV 双UV UV1 发光',
  sections: [
    {
      title: '设置灯带与流水',
      steps: [
        {
          title: '启用灯带',
          text: '打开一棵整树。下面以主干绕灯为例。',
          actions: [
            '点整树视口右上角的「灯带」。',
            '在展开的「树干灯带」面板顶部勾选「启用灯带」。有多根可用树干时，先用面板里的「树干」下拉框选目标。',
            '把「绕线位置」设为「仅主干」。如果只绕一根侧枝，先在视口选中那根枝，再选「当前选中枝」。',
          ],
          check: '灯带出现在所选树干上，面板展开高度、圈距与灯光参数。',
          figure: {
            src: 'lights.webp',
            width: 1055,
            height: 999,
            markers: [1, 2],
            alt: '整树视口中绕着树干的灯带与右侧的树干灯带设置',
            caption: '先点视口右上的「灯带」，再勾选面板顶部的「启用灯带」。',
          },
        },
        {
          title: '限定离地高度与圈距',
          text: '离地范围用米，圈距用厘米。先定覆盖范围，再调疏密。',
          actions: [
            '在「绕线位置」下方填写「离地起点 · m」和「离地终点 · m」。',
            '点「紧密 2 cm」「常规 8 cm」或「疏绕 16 cm」，也可直接在「沿枝干每圈 · cm」输入圈距。',
            '按需修改「缠绕方向」「灯光颜色」等外观参数，点面板下方「立即更新」。',
          ],
          check: '面板底部显示实际的离地范围和圈数，视口中的灯带覆盖与目标一致。',
          figure: {
            src: 'lights.webp',
            width: 1055,
            height: 999,
            markers: [3],
            alt: '树干灯带面板中的离地高度、疏密预设和自定义圈距',
            caption: '两项离地高度决定绕线范围，圈距越小，每米绕出的圈数越多。',
          },
        },
        {
          title: '预览并保存流水',
          text: '先确认灯带已经生成，再设置流水。',
          actions: [
            '点面板下方「播放流水灯」。',
            '在按钮下改「流水速度」，再从「流水方向」选择「沿布线路线」或「逆布线路线」。',
            '确认亮段沿希望的方向移动后，点主界面顶部「保存工程」。',
          ],
          check: '播放时按钮变为「停止流水灯」，树干上的亮段沿灯带移动。',
          figure: {
            src: 'light-flow.webp',
            width: 1055,
            height: 999,
            alt: '灯带流水播放时显示停止流水灯、速度和方向设置',
            caption: '按钮显示「停止流水灯」时，流水正在播放。下方的速度和方向可以继续调整。',
          },
        },
      ],
    },
    {
      title: '覆盖高度与圈距示意',
      text: '在弯曲枝干上，圈距沿枝干路线计算。',
      figure: {
        src: 'light-wrapping-illustration.webp',
        width: 1536,
        height: 1024,
        kind: 'illustration',
        alt: '树干上缠绕的灯带，左侧长标线标出覆盖范围，右侧短标线示意相邻两圈',
        caption: '左侧长标线表示灯带覆盖的高度范围，右侧两条短线表示相邻两圈的间距。',
      },
    },
    {
      title: '把灯带带到其他软件',
      text: '导出 GLB 或「UE/PVE 完整单元枝包」时，灯带可随模型交付。灯带第二套 UV 的 U 方向沿布线路线，可用于制作流水材质。',
    },
  ],
};

const wind = {
  id: 'wind-preview',
  title: '预览树木的风动',
  summary: '在软件里查看主干、侧枝和单元枝的摆动与跟随。',
  keywords: '风向 模拟 风权重 空格 动画 骨骼',
  sections: [
    {
      title: '播放与检查',
      steps: [
        {
          title: '开启风动预览',
          text: '打开一棵整树，让主干分叉与枝根同时处于视口中。',
          actions: [
            '点视口右上「风动预览」。',
            '在右侧「风动模拟」选「自然风」等预设，再调「风力」「阵风变化」或「吹向」角度。',
            '点视口底部控制条的「播放」。',
          ],
          check: '视口显示「风动预览 · 正在播放」，底部时间开始增加。',
          figure: {
            src: 'wind-preview.webp',
            width: 1600,
            height: 1030,
            alt: '风动播放时的树木，右侧为风动模拟参数，下方为播放控制',
            caption: '右侧调整吹向和摆动，下方显示播放状态、速度和当前时间。',
          },
        },
        {
          title: '暂停并检查枝根',
          text: '在播放中观察主干、侧枝与挂在枝上的完整单元枝。',
          actions: [
            '在底部点「暂停」，或在视口按空格。想慢速观察，可在底部速度下拉框选「0.25×」。',
            '暂停后点底部「单步」，逐步看枝根是否贴合。',
            '点「静止」回到原始造型。需要保留风动参数时，点顶部「保存工程」。',
          ],
          check: '静止后时间回到 0.0 s，视口恢复静止造型。',
          figure: {
            src: 'wind-preview.webp',
            width: 1600,
            height: 1030,
            markers: [3],
            alt: '整树风动视口底部的暂停、静止、单步和速度控制条',
            caption: '暂停、单步和静止都在视口底部，暂停后可按帧检查。',
          },
        },
      ],
    },
  ],
};

const vines = {
  id: 'surface-vines',
  title: '制作沿表面生长的藤蔓',
  summary: '把藤蔓沿承载模型表面铺开，设定生长路线和禁生区。',
  keywords: '常春藤 藤条 沿面 路径 表面禁生 参考模型 GLB OBJ USD',
  sections: [
    {
      title: '从承载模型生成藤蔓',
      steps: [
        {
          title: '导入承载模型',
          text: '准备要攀附的表面模型。也可使用示例里的桥墩。',
          actions: [
            '在主界面上方切到「藤蔓植物」。',
            '在左侧「生长」页展开「沿模型表面生长」，再展开「承载模型 · 导入与单位」。',
            '先设置「模型单位」，再点「导入承载模型 GLB / OBJ」。跟着示例练习时，点旁边「载入桥墩示例」。',
          ],
          check: '中央视口显示承载模型，左侧列出文件名和三角面数。',
          figure: {
            src: 'vines-surface-import.webp',
            width: 1540,
            height: 1000,
            alt: '藤蔓工作区已载入桥墩，左侧显示导入承载模型和模型单位',
            caption: '桥墩载入后出现在视口。左侧可切换模型单位、导入其他承载模型，或启用贴面生长。',
          },
        },
        {
          title: '设定路线',
          text: '以桥墩立面向上生长为例。',
          actions: [
            '在左侧勾选「启用贴面生长」。将「当前编辑范围」切到「画路线 · 所选路线」，再点「点起点 · 向上长」。',
            '在中央视口点桥墩立面上想让藤蔓开始的位置。要自定走向时，可改用左侧「画走势 · 生成藤群」。',
            '从右侧「路线与绘制」选中新路线，将「参数作用于」切到「所选路线」，再调「起点生长距离」或「分叉密度」。',
          ],
          check: '右侧新增「攀爬藤群」条目，中央能看到沿承载面生长的藤蔓。',
          figure: {
            src: 'vines-surface-route.webp',
            width: 1540,
            height: 1000,
            alt: '桥墩表面长出藤蔓，右侧的路线与绘制列表中显示一条路线',
            caption: '选「点起点 · 向上长」并点击桥墩表面。生成后，藤蔓出现在视口，右侧「路线与绘制」新增一条路线。',
          },
        },
        {
          title: '留出禁生区并保存',
          text: '需要在窗洞等位置留空时，用禁生区排除覆盖。',
          actions: [
            '点左侧「刷禁生区」，在承载面上拖过要留空的区域。误刷时用「擦除禁生区」修正。',
            '点「结束操作 / 旋转观察」，转动视角检查藤蔓的位置。',
            '点顶部「保存工程」，记录承载网格、路线和禁生区。',
          ],
          check: '重新打开工程后，可继续编辑原有路线和禁生区。',
          figure: {
            src: 'vines-surface-route.webp',
            width: 1540,
            height: 1000,
            markers: [4, 5],
            alt: '藤蔓生长页面左侧的刷禁生区和结束操作按钮',
            caption: '从左侧进入禁生区笔刷。刷完点「结束操作 / 旋转观察」回到视角操作。',
          },
        },
      ],
    },
  ],
};

const models = {
  id: 'model-export',
  title: '导出 GLB 或 FBX',
  summary: '按目标软件是否需要骨架与蒙皮选择格式。',
  keywords: 'FBX GLTF GLB 蒙皮 骨骼 拓扑 UV 网格 模型导出',
  sections: [
    {
      title: '从整树导出',
      steps: [
        {
          title: '打开左侧输出页',
          text: '需要更换保存位置时，在整树造型左侧的标签栏点最右边的「输出」。',
          figure: {
            src: 'export-output-tab.webp', width: 410, height: 111,
            alt: '整树左侧标签栏右端的输出按钮',
            caption: '点红圈里的「输出」。',
          },
        },
        {
          title: '在输出位置里选择目录',
          actions: [
            '在左侧「输出」面板向下滚动，展开「输出位置」。',
            '点路径右侧的「选择模型输出位置」文件夹按钮，在文件窗口选择保存位置。',
          ],
          check: '左侧「输出位置」显示更新后的文件路径。',
          figure: {
            src: 'export-location.webp',
            width: 410,
            height: 205,
            alt: '输出位置分组和路径右侧的文件夹按钮',
            caption: '往下找到「输出位置」，展开后点击路径右侧的文件夹。',
          },
        },
        {
          title: '导出静态或骨骼 GLB',
          text: '点软件顶部「导出模型」，使用弹窗左侧「模型与骨骼」栏。',
          actions: [
            '在格式下拉框选择「静态 GLB · 完整模型」，再点下方「导出静态 GLB」。',
            '需要骨架和蒙皮时，改选「骨骼 GLB · 含蒙皮绑定」，再点「导出骨骼 GLB」。',
          ],
          check: '软件提示已导出并显示 .glb 文件路径。导入后可核对尺寸和材质，骨骼版还可核对骨架。',
          figure: {
            src: 'export-glb.webp',
            width: 1280,
            height: 748,
            alt: '导出模型窗口选择了静态 GLB 完整模型，下方显示导出静态 GLB',
            caption: '在左侧选择 GLB 类型后，下方按钮会显示相应的导出操作。',
          },
        },
        {
          title: '导出 FBX',
          text: '需要 FBX 时，在同一个「导出模型」窗口更改格式。',
          actions: [
            '在「模型与骨骼」下拉框选择「FBX · 传统导出」。',
            '点下方黄色「导出 UE FBX」。',
          ],
          check: '软件提示「FBX 已导出」并显示文件路径。',
          figure: {
            src: 'export.webp',
            width: 1278,
            height: 803,
            markers: [1, 2],
            alt: '导出模型窗口左侧选择了传统 FBX，下方显示导出 UE FBX',
            caption: '选「FBX · 传统导出」后，按钮显示「导出 UE FBX」。',
          },
        },
      ],
    },
    {
      title: '从材质工坊导出',
      steps: [
        {
          title: '导出带贴图的最终 GLB',
          text: '仅需要拓扑或 UV 时，在「模型准备」左侧使用对应的 GLB 导出按钮。需要带贴图的模型时，切到「03 检查与保存」。',
          actions: [
            '在上方设置「分辨率」，确认右侧「PBR 贴图」符合需要。',
            '点上方「生成最终 GLB」，等待生成后点「下载最终 GLB」。',
          ],
          check: '生成后的 GLB 内嵌 BaseColor、Normal 与 ORM，可作为一个文件导入。',
          figure: {
            src: 'staged-check-save.webp',
            width: 1650,
            height: 863,
            alt: '材质工坊的检查与保存页，右上角有生成最终 GLB 按钮',
            caption: '检查分辨率和右侧贴图预览后，点「生成最终 GLB」。',
          },
        },
      ],
    },
  ],
};

const extraSections = {
  ...treeWorkbenchSections,
  ...materialExpandedSections,
  ...projectExpandedSections,
  ...vineExpandedSections,
};
const tutorialSections = {
  ...materialTroubleshootingSections,
  selection: selectionExtraSections,
  'export-plant-packages': deliveryTroubleshootingSections,
};
const branchGuideIds = new Set([
  'branch-pose-and-structure', 'compose-branch-foliage', 'reference-views-and-branch-drawing',
  'advanced-branch-shaping', 'create-pruned-shrub-forms',
]);
const branchGuides = treeWorkbenchArticles.filter(article => branchGuideIds.has(article.id));
const treeGuides = treeWorkbenchArticles.filter(article => !branchGuideIds.has(article.id));
const trunkGuides = materialExpandedArticles.filter(article => article.id.startsWith('trunk-'));
const materialGuides = materialExpandedArticles.filter(article => article.id.startsWith('material-'));
const leafGuides = materialExpandedArticles.filter(article => article.id === 'leaf-pack-from-glbs');
const projectGuides = new Map(projectExpandedArticles.map(article => [article.id, article]));
const treeCaseGuides = [
  { ...fastTreeCase, caseInput: '没有现成树干' },
  { ...sculptedTreeCase, caseInput: '有雕刻树干，待做材质' },
  { ...directBoundTreeCase, caseInput: '有带 UV 和材质的树干' },
];

function extendArticles(articles) {
  return articles.map(article => {
    const sections = [...(extraSections[article.id] || []), ...(tutorialSections[article.id] || [])];
    return sections.length ? { ...article, sections: [...article.sections, ...sections] } : article;
  });
}

// IDs are stable so links and search results survive changes to article titles.
export const wikiCategories = [
  {
    id: 'controls',
    title: '常用操作',
    groups: [
      { id: 'view-and-selection', title: '视口与选择', articles: [navigation, selection, projectGuides.get('graphics-mode-recovery')] },
      { id: 'editing-shortcuts', title: '编辑快捷键', articles: [transform, brushes] },
      { id: 'dimensions-and-presentation', title: '尺寸与取景', articles: [sizeReferenceArticle, studioArticle] },
    ],
  },
  {
    id: 'workflows',
    title: '功能流程',
    groups: [
      { id: 'tree-case-studies', title: '整树实战', articles: treeCaseGuides },
      { id: 'get-started', title: '整树入门', articles: [firstTree, unitBranches] },
      { id: 'branch-workbench', title: '枝条工作台', articles: [...branchGuides, branchVariantsArticle] },
      { id: 'tree-assembly-and-variants', title: '整树造型与装配', articles: [...treeRepairArticles, ...treeGuides, ...assemblyArticles, treeVariantsArticle, bonsaiArticle] },
      { id: 'projects-and-resources', title: '工程与资源库', articles: [
        ...libraryArticles, branchTransferArticle, projectGuides.get('personal-template-versions'), projectGuides.get('resource-center-organization'),
      ] },
      { id: 'trunk-and-materials', title: '树干导入、雕刻与绑定', articles: [importTrunk, ...trunkGuides, sculpt] },
      { id: 'surface-materials', title: '树皮材质与 UV', articles: [barkArticle, stagedModel, ...materialExtraArticles, ...materialGuides] },
      { id: 'plants', title: '叶花果', articles: [foliage, ...leafGuides] },
      { id: 'vines-and-vegetation', title: '藤蔓与场景植物', articles: [facadeVineCase, vines, regionPaintArticle, ...vineExpandedArticles] },
      { id: 'lights-and-wind', title: '状态、灯带与风动', articles: [projectGuides.get('plant-state-timeline'), lights, wind] },
      { id: 'delivery', title: '模型导出', articles: [models, projectGuides.get('export-plant-packages')] },
    ],
  },
].map(category => ({
  ...category,
  groups: category.groups.map(group => ({ ...group, articles: extendArticles(group.articles) })),
}));
