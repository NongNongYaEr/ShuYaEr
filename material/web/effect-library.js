import {LOCAL_ENDGRAIN_RECIPES} from './local-endgrain-catalog.js';
import {DEFAULT_STYLE_A_SHA256,DEFAULT_STYLE_A_THUMBNAIL} from './default-material-style-a.js';
import{decalAppearance,decalPlacement,decalColorMode}from'./surface-decal-styles.js';
import{defaultBlend}from'./material-blend.js';
import {WEATHERING_LAYERS} from './tree-weathering.js';
import {formDependencies,isFormEffect} from './form-effects.js';
import {SCULPT_OVERLAY_RECIPES,SCULPT_COMBINATIONS} from './sculpt-effect-catalog.js';
import {distributionDefaults,validateDistributionParams,distributionNeedsGeometry,DISTRIBUTION_KEYS} from './distribution-modes.js';
import {SURFACE_VERSION,EFFECT_TYPES,addEffect,createRule,appendPaintRule,effectChannels,effectLayerKind} from './surface-effects.js';
import {cloneLayerResources,insertLayer,layerIndex,layerLeafIds,pruneSurfaceResources,validateLayerTree} from './surface-layers.js';
import {packSurfaceRecipe,importSurfaceRecipe,validateSurfaceRecipe} from './surface-recipe.js';
export const EFFECT_CATEGORIES={all:'全部',attachment:'自然附着',weathering:'污染老化',paint:'人工覆盖',detail:'表面细节',damage:'伤痕与结构',bio:'苔藓与地衣',deposit:'沉积与污渍',coating:'涂层与残留',adjustment:'材质调整',form:'形体修饰',combo:'组合效果',mine:'我的效果'};
const rule=(type,params={},extra={})=>({type,params,...extra});
const noise=(threshold=.45,sizeMeters=.3,combine='intersect')=>rule('noise',{sizeMeters,threshold,softness:.12,seed:3},{combine});
const height=maxFraction=>({type:'height',maxFraction});
const coat=(type,name,params={},rules=[],extra={})=>({type,name,params:type==='burl'&&params.burlStyle?{...decalAppearance(params.burlStyle),...decalPlacement(params.burlStyle),...params}:params,rules,...extra});
const moss=()=>coat('moss','根部厚苔',{mossNormalStrength:1.6,mossThicknessMm:6},[rule('ao',{threshold:.25,softness:.15}),noise(.4,.2),rule('paint')],{scopeFraction:.25});
const oldPaint=()=>coat('paint','斑驳白漆',{paintWear:.3},[height(.16),noise(.4,.35,'subtract'),rule('paint')]);
const rain=()=>coat('stain','纵向雨痕',{},[rule('streaks'),noise(.35,.5)]);
const stableWeathering=WEATHERING_LAYERS.map(e=>({...e,rules:e.rules.map(r=>({...r,type:'treeauto',params:{role:r.params.role}}))}));
const entries=[
 ['featured-plane-aged','法桐·老干过渡','combo','与法桐基础材质配合：低位薄层老皮、颗粒粗糙与柔和色差；高度范围和柔边可独立调节。',[
  coat('cork','低位老皮',{surfaceColor:'#82725b',surfaceRoughness:.92,surfaceNormalStrength:1.1,surfaceHeightMm:.65,surfaceGrainCm:.8,surfaceVariation:.55,surfaceAO:.15,surfaceBarkKeep:1,surfaceAmount:.55},[rule('height',{featherMeters:1.2},{maxFraction:.28}),noise(.3,.32)],{scopeFraction:.4}),
  coat('stain','老皮色差',{surfaceColor:'#7f715c',surfaceRoughness:.9,surfaceAmount:.32,surfaceVariation:.5},[rule('height',{featherMeters:1.5},{maxFraction:.35}),noise(.28,.5)])
 ]],
 ['tree-weathering','老树风化组合','form','稳定曲率与表面接触AO识别位置；覆盖密度、识别宽度与斑块尺寸独立，六层叠加沉积、风化、薄附着、湿痕与厚苔。',stableWeathering],
 ['form-groove','沟槽沉积','form','自动识别凹槽，叠加沉积色差、粗糙度及细小起伏。',[coat('groove','沟槽沉积')]],
 ['form-ridge','凸脊风化','form','自动沿外露凸脊形成柔和断续的漂浅变化。',[coat('ridge','凸脊风化')]],
 ['form-contact','接触深化','form','结合源模型AO与凹曲率，仅增强接触遮蔽。',[coat('contact','接触深化')]],
 ['form-rootwet','根部潮湿','form','低位、凹槽与遮蔽共同控制局部湿润。',[coat('rootwet','根部潮湿')]],
 ['form-old-tree','自然老树','form','接触深化、沟槽沉积与凸脊风化，自动适配模型的独立图层组。',[coat('contact','接触深化'),coat('groove','沟槽沉积',{surfaceAmount:.7}),coat('ridge','凸脊风化',{surfaceAmount:.6})]],
 ['moss-scattered','薄散苔藓','attachment','疏散小片附着，保留较多树皮。',[coat('moss','薄散苔藓',{mossThicknessMm:1.8,mossNormalStrength:.8},[noise(.58,.2,'replace')])]],
 ['moss-root','根部厚苔','attachment','根部限制、几何AO、斑驳与本层手绘。',[moss()]],
 ['moss-dry','干燥苔斑','attachment','偏黄的干苔与较粗糙叶簇。',[coat('moss','干燥苔斑',{mossColor:'#767333',mossRough:.98,mossThicknessMm:2},[noise(.62,.18,'replace')])]],
 ['algae-film','薄藻膜','attachment','薄层绿色附着，保留树皮凹凸。',[coat('algae','薄藻膜',{},[noise(.42,.32,'replace')])]],
 ['algae-waterline','潮湿水线藻膜','attachment','底部水线与条状薄藻。',[coat('algae','潮湿水线藻膜',{surfaceRoughness:.55},[height(.28),rule('streaks',{widthMeters:.08,lengthMeters:.6,threshold:.3,softness:.15,seed:11},{combine:'intersect'})])]],
 ['lichen-scattered','零散地衣','attachment','灰绿色地衣斑点。',[coat('lichen','零散地衣',{},[noise(.58,.12,'replace')])]],
 ['lichen-gray','灰白地衣','attachment','更干燥、偏灰白的地衣颗粒。',[coat('lichen','灰白地衣',{lichenColor:'#b8bcaa',lichenRough:.98,lichenNormal:1.5},[noise(.64,.1,'replace')])]],
 ['dust-up','上表面积尘','weathering','按源几何朝上表面选取，叠加粉尘颗粒。',[coat('dust','上表面积尘',{},[rule('orientation'),noise(.3,.25)])]],
 ['dust-cavity','凹处积灰','weathering','从几何AO凹处生成较厚干灰。',[coat('dust','凹处积灰',{surfaceColor:'#8e806b',surfaceHeightMm:.4},[rule('ao',{threshold:.3,softness:.15}),noise(.35,.16)])]],
 ['mud-root','根部泥污','weathering','低位泥污，颜色与粗糙度一起变化。',[coat('dirt','根部泥污',{dirt:.7,dirtNormal:1.3},[height(.18),noise(.32,.25)])]],
 ['mud-splash','底部飞溅泥点','weathering','高度限制内的小片泥点。',[coat('dirt','底部飞溅泥点',{dirt:.8},[height(.12),noise(.65,.05)])]],
 ['rain-streaks','纵向雨痕','weathering','只调整颜色与粗糙度的连续水流污痕。',[rain()]],
 ['rain-dark','深色流挂','weathering','窄条流挂与深色渗痕。',[coat('stain','深色流挂',{surfaceAmount:.8,surfaceColor:'#403a2c'},[rule('streaks',{widthMeters:.018,lengthMeters:2,threshold:.6,softness:.12,seed:7})])]],
 ['paint-new','新刷白漆','paint','薄白漆跟随树皮结构。',[coat('paint','新刷白漆',{paintWear:.03,paintBarkNormal:1},[height(.135)])]],
 ['paint-old','大片斑驳白漆','paint','大片缺失与可补画的旧漆。',[oldPaint()]],
 ['paint-convex','凸处磨损白漆','paint','高度范围、斑驳及模型凸处磨损。',[coat('paint','凸处磨损白漆',{paintWear:.25},[height(.16),noise(.3,.28),rule('curvature',{threshold:.15,softness:.1}),rule('paint')])]],
 ['burl-scatter','自然树瘤散布','detail','按数量在源表面选点，避开狭窄、深凹与空间不足的位置；叠加瘤皮、起伏、法线、粗糙度与AO，不改模型轮廓。',[coat('burl','自然树瘤散布')]],
 ['decal-branch-scar','断枝节疤散布','damage','AI透明贴花：断枝节疤。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','断枝节疤散布',{burlStyle:1,surfaceHeightMm:5,burlCount:2})]],
 ['decal-healed-wound','愈合伤口散布','damage','AI透明贴花：愈合伤口。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','愈合伤口散布',{burlStyle:2,surfaceHeightMm:6,burlCount:2})]],
 ['decal-insect-holes','虫蛀孔群散布','damage','AI透明贴花：虫蛀孔群。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','虫蛀孔群散布',{burlStyle:3,surfaceHeightMm:4,burlCount:2})]],
 ['decal-bark-fissure','纵向裂口散布','damage','AI透明贴花：纵向裂口。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','纵向裂口散布',{burlStyle:4,surfaceHeightMm:8,burlCount:2})]],
 ['decal-peeling-bark','脱皮露木散布','damage','AI透明贴花：脱皮露木。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','脱皮露木散布',{burlStyle:5,surfaceHeightMm:3,burlCount:2})]],
 ['decal-small-knot','细枝瘤眼散布','damage','AI透明贴花：细枝瘤眼。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','细枝瘤眼散布',{burlStyle:6,surfaceHeightMm:3,burlCount:2})]],
 ['decal-double-knot','双瘤连结散布','damage','AI透明贴花：双瘤连结。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','双瘤连结散布',{burlStyle:7,surfaceHeightMm:10,burlCount:2})]],
 ['decal-canker-callus','瘤状愈伤散布','damage','AI透明贴花：瘤状愈伤。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','瘤状愈伤散布',{burlStyle:8,surfaceHeightMm:8,burlCount:2})]],
 ['decal-pruned-cut','修枝旧切面散布','damage','AI透明贴花：修枝旧切面。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','修枝旧切面散布',{burlStyle:9,surfaceHeightMm:4,burlCount:2})]],
 ['decal-split-scar','叉裂旧疤散布','damage','AI透明贴花：叉裂旧疤。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','叉裂旧疤散布',{burlStyle:10,surfaceHeightMm:5,burlCount:2})]],
 ['decal-lightning-scar','雷击长疤散布','damage','AI透明贴花：雷击长疤。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','雷击长疤散布',{burlStyle:11,surfaceHeightMm:9,burlCount:2})]],
 ['decal-spiral-scar','螺旋愈痕散布','damage','AI透明贴花：螺旋愈痕。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','螺旋愈痕散布',{burlStyle:12,surfaceHeightMm:4,burlCount:2})]],
 ['decal-woodpecker-holes','啄木鸟孔散布','damage','AI透明贴花：啄木鸟孔。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','啄木鸟孔散布',{burlStyle:13,surfaceHeightMm:7,burlCount:2})]],
 ['decal-beetle-gallery','虫道蚀纹散布','damage','AI透明贴花：虫道蚀纹。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','虫道蚀纹散布',{burlStyle:14,surfaceHeightMm:3,burlCount:2})]],
 ['decal-termite-tracks','蚁道泥线散布','damage','AI透明贴花：蚁道泥线。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','蚁道泥线散布',{burlStyle:15,surfaceHeightMm:2,burlCount:2})]],
 ['decal-crack-web','网状龟裂散布','damage','AI透明贴花：网状龟裂。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','网状龟裂散布',{burlStyle:16,surfaceHeightMm:4,burlCount:2})]],
 ['decal-cross-split','横向裂伤散布','damage','AI透明贴花：横向裂伤。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','横向裂伤散布',{burlStyle:17,surfaceHeightMm:5,burlCount:2})]],
 ['decal-frost-crack','冻裂竖缝散布','damage','AI透明贴花：冻裂竖缝。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','冻裂竖缝散布',{burlStyle:18,surfaceHeightMm:7,burlCount:2})]],
 ['decal-fire-char','火灼焦皮散布','damage','AI透明贴花：火灼焦皮。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','火灼焦皮散布',{burlStyle:19,surfaceHeightMm:2,burlCount:2})]],
 ['decal-scraped-wood','擦伤露纤散布','damage','AI透明贴花：擦伤露纤。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','擦伤露纤散布',{burlStyle:20,surfaceHeightMm:2,burlCount:2})]],
 ['decal-resin-amber','琥珀树脂散布','damage','AI透明贴花：琥珀树脂。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','琥珀树脂散布',{burlStyle:21,surfaceHeightMm:2,burlCount:2})]],
 ['decal-gum-dark','深褐胶痕散布','damage','AI透明贴花：深褐胶痕。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','深褐胶痕散布',{burlStyle:22,surfaceHeightMm:1,burlCount:2})]],
 ['decal-bark-blisters','树皮泡瘤散布','damage','AI透明贴花：树皮泡瘤。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','树皮泡瘤散布',{burlStyle:23,surfaceHeightMm:7,burlCount:2})]],
 ['decal-bark-scales','翘起鳞皮散布','damage','AI透明贴花：翘起鳞皮。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','翘起鳞皮散布',{burlStyle:24,surfaceHeightMm:3,burlCount:2})]],
 ['decal-moss-cushions','垫状厚苔散布','bio','AI透明贴花：垫状厚苔。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','垫状厚苔散布',{burlStyle:25,surfaceHeightMm:6,burlCount:2})]],
 ['decal-moss-feathers','羽状苔簇散布','bio','AI透明贴花：羽状苔簇。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','羽状苔簇散布',{burlStyle:26,surfaceHeightMm:4,burlCount:2})]],
 ['decal-moss-star','星状苔丛散布','bio','AI透明贴花：星状苔丛。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','星状苔丛散布',{burlStyle:27,surfaceHeightMm:4,burlCount:2})]],
 ['decal-moss-drytips','干尖黄苔散布','bio','AI透明贴花：干尖黄苔。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','干尖黄苔散布',{burlStyle:28,surfaceHeightMm:3,burlCount:2})]],
 ['decal-moss-darkwet','湿润深苔散布','bio','AI透明贴花：湿润深苔。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','湿润深苔散布',{burlStyle:29,surfaceHeightMm:5,burlCount:2})]],
 ['decal-moss-brown','枯褐苔斑散布','bio','AI透明贴花：枯褐苔斑。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','枯褐苔斑散布',{burlStyle:30,surfaceHeightMm:2,burlCount:2})]],
 ['decal-lichen-crust','灰白壳衣散布','bio','AI透明贴花：灰白壳衣。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','灰白壳衣散布',{burlStyle:31,surfaceHeightMm:1,burlCount:2})]],
 ['decal-lichen-orange','橙黄地衣散布','bio','AI透明贴花：橙黄地衣。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','橙黄地衣散布',{burlStyle:32,surfaceHeightMm:1,burlCount:2})]],
 ['decal-lichen-leafy','叶状地衣散布','bio','AI透明贴花：叶状地衣。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','叶状地衣散布',{burlStyle:33,surfaceHeightMm:2,burlCount:2})]],
 ['decal-lichen-black','黑斑地衣散布','bio','AI透明贴花：黑斑地衣。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','黑斑地衣散布',{burlStyle:34,surfaceHeightMm:1,burlCount:2})]],
 ['decal-lichen-lime','青柠颗粒衣散布','bio','AI透明贴花：青柠颗粒衣。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','青柠颗粒衣散布',{burlStyle:35,surfaceHeightMm:1,burlCount:2})]],
 ['decal-lichen-cups','杯状地衣散布','bio','AI透明贴花：杯状地衣。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','杯状地衣散布',{burlStyle:36,surfaceHeightMm:4,burlCount:2})]],
 ['decal-algae-green','绿色薄藻膜散布','bio','AI透明贴花：绿色薄藻膜。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','绿色薄藻膜散布',{burlStyle:37,surfaceHeightMm:0.5,burlCount:2})]],
 ['decal-algae-red','锈红藻斑散布','bio','AI透明贴花：锈红藻斑。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','锈红藻斑散布',{burlStyle:38,surfaceHeightMm:0.5,burlCount:2})]],
 ['decal-fungus-white','白色菌丝散布','bio','AI透明贴花：白色菌丝。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','白色菌丝散布',{burlStyle:39,surfaceHeightMm:1,burlCount:2})]],
 ['decal-fungus-specks','黑色菌点散布','bio','AI透明贴花：黑色菌点。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','黑色菌点散布',{burlStyle:40,surfaceHeightMm:1,burlCount:2})]],
 ['decal-mud-splash','泥点飞溅散布','deposit','AI透明贴花：泥点飞溅。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','泥点飞溅散布',{burlStyle:41,surfaceHeightMm:1,burlCount:2})]],
 ['decal-mud-dried','干泥龟裂散布','deposit','AI透明贴花：干泥龟裂。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','干泥龟裂散布',{burlStyle:42,surfaceHeightMm:2,burlCount:2})]],
 ['decal-silt-grooves','细砂沉积散布','deposit','AI透明贴花：细砂沉积。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','细砂沉积散布',{burlStyle:43,surfaceHeightMm:1,burlCount:2})]],
 ['decal-dust-powder','灰尘粉层散布','deposit','AI透明贴花：灰尘粉层。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','灰尘粉层散布',{burlStyle:44,surfaceHeightMm:0.3,burlCount:2})]],
 ['decal-ash-flakes','灰烬碎屑散布','deposit','AI透明贴花：灰烬碎屑。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','灰烬碎屑散布',{burlStyle:45,surfaceHeightMm:1,burlCount:2})]],
 ['decal-mineral-white','白色矿痕散布','deposit','AI透明贴花：白色矿痕。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','白色矿痕散布',{burlStyle:46,surfaceHeightMm:0.5,burlCount:2})]],
 ['decal-water-streak','水渍流挂散布','deposit','AI透明贴花：水渍流挂。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','水渍流挂散布',{burlStyle:47,surfaceHeightMm:0.2,burlCount:2})]],
 ['decal-salt-crystals','盐霜晶粒散布','deposit','AI透明贴花：盐霜晶粒。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','盐霜晶粒散布',{burlStyle:48,surfaceHeightMm:1,burlCount:2})]],
 ['decal-soil-root','根部土壳散布','deposit','AI透明贴花：根部土壳。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','根部土壳散布',{burlStyle:49,surfaceHeightMm:2,burlCount:2})]],
 ['decal-bird-dropping','鸟粪旧痕散布','deposit','AI透明贴花：鸟粪旧痕。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','鸟粪旧痕散布',{burlStyle:50,surfaceHeightMm:0.5,burlCount:2})]],
 ['decal-lime-fresh','新刷石灰散布','coating','AI透明贴花：新刷石灰。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','新刷石灰散布',{burlStyle:51,surfaceHeightMm:0.5,burlCount:2})]],
 ['decal-lime-chipped','石灰剥落散布','coating','AI透明贴花：石灰剥落。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','石灰剥落散布',{burlStyle:52,surfaceHeightMm:0.8,burlCount:2})]],
 ['decal-lime-runoff','石灰流痕散布','coating','AI透明贴花：石灰流痕。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','石灰流痕散布',{burlStyle:53,surfaceHeightMm:0.4,burlCount:2})]],
 ['decal-paint-blue','蓝色标记散布','coating','AI透明贴花：蓝色标记。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','蓝色标记散布',{burlStyle:54,surfaceHeightMm:0.4,burlCount:2})]],
 ['decal-paint-red','红色旧漆散布','coating','AI透明贴花：红色旧漆。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','红色旧漆散布',{burlStyle:55,surfaceHeightMm:0.4,burlCount:2})]],
 ['decal-paint-yellow','黄色旧漆散布','coating','AI透明贴花：黄色旧漆。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','黄色旧漆散布',{burlStyle:56,surfaceHeightMm:0.4,burlCount:2})]],
 ['decal-tar-seal','黑色封护散布','coating','AI透明贴花：黑色封护。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','黑色封护散布',{burlStyle:57,surfaceHeightMm:1,burlCount:2})]],
 ['decal-wax-pale','浅蜡封护散布','coating','AI透明贴花：浅蜡封护。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','浅蜡封护散布',{burlStyle:58,surfaceHeightMm:1,burlCount:2})]],
 ['decal-chalk-mark','粉笔擦痕散布','coating','AI透明贴花：粉笔擦痕。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','粉笔擦痕散布',{burlStyle:59,surfaceHeightMm:0.2,burlCount:2})]],
 ['decal-old-label','旧胶残痕散布','coating','AI透明贴花：旧胶残痕。按数量与源表面选点，多通道叠加；仅贴图起伏，不改变轮廓。',[coat('burl','旧胶残痕散布',{burlStyle:60,surfaceHeightMm:0.4,burlCount:2})]],
 ['cork-repair','手绘疤皮修补','detail','先绘制位置，再叠加粗糙疤皮。仅表面效果。',[coat('cork','疤皮修补',{},[rule('paint')],{initial:0})]],
 ['cork-old','零散旧疤斑','detail','零散粗皮斑，具有自身起伏和微AO。',[coat('cork','零散旧疤斑',{surfaceHeightMm:1.2,surfaceColor:'#655343'},[noise(.72,.12,'replace')])]],
 ['bleach-sun','迎光日晒褪色','adjustment','根据X正方向的源表面朝向漂浅。方向可修改。',[coat('bleach','迎光日晒褪色',{},[rule('orientation',{}, {polarity:'positiveX'}),noise(.25,.8)])]],
 ['bleach-soft','整体轻度褪色','adjustment','保留凹凸的整体低强度干燥褪色。',[coat('bleach','整体轻度褪色',{surfaceAmount:.25},[])]],
 ['wet-root','根部湿润','adjustment','底部加深、降低粗糙度，不改变法线。',[coat('wet','根部湿润',{wet:.55,wetRough:.25},[height(.25),noise(.25,.45)])]],
 ['tone-variation','树皮自然色差','adjustment','只增加材质色差。',[coat('aging','树皮自然色差',{variation:.35},[])]],
 ['combo-damp','潮湿根基','combo','泥污、根部厚苔、湿润组成可展开图层组。',[coat('dirt','根部泥污',{dirt:.65},[height(.18)]),moss(),coat('wet','湿润调整',{wet:.4},[height(.25)])]],
 ['combo-paint','旧漆与雨痕','combo','旧漆与雨痕分开调节，组合保存。',[oldPaint(),rain()]],
 ['combo-aged','自然老化组合','combo','褪色、零散地衣和轻雨痕。',[coat('bleach','轻度褪色',{surfaceAmount:.2},[]),coat('lichen','零散地衣',{},[noise(.68,.1,'replace')]),coat('stain','浅雨痕',{surfaceAmount:.25},[rule('streaks')])]]
];
export const EFFECT_LIBRARY_BUILTINS=[...LOCAL_ENDGRAIN_RECIPES.map(e=>({...e,id:'builtin-'+e.id})),...entries.map(([id,name,category,description,layers])=>({id:'builtin-'+id,name,category,description,layers})),...[...SCULPT_OVERLAY_RECIPES,...SCULPT_COMBINATIONS].map(r=>({...r,id:'builtin-'+r.id}))].map(e=>({...e,kind:e.layers.length>1?'combo':'builtin',primaryType:e.layers.at(-1).type,types:[...new Set(e.layers.map(l=>l.type))],dependencies:libraryEntryDependencies(e),manual:e.layers.some(l=>l.initial===0),effectCount:e.layers.length}));
export function libraryMetadata(entry){const e=entry.layers?.at(-1),type=entry.primaryType||e?.type;return{...entry,isGroup:entry.effectCount>1||!!entry.surfaceRecipe?.surface.layers.some(n=>n.kind==='group'),layers:undefined,surfaceRecipe:undefined,channels:effectChannels(type),layerKind:effectLayerKind(type),thumbnailReady:entry.collection==='sculpt'||entry.sha256===DEFAULT_STYLE_A_SHA256,thumbnail:entry.collection==='sculpt'?'/assets/sculpt-effects/previews/'+entry.recipeId.toLowerCase()+'.png':entry.sha256===DEFAULT_STYLE_A_SHA256?DEFAULT_STYLE_A_THUMBNAIL:'/assets/effect-library/'+(type==='burl'&&e?.params.burlStyle?'decal-'+e.params.burlStyle:type)+'.png',swatch:e?.params.surfaceColor||e?.params.mossColor||e?.params.paintColor||EFFECT_TYPES[type]?.fields.surfaceColor?.value||'#7e8665'};}
function builtinSurface(entry,document){
 let s={version:SURFACE_VERSION,active:true,effects:[],masks:[],areas:[],layers:[],analysis:{curvature:{radiusMeters:.1}}};
 for(const spec of entry.layers){const added=addEffect(s,spec.type,{actualHeightMeters:document.actualHeightMeters,sourceSHA256:document.resources.source});s=added.s;const e=s.effects.at(-1),m=s.masks.find(m=>m.id===e.maskRef);e.name=spec.name;Object.assign(e.params,spec.params);if(spec.type==='burl'&&spec.params.burlStyle&&decalColorMode(spec.params.burlStyle)!=='normal'){e.blend=defaultBlend();e.blend.color.mode=decalColorMode(spec.params.burlStyle);}if(spec.channels)e.channels=structuredClone(spec.channels);if(spec.opacity!=null)e.opacity=spec.opacity;m.name=spec.name+'蒙版';m.initial=spec.initial??1;m.items=[];
  for(const input of spec.rules){if(input.type==='paint'){s=appendPaintRule(s,e.id,document.resources.source).s;continue;}const rule=createRule(input.type);Object.assign(rule.params,input.params||{});if(input.type==='height'&&input.maxFraction!=null)rule.params.maxMeters=document.actualHeightMeters*input.maxFraction;if(input.combine)rule.combine=input.combine;if(input.polarity)rule.polarity=input.polarity;s.masks.find(x=>x.id===e.maskRef).items.push(rule);}
  const current=s.effects.find(x=>x.id===e.id);
  if(spec.blend)current.blend=structuredClone(spec.blend);
  if(spec.emission)current.emission=structuredClone(spec.emission);
  if(spec.edgeTreatment)current.edgeTreatment=structuredClone(spec.edgeTreatment);
  if(spec.distribution){const {mode,params:changes}=spec.distribution,params=validateDistributionParams({...distributionDefaults(mode),...changes});const r=createRule('distribution',{params});s.masks.find(x=>x.id===current.maskRef).items.unshift(r);current.distribution={version:1,memory:{[mode]:params}};current.coverageMode='rules';delete current.legacyBinding;}
  if(spec.scopeFraction){const id=crypto.randomUUID();s.areas.push({id,name:spec.name+'限制范围',kind:'height',sourceSHA256:document.resources.source,mode:'all',strokes:[],scope:{kind:'height',min:0,max:spec.scopeFraction,feather:.03},partId:null,ownedBy:e.id,presetOwned:true});current.scopeRef=id;}
 }
 return s;
}
export function instantiateLibraryEntry(document,entry,location={}){
 let template,warnings=[];if(entry.surfaceRecipe){const imported=importSurfaceRecipe(entry.surfaceRecipe,document);template=imported.surface;warnings=imported.warnings;}else template=builtinSurface(entry,document);
 const s=structuredClone(document.surface);if(entry.category==='form'&&!location.parentId&&!location.targetId&&s.layers.length)location={targetId:s.layers[0].id,position:'before'};if(s.effects.length+template.effects.length>16)throw Error('图层预算不足：此效果需要'+template.effects.length+'个叶层，最多16个。');const copy=cloneLayerResources(template,template.layers),nodes=copy.layers;let top;
 if(nodes.length===1){top=nodes[0];if(top.kind==='group')top.name=entry.name;else copy.effects[0].name=entry.name;}else top={id:crypto.randomUUID(),kind:'group',name:entry.name,enabled:true,locked:false,opacity:1,children:nodes};
 if([...s.effects,...copy.effects].filter(e=>e.type==='burl').reduce((n,e)=>n+e.params.burlCount,0)>8)throw Error('表面贴花总数量最多8个（包括隐藏图层）。');s.effects.push(...copy.effects);s.masks.push(...copy.masks);s.areas.push(...copy.areas);insertLayer(s,top,location);pruneSurfaceResources(s);validateLayerTree(s);s.active=true;return{surface:s,id:top.id,warnings};
}
export function saveLayerPreset(document,id,{name}={}){
 const node=layerIndex(document.surface).get(id)?.node;if(!node)throw Error('请选择要保存的图层或组。');const s=structuredClone(document.surface),leaves=new Set(layerLeafIds(s,id));s.layers=[structuredClone(node)];s.effects=s.effects.filter(e=>leaves.has(e.id));pruneSurfaceResources(s);const usedAreas=new Set(s.effects.map(e=>e.scopeRef).filter(Boolean));for(const mask of s.masks)for(const r of mask.items)for(const k of ['areaRef','addRef','eraseRef'])if(r[k])usedAreas.add(r[k]);s.areas=s.areas.filter(a=>usedAreas.has(a.id));if(!s.effects.length)throw Error('空图层组不能保存为效果。');
 for(const e of s.effects)if(e.paint)e.paint.strokes=[];const surfaceRecipe=packSurfaceRecipe({...document,surface:s});return{kind:'tree-effect-preset',version:1,name:name||node.name||s.effects[0].name,description:'自存图层预设',tags:[],surfaceRecipe};
}
export function validateEffectPreset(raw){
 if(raw?.kind!=='tree-effect-preset'||raw.version!==1||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>100||typeof raw.description!=='string'||raw.description.length>500||!Array.isArray(raw.tags)||raw.tags.length>12||raw.tags.some(s=>typeof s!=='string'||s.length>32))throw Error('效果库条目格式无效。');
 const surfaceRecipe=validateSurfaceRecipe(raw.surfaceRecipe);if(!surfaceRecipe.surface.effects.length)throw Error('效果必须包含至少一个材质或调整图层。');return{kind:raw.kind,version:1,name:raw.name.trim(),description:raw.description,tags:[...raw.tags],surfaceRecipe};
}

