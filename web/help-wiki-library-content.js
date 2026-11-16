const projectLibrary = {
  id: 'project-library',
  title: '打开已有工程与使用整树样板',
  summary: '在「我的工程」继续作品、恢复草稿，或从整株样板创建一份可编辑的工程。',
  keywords: '我的工程 已保存 最近打开 恢复草稿 整树样板库 整株样板 本机内容库 打开本地工程 branch.json 搜索 收藏',
  sections: [
    {
      title: '继续已有工程',
      steps: [
        {
          title: '打开「我的工程」',
          actions: ['点软件顶部左侧「我的工程」。', '切到「已保存工程」，按名称或路径搜索。也可用「全部类型」筛选整树、单元枝或藤蔓。'],
          figure: {
            src: 'project-toolbar.webp', width: 538, height: 63, markers: [2],
            alt: '软件顶栏左侧的我的工程按钮',
            caption: '圈 1 是工程浏览器的入口。',
          },
        },
        {
          title: '选中工程并打开',
          actions: ['点一张工程卡片，在右侧核对名称、类型和保存位置。', '点右侧「打开工程」，或双击工程卡片。'],
          figure: {
            src: 'library-my-projects.webp', width: 1405, height: 993, markers: [1, 2, 3, 4],
            alt: '已保存工程列表、搜索框、选中卡片和打开工程按钮',
            caption: '依次选已保存工程、搜索、点工程卡片，再打开。',
          },
          check: '载入完成后，视口显示所选工程。',
        },
        {
          title: '找回移动过的文件、最近记录或恢复草稿',
          actions: [
            '工程文件移过位置时，点「打开本地工程…」，在系统对话框重新选择 .branch.json。',
            '需要回到上次打开时的完整快照，点「最近打开」并选择对应记录。要读磁盘上的最新文件，回到「已保存工程」打开。',
            '遇到软件意外关闭，点「恢复草稿」并选择相应草稿。恢复后用「保存工程」落盘。',
          ],
          figure: {
            src: 'library-my-projects.webp', width: 1405, height: 993, markers: [5, 7, 8],
            alt: '我的工程中的打开本地工程、最近打开和恢复草稿入口',
            caption: '按需要选本地文件、历史快照或自动恢复副本。',
          },
        },
      ],
    },
    {
      title: '从整树样板开始',
      steps: [
        {
          title: '打开整树样板库',
          actions: ['在「我的工程」顶部右侧点「整树样板库」。', '也可以从顶栏进入「资源中心」，依次选「本机内容库」和「整株样板」。'],
          figure: {
            src: 'library-my-projects.webp', width: 1405, height: 993, markers: [6],
            alt: '我的工程窗口右上方的整树样板库入口',
            caption: '点此进入资源中心里的整株样板列表。',
          },
        },
        {
          title: '选择树型',
          actions: [
            '在资源中心搜索植物名称。单击结果卡片，在右侧查看整株预览和版本。',
            '点右侧「以此新建工程」。',
          ],
          figure: {
            src: 'library-template.webp', width: 1600, height: 1009, markers: [3, 4, 5],
            alt: '资源中心中查找到的黄色小花整株样板与新建按钮',
            caption: '搜索后点样板卡片，再到右侧点「以此新建工程」。',
          },
        },
        {
          title: '确认创建可编辑副本',
          actions: [
            '在「使用这个树型？」中核对样板名称，再点「创建副本」。当前工程还有修改时，按弹窗提示处理保存。',
            '树型加载后调整枝形或装配，再用「保存工程」给作品命名并保存。',
          ],
          figure: {
            src: 'library-template-confirm.webp', width: 605, height: 423,
            alt: '使用整树样板的确认弹窗与创建副本按钮',
            caption: '点右下的「创建副本」后，软件才开始加载样板。',
          },
          check: '视口加载样板的树型和已有装配，可以开始编辑。',
        },
      ],
    },
  ],
};

