// Category identity describes existing authoring workflows; these are not asset previews.
const categories={
  trunk:{art:'category-plant-v1.png',description:'把雕刻或 AI 树干整理为可装配的植物结构，保留原始网格与材质。',tags:['原模与 UV','米制校准','控制骨架'],hint:'导入 GLB，校准后保存到项目或内容库'},
  plant:{art:'category-plant-v1.png',description:'从完整树形开始，建立可继续调整的植物作品。',tags:['整体轮廓','完整装配','作为副本创作'],hint:'保存当前整株的已确认造型'},
  prefab:{art:'category-prefab-v1.png',description:'保留整枝造型与完整单元枝，拖放拼装新的树形。',tags:['组合骨架','携带单元枝','拖放挂接'],hint:'先选中整枝，再保存造型'},
  branch:{art:'category-branch-v1.png',description:'木枝、叶花果与材质组成一个完整模型件。',tags:['完整模型','版本复用','实例装配'],hint:'内部造型在枝条工作台制作'},
  units:{art:'category-units-v1.png',description:'逐个检视真实叶片、花朵与果实，制作植物细节。',tags:['校准尺寸','模型与 UV','共享材质贴图'],hint:'在工作台制作并保存套装'},
  material:{art:'category-material-v1.png',description:'整理树皮材质与形体配方，复用统一的表面风格。',tags:['树皮材质','形体配方','跨工程复用'],hint:'进入树干材质工作台制作'},
  package:{art:'resource-organize-v1.png',description:'把植物、枝干与完整依赖整理成可分享的离线资源包。',tags:['完整依赖','版本与来源','按需取用'],hint:''},
  all:{art:'resource-organize-v1.png',description:'浏览植物造型与制作素材，找到下一次创作的起点。',tags:['跨工程复用','分类与收藏','离线资源包'],hint:'制作可复用的完整单元枝'}
};
export function resourceCategoryDesign(type,scope,packageList=false){
  const key=packageList?'package':Object.hasOwn(categories,type)?type:'all',design=categories[key];
  return {...design,key,art:'/brand/'+design.art,...(key==='all'&&scope==='project'?{description:'当前作品使用的素材随工程保留，整理后可再次复用。',tags:['随工程保存','取用固定版本','整理为资源包']}:{} )};
}
const entries={
  trunk:{label:'树干整理工作台',kicker:'导入雕刻 / AI 模型',icon:'resource-trunk',kind:'workbench'},
  plant:{label:'保存为整株样板',kicker:'保存当前造型',icon:'save',kind:'capture'},
  prefab:{label:'保存选中整枝',kicker:'保存当前选区',icon:'save',kind:'capture'},
  branch:{label:'新建单元枝',kicker:'制作新素材',icon:'plus',kind:'create'},
  units:{label:'叶花果工作台',kicker:'进入工作台',icon:'square-pen',kind:'workbench'},
  material:{label:'树干材质工作台',kicker:'进入工作台',icon:'paintbrush',kind:'workbench'}
};
export function resourceCategoryEntry(type,disabled=false){
  const entry=Object.hasOwn(entries,type)?entries[type]:entries.branch;
  return {...entry,kicker:disabled&&type==='prefab'?'需先选中整枝':entry.kicker};
}