// Analysis preparation is independent of layer insertion. Failed/cancelled preparation inserts nothing.
export function libraryEntryDependencies(entry){
 const effects=entry.surfaceRecipe?.surface.effects||entry.layers||[],masks=entry.surfaceRecipe?.surface.masks||[];
 return [...new Set(effects.flatMap(e=>[...(!entry.manualPlacement&&!e.manualDecal?formDependencies(e.type):[]),...(e.distribution?.mode&&distributionNeedsGeometry({mode:DISTRIBUTION_KEYS.indexOf(e.distribution.mode)})?['stable']:[]),...(e.rules||masks.find(m=>m.id===e.maskRef)?.items||[]).filter(r=>r.enabled!==false&&['ao','curvature','treeweather','treeauto','distribution'].includes(r.type)).flatMap(r=>r.type==='distribution'?(distributionNeedsGeometry(r.params)?['stable']:[]):[r.type==='treeweather'?'weathering':r.type==='treeauto'?'stable':r.type])]))];
}
export async function prepareLibraryEntry(entry,{document:getDocument,state,prepare,progress=()=>{}}){
 const doc=getDocument();if(!doc)throw Error('请先导入模型。');const identity=JSON.stringify([doc.id,doc.resources.source,doc.actualHeightMeters]);
 const needsVerifiedAO=(entry.surfaceRecipe?.surface.effects||entry.layers||[]).some(e=>e.type==='burl');const ready=type=>type==='ao'&&needsVerifiedAO?state().aoVerified:state()[type];
 for(const type of libraryEntryDependencies(entry)){
  if(!ready(type)){progress('正在为“'+entry.name+'”准备'+(type==='ao'?'模型 AO':'形体分析')+'…');await prepare(type,{strict:true});}
  const now=getDocument();if(!now||JSON.stringify([now.id,now.resources.source,now.actualHeightMeters])!==identity)throw Error('模型已切换，本次效果未添加。');
  if(!ready(type))throw Error((type==='ao'?'模型 AO':'模型曲率')+'尚未准备完成，本次效果未添加，可重试。');
 }
}