const resourcePacks = {
  id: 'plant-resource-packs',
  title: '导出、导入和查看植物资源包',
  summary: '把整株样板、单元枝、预制或叶花果连同依赖一起分享，再按需取用包里的素材。',
  keywords: '资源中心 资源包 plantpack 导入 导出 依赖 打包 分享 版本 作者 授权 安装 本机内容库 归档',
  sections: [
    {
      title: '选择要分享的资源',
      steps: [
        {
          title: '在资源中心勾选素材',
          actions: [
            '点软件顶部「资源中心」。左侧选「当前项目」或「本机内容库」，再选资源分类。图中示例选择「本机内容库」的「叶花果」。',
            '勾选卡片左上角。想核对内容时，点列表底部「查看已选与依赖」。确认后点「导出所选资源包」。',
          ],
          figure: {
            src: 'library-pack-source.webp', width: 1600, height: 1009, markers: [1, 2, 3, 4, 5],
            alt: '资源中心叶花果分类中已勾选一项素材，底部可查看依赖或导出',
            caption: '左侧选资源位置和分类，勾选要分享的卡片，再从底部进入导出。',
          },
          check: '导出向导显示刚才勾选的素材和随包携带的必需依赖。',
        },
        {
          title: '核对向导里的已选项',
          actions: ['在「选择内容」页点「查看已选与依赖」。', '确认主动选择的内容和自动携带的依赖后，点「下一步 · 填写信息」。'],
          figure: {
            src: 'library-pack-select.webp', width: 1455, height: 1063, markers: [2, 1, 3],
            alt: '导出向导选择内容页的已选素材、依赖筛选和下一步按钮',
            caption: '核对需要带走的素材后，继续填写包信息。',
          },
        },
      ],
    },
    {
      title: '填写信息并保存 .plantpack',
      steps: [
        {
          title: '填写名称、版本与来源',
          actions: ['填写「资源包名称」和「版本」，例如 1.0.0。', '补上「作者 / 出处」和「授权说明」，按需填写标签、说明或选择封面，再点「检查与打包」。'],
          figure: {
            src: 'library-pack-metadata.webp', width: 1455, height: 1063, markers: [1, 2, 3, 4, 5],
            alt: '资源包名称、版本、作者、授权说明与打包按钮',
            caption: '名称与版本必填，作者和授权会随资源包保留。',
          },
        },
        {
          title: '确认检查结果并导出',
          actions: ['等向导显示「检查通过」。核对使用内容、固定依赖及文件体积。', '点右下「选择位置并导出」，在系统窗口选保存位置。'],
          figure: {
            src: 'library-pack-ready.webp', width: 1455, height: 1063,
            alt: '资源包检查通过、使用内容及选择位置并导出按钮',
            caption: '检查通过后，可以把已准备好的包保存到指定位置。',
          },
          check: '目标目录得到 .plantpack 文件。向导也会提供「打开所在文件夹」。',
        },
      ],
    },
    {
      title: '安装并按需取用',
      steps: [
        {
          title: '选择收到的 .plantpack 文件',
          actions: ['点顶栏或「资源中心」右上的「导入资源包」。', '在文件选择窗口打开收到的 .plantpack，等待软件检查内容和版本。'],
          figure: {
            src: 'library-pack-source.webp', width: 1600, height: 1009, markers: [6],
            alt: '资源中心右上角的导入资源包按钮',
            caption: '圈 1 是资源包文件的导入入口。',
          },
        },
        {
          title: '安装到本机内容库',
          actions: [
            '确认「完整性检查通过」后，查看使用内容、依赖和最低版本。',
            '点「安装到本机内容库」。如果按钮显示「查看已安装资源包」，软件会复用相同版本。出现同版本内容冲突时，可按提示选择「作为独立副本安装」。',
          ],
          figure: {
            src: 'library-pack-import.webp', width: 1455, height: 1063,
            alt: '导入检查通过后的内容清单与安装到本机内容库按钮',
            caption: '核对内容后点右下安装。',
          },
        },
        {
          title: '从资源包中取用素材',
          actions: [
            '安装后在资源中心左侧找到对应的包，点包名查看内容。之后也可从「资源包」列表重新进入。',
            '选一张素材卡片，在右侧点击对应操作。例如叶花果选「到叶花果工作台」，单元枝选「加入单元枝装配」，整株样板选「以此新建工程」。',
          ],
          figure: {
            src: 'library-pack-installed.webp', width: 1600, height: 1009,
            alt: '资源中心显示已安装的示例资源包及其中的叶花果',
            caption: '装好后选包内素材，再点右侧取用按钮。',
          },
          check: '资源包安装在本机内容库。你取用选中的素材后，它才会进入对应工作台或工程。',
        },
      ],
    },
  ],
};

export const libraryArticles = [projectLibrary, resourcePacks];
