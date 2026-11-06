import {decalAppearance} from './surface-decal-styles.js';
// Local placement, not automatic scatter. Count remains zero until a source-face click.
export const LOCAL_ENDGRAIN_RECIPES=[
 ['flat','平整年轮切口',61,'中心清楚的平整年轮，适合已有平切面。'],
 ['torn','撕裂木质断口',62,'不规则木质边缘；保留模型已有的撕裂轮廓。'],
 ['eccentric','偏心树根端面',63,'偏心年轮，适合树根末端和斜切面。'],
 ['decayed','腐朽木芯端面',64,'深色朽木中心与较浅外圈；仅表面材质，不生成树洞。']
].map(([id,name,style,description])=>({id:'local-endgrain-'+id,name,category:'detail',collection:'local',manualPlacement:true,
 description:description+' 双击后点击模型放置，右侧调整宽高、旋转、边缘及投射深度。',
 tags:['端面','切口','年轮','断枝','露木','局部'],
 layers:[{type:'burl',name,params:{...decalAppearance(style),burlCount:0,burlMinSizeCm:24,burlMaxSizeCm:24,burlWarp:0},rules:[]}]}));
