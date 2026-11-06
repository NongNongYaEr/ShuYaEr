// Authored recipes reuse the existing PBR compositors and source atlases.
// They are not sixty different rendering algorithms or geometric attachments.
import {SURFACE_DECAL_STYLES,decalAppearance,decalPlacement,decalColorMode} from './surface-decal-styles.js';
import {defaultBlend} from './material-blend.js';
export const SCULPT_EFFECT_FAMILIES={O01:'形体风化',O02:'湿度与流痕',O03:'苔藓',O04:'地衣与藻膜',O05:'腐朽与干枯',O06:'瘤结与伤口',O07:'虫孔与虫道',O08:'泥沙与矿物',O09:'人工覆盖',O10:'剧情与特殊环境'};
const dist=(mode,params={})=>({mode,params:{density:.72,patchCm:25,breakup:.35,edge:.14,...params}});
const blend=(mode='normal',strength=1)=>{const b=defaultBlend();b.color={mode,strength};return b;};
const coat=(type,name,params,distribution,extra={})=>({type,name,params,distribution,rules:[],...extra});
function decal(name,id,params={}){const style=SURFACE_DECAL_STYLES.findIndex(s=>s.id===id);if(style<0)throw Error('Missing decal '+id);const b=blend(decalColorMode(style));return coat('burl',name,{...decalAppearance(style),...decalPlacement(style),burlStyle:style,burlCount:2,...params},null,{blend:b});}
const form=(type,name,mode,color,params={},dp={})=>coat(type,name,{surfaceColor:color,surfaceAmount:.65,surfaceRoughness:.88,surfaceHeightMm:.12,surfaceNormalStrength:1.2,surfaceBarkKeep:1,...params},dist(mode,dp),{blend:blend(type==='groove'?'multiply':type==='ridge'?'softlight':'normal',.75)});
const rows=[
 ['O01',1,'凸脊灰化',form('ridge','凸脊灰化','ridge','#c9c3af',{surfaceAmount:.7},{density:.9})],
 ['O01',2,'凹槽深化',form('groove','凹槽深化','groove','#40392f',{surfaceAO:.28},{density:.92})],
 ['O01',3,'接触擦亮',form('ridge','接触擦亮','contact','#b4a285',{surfaceRoughness:.42,surfaceAmount:.5},{density:.86,recognitionCm:10})],
 ['O01',4,'根部老皮',coat('cork','根部老皮',{surfaceColor:'#574a38',surfaceRoughness:.96,surfaceNormalStrength:1.5,surfaceHeightMm:1.2,surfaceGrainCm:1.3,surfaceVariation:.6,surfaceAO:.25,surfaceBarkKeep:1,surfaceAmount:.7},dist('root',{rootHeightMeters:2.4,density:.85,patchCm:40}))],
 ['O01',5,'边缘露纤',form('ridge','边缘露纤','boundary','#baab8d',{surfaceHeightMm:.2},{boundaryCm:8,density:.93})],
 ['O01',6,'分叉粗皮',coat('cork','分叉粗皮',{surfaceColor:'#6d5d45',surfaceRoughness:.94,surfaceNormalStrength:1.7,surfaceHeightMm:1.5,surfaceGrainCm:1.8,surfaceBarkKeep:1,surfaceAmount:.7},dist('contact',{recognitionCm:24,density:.92}))],
 ['O02',1,'沟槽湿痕',coat('wet','沟槽湿痕',{wet:.65,wetDarken:.42,wetRough:.27},dist('groove',{density:.88,edge:.2}))],
 ['O02',2,'根部渐湿',coat('wet','根部渐湿',{wet:.7,wetDarken:.36,wetRough:.32},dist('root',{rootHeightMeters:1.8,density:.95,edge:.22}))],
 ['O02',3,'纵向雨痕',coat('stain','纵向雨痕',{surfaceColor:'#534b38',surfaceAmount:.6,surfaceRoughness:.67},dist('flow',{density:.88,flowContrast:1.5,patchCm:55}),{blend:blend('multiply',.65)})],
 ['O02',4,'冲刷浅道',coat('bleach','冲刷浅道',{surfaceColor:'#c4b99f',surfaceAmount:.5,surfaceRoughness:.64,surfaceSaturation:.45},dist('flow',{density:.76,flowContrast:2.2}),{blend:blend('screen',.32)})],
 ['O02',5,'水线沉积',coat('dirt','水线沉积',{dirt:.7,dirtColor:'#76684d',dirtRough:.94,dirtNormal:1.25},dist('root',{rootHeightMeters:.65,density:.86,patchCm:12,cavityPreference:.3}))],
 ['O02',6,'下缘挂痕',coat('stain','下缘挂痕',{surfaceColor:'#5f5641',surfaceAmount:.6,surfaceRoughness:.72},dist('flow',{direction:1,density:.77,flowContrast:1.8}),{blend:blend('multiply',.7)})],
 ['O03',1,'薄散小苔',coat('moss','薄散小苔',{mossColor:'#657232',mossThicknessMm:1.4,mossNormalStrength:1.15,mossClumpCm:2,mossRough:.95},dist('scattered',{density:.38,patchCm:16,breakup:.7}))],
 ['O03',2,'根部团苔',coat('moss','根部团苔',{mossColor:'#52652c',mossThicknessMm:7,mossNormalStrength:1.7,mossClumpCm:5,mossAO:.75},dist('root',{density:.87,rootHeightMeters:2.2,patchCm:32}))],
 ['O03',3,'沟缝条苔',coat('moss','沟缝条苔',{mossColor:'#556d29',mossThicknessMm:4,mossNormalStrength:1.5,mossClumpCm:3},dist('groove',{density:.9,recognitionCm:12,patchCm:20}))],
 ['O03',4,'垫状厚苔',decal('垫状厚苔','moss-cushions',{surfaceHeightMm:8})],
 ['O03',5,'羽状苔簇',decal('羽状苔簇','moss-feathers',{surfaceHeightMm:5})],
 ['O03',6,'干尖枯苔',decal('干尖枯苔','moss-drytips',{surfaceHeightMm:3})],
 ['O04',1,'灰白壳衣',decal('灰白壳衣','lichen-crust')],
 ['O04',2,'橙黄地衣',decal('橙黄地衣','lichen-orange')],
 ['O04',3,'浅绿颗粒衣',coat('lichen','浅绿颗粒衣',{lichenColor:'#a3ad75',lichenRough:.98,lichenNormal:1.5,lichen:.65},dist('scattered',{density:.45,patchCm:10,breakup:.7}))],
 ['O04',4,'叶状地衣',decal('叶状地衣','lichen-leafy')],
 ['O04',5,'绿色薄藻',coat('algae','绿色薄藻',{surfaceColor:'#4b623d',surfaceRoughness:.64,surfaceNormalStrength:.45,surfaceHeightMm:.05,surfaceBarkKeep:1,surfaceAmount:.6},dist('orientation',{direction:5,angle:100,density:.62}),{blend:blend('color',.7)})],
 ['O04',6,'锈红藻斑',decal('锈红藻斑','algae-red')],
 ['O05',1,'银灰风化',coat('bleach','银灰风化',{surfaceColor:'#b8b6aa',surfaceAmount:.65,surfaceRoughness:.97,surfaceSaturation:.25},dist('ridge',{density:.95}),{blend:blend('softlight',.65)})],
 ['O05',2,'软腐细孔',decal('软腐细孔','insect-holes',{surfaceColor:'#554638',surfaceHeightMm:3,burlMinSizeCm:18,burlMaxSizeCm:45})],
 ['O05',3,'病斑朽边',decal('病斑朽边','canker-callus',{surfaceHeightMm:5,surfaceColor:'#59432e'})],
 ['O05',4,'焦灼表皮',decal('焦灼表皮','fire-char',{surfaceHeightMm:2,surfaceRoughness:.98})],
 ['O05',5,'灰烬残层',decal('灰烬残层','ash-flakes')],
 ['O05',6,'老化干裂',decal('老化干裂','crack-web',{surfaceHeightMm:3})],
 ['O06',1,'自然树瘤',decal('自然树瘤','burl',{surfaceHeightMm:16})],
 ['O06',2,'旧修枝口',decal('旧修枝口','pruned-cut',{burlPreference:2})],
 ['O06',3,'愈合伤疤',decal('愈合伤疤','healed-wound')],
 ['O06',4,'折断露木',decal('折断露木','branch-scar',{burlPreference:2})],
 ['O06',5,'雷击长疤',decal('雷击长疤','lightning-scar',{burlMinSizeCm:45,burlMaxSizeCm:95})],
 ['O06',6,'摩擦脱皮',decal('摩擦脱皮','scraped-wood')],
 ['O07',1,'小孔群',decal('小孔群','insect-holes',{burlMinSizeCm:8,burlMaxSizeCm:18})],
 ['O07',2,'曲折虫道',decal('曲折虫道','beetle-gallery')],
 ['O07',3,'蚁道泥线',decal('蚁道泥线','termite-tracks')],
 ['O07',4,'孔边胶痕',decal('孔边胶痕','gum-dark',{burlMinSizeCm:6,burlMaxSizeCm:14})],
 ['O07',5,'啄木鸟孔',decal('啄木鸟孔','woodpecker-holes')],
 ['O07',6,'成片蛀蚀',decal('成片蛀蚀','insect-holes',{burlMinSizeCm:28,burlMaxSizeCm:65,surfaceHeightMm:6})],
 ['O08',1,'干尘薄层',coat('dust','干尘薄层',{surfaceColor:'#aa9a7d',surfaceHeightMm:.12,surfaceRoughness:.97,surfaceNormalStrength:.8,surfaceBarkKeep:1,surfaceAmount:.55},dist('orientation',{direction:0,angle:70,density:.85}))],
 ['O08',2,'根部泥壳',coat('dirt','根部泥壳',{dirtColor:'#665038',dirt:.85,dirtRough:.97,dirtNormal:1.6},dist('root',{rootHeightMeters:.9,density:.9,patchCm:22}))],
 ['O08',3,'溅射泥点',decal('溅射泥点','mud-splash',{burlMaxHeightMeters:1.2})],
 ['O08',4,'细砂积缝',coat('dust','细砂积缝',{surfaceColor:'#9b8560',surfaceRoughness:.98,surfaceNormalStrength:1.4,surfaceHeightMm:.5,surfaceGrainCm:.2,surfaceBarkKeep:.75,surfaceAmount:.8},dist('groove',{density:.9,recognitionCm:9}))],
 ['O08',5,'白色矿痕',decal('白色矿痕','mineral-white')],
 ['O08',6,'盐霜颗粒',decal('盐霜颗粒','salt-crystals')],
 ['O09',1,'新刷白漆',coat('paint','新刷白漆',{paintColor:'#e4e2d6',paintWear:.03,paintBarkNormal:1,paintRough:.86},dist('root',{rootHeightMeters:1.25,density:1,cavityPreference:0}))],
 ['O09',2,'大块脱漆',coat('paint','大块脱漆',{paintColor:'#d9d8cb',paintWear:.6,paintBarkNormal:1,paintRough:.94},dist('root',{rootHeightMeters:1.35,density:.55,patchCm:32,breakup:.5,edge:.14}))],
 ['O09',3,'石灰流挂',decal('石灰流挂','lime-runoff')],
 ['O09',4,'旧色标记',decal('旧色标记','paint-red',{surfaceAmount:.7})],
 ['O09',5,'黑色封护',decal('黑色封护','tar-seal')],
 ['O09',6,'胶纸残痕',decal('胶纸残痕','old-label')],
 ['O10',1,'新鲜树脂',decal('新鲜树脂','resin-amber',{surfaceRoughness:.17,surfaceHeightMm:3})],
 ['O10',2,'老化胶块',decal('老化胶块','gum-dark',{surfaceRoughness:.4,surfaceHeightMm:4})],
 ['O10',3,'上向薄雪',coat('dust','上向薄雪',{surfaceColor:'#e8edef',surfaceRoughness:.91,surfaceNormalStrength:1.3,surfaceHeightMm:1.1,surfaceGrainCm:.15,surfaceVariation:.4,surfaceAO:.15,surfaceBarkKeep:.2,surfaceAmount:.95},dist('orientation',{direction:0,angle:55,density:.96,edge:.18}),{limitation:'不透明薄雪表层；不产生堆积轮廓。'})],
 ['O10',4,'薄冰湿面',coat('algae','薄冰湿面',{surfaceColor:'#b9ced0',surfaceRoughness:.12,surfaceNormalStrength:.3,surfaceHeightMm:.15,surfaceBarkKeep:.9,surfaceAmount:.32},dist('flow',{density:.85,flowContrast:.8,edge:.22}),{limitation:'当前为不透明结冰湿面；透明折射扩展尚未启用。'})],
 ['O10',6,'魔法裂光',coat('cork','魔法裂光',{surfaceColor:'#233038',surfaceRoughness:.8,surfaceHeightMm:0,surfaceNormalStrength:.5,surfaceBarkKeep:1,surfaceAmount:.75},dist('groove',{density:.9,patchCm:45,edge:.18}),{emission:{version:1,enabled:true,color:'#58deef',strength:2.5,pattern:'bark-cavity',threshold:.4,softness:.035},limitation:'独立发光贴图与 GLB 发光强度；预览不含泛光。'})],
 ['O10',5,'局部腐化',coat('cork','局部腐化',{surfaceColor:'#372739',surfaceRoughness:.83,surfaceNormalStrength:2,surfaceHeightMm:2,surfaceGrainCm:1.2,surfaceVariation:.8,surfaceAO:.35,surfaceBarkKeep:.7,surfaceAmount:.85},dist('groove',{density:.78,patchCm:38,breakup:.55}))]
];
export const SCULPT_OVERLAY_RECIPES=rows.map(([family,index,name,layer])=>({id:`sculpt-overlay-${family.toLowerCase()}-${index}`,name,category:family==='O01'?'form':family==='O06'||family==='O07'?'damage':family==='O09'?'coating':family==='O03'||family==='O04'?'bio':'weathering',description:`${SCULPT_EFFECT_FAMILIES[family]} · ${layer.type==='burl'?'按数量与源表面评分选点，多通道贴花，不改变轮廓。':'按模型表面与物理尺度组织分布，材质和覆盖可分别调整。'}${layer.limitation||''}`,layers:[layer],collection:'sculpt',family,recipeId:`${family}-${index}`,quality:'usable_candidate'}));
export const SCULPT_PENDING_RECIPES=[];
const combos=[
 ['C01','温带雕刻老树','b01-1',['O01-1','O01-2','O04-1','O02-3']],
 ['C02','湿润榕根','b02-1',['O01-2','O02-2','O03-2','O08-4','O04-5']],
 ['C03','干燥榕根','b02-3',['O01-1','O01-4','O04-1']],
 ['C04','扭藤古树','b02-2',['O01-6','O06-3','O03-3']],
 ['C05','巨树英雄树','b01-2',['O01-1','O01-2','O01-6','O06-1']],
 ['C06','密林松树','b04-1',['O08-1','O02-1','O10-1']],
 ['C07','干旱松柏','b04-4',['O08-1','O01-1','O10-2','O06-2']],
 ['C08','城市法桐','b07-1',['O01-4','O08-1','O09-2']],
 ['C09','光皮庭园树','b06-1',['O06-2','O04-3','O01-1']],
 ['C10','纸皮林木','b08-1',['O06-6','O01-2','O01-1']],
 ['C11','银灰枯木','b09-3',['O05-1','O06-4','O01-2']],
 ['C12','腐朽残桩','b10-1',['O05-2','O05-3','O08-2','O08-4']],
 ['C13','烧灼残树','b10-3',['O05-4','O05-5','O08-1']],
 ['C14','河岸漂木','b09-4',['O02-3','O02-5','O08-4','O04-5']],
 ['C15','手绘森林','b12-1',['O01-1','O01-2','O03-1']],
 ['C16','黑暗腐化树','b12-3',['O10-5','O05-3','O01-2','O10-6']],
 ['C17','寒地老树','b04-2',['O10-3','O10-4','O02-1']],
 ['C18','矿化古树','b12-4',['O08-5','O08-6','O01-1']]
];
export const SCULPT_COMBINATIONS=combos.map(([recipeId,name,baseCatalogId,ids])=>({id:'sculpt-combo-'+recipeId.toLowerCase(),recipeId,name,category:'combo',collection:'sculpt',baseCatalogId,quality:'usable_candidate',description:`${name} · ${ids.length} 个可编辑叠加层；可替换所选组合或追加，手绘内容保留。`,layers:ids.flatMap(id=>{const r=SCULPT_OVERLAY_RECIPES.find(r=>r.recipeId===id);if(!r)throw Error('Missing recipe '+id);return structuredClone(r.layers);})}));
