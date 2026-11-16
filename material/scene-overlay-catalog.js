import {defaultBlend} from './material-blend.js';

const number=(label,min,max,step,value,unit='')=>({kind:'number',label,min,max,step,value,unit});
const cm=(label,value,max=160,min=.1,step=.1)=>number(label,min,max,step,value,'cm');
const meters=(label,value)=>number(label,0,200,.01,value,'m');
const mm=(label,value,max=12)=>number(label,0,max,.1,value,'mm');
const ratio=(label,value)=>number(label,0,1,.01,value);
const degrees=(label,value)=>number(label,-180,180,1,value,'°');
const opening=(label,value)=>number(label,5,170,1,value,'°');
const tint=(label,value)=>({kind:'color',label,value});
const exampleText={kind:'text',label:'喷漆文字',value:'27',maxLength:32};
const patchMaterial={
 kind:'select',label:'接片材质',value:'old-brown',
 options:[['old-brown','香樟·细裂'],['pale-wood','白桦·纸皮'],['deep-bark','铁桉·黑沟']]
};

function blend(mode,strength){
 const settings=defaultBlend();
 settings.color={mode,strength};
 return settings;
}

function texture(role,type,{color,rough,height=0,grain=.45,keep=1,amount=.9,ao=.12,normal=1,variation=.38}){
 return{role,type,params:{
  surfaceColor:color,surfaceRoughness:rough,surfaceHeightMm:height,surfaceGrainCm:grain,
  surfaceBarkKeep:keep,surfaceAmount:amount,surfaceAO:ao,surfaceNormalStrength:normal,surfaceVariation:variation
 }};
}

function stain(role,color,rough,amount=.8,{mode='normal',grain=1.2,variation=.35}={}){
 return{role,type:'stain',params:{surfaceColor:color,surfaceRoughness:rough,surfaceAmount:amount,surfaceGrainCm:grain,surfaceVariation:variation},blend:blend(mode,1)};
}

function water(role,rough,darken,amount=.9){
 return{role,type:'wet',params:{wet:amount,wetRough:rough,wetDarken:darken}};
}

function dirt(role,color,rough,amount=.74,normal=.8){
 return{role,type:'dirt',params:{dirt:amount,dirtColor:color,dirtRough:rough,dirtNormal:normal}};
}

const channels=(color,roughness,height,ao)=>({color,roughness,height,ao});

// Roles are ordered from lower to upper coating. Each role shares one set of
// distribution controls, while keeping its own material and coverage field.
export const SCENE_OVERLAYS={
 tide:{
  name:'退水双痕',category:'deposit',mode:'auto',
  description:'在设定水位留下窄浅盐线，下方保留一段较宽的潮泥带。',
  fields:{height:meters('退水水位',.95),width:cm('泥带宽度',36,300,1),amount:ratio('残留程度',.68)},
  coatings:[
   dirt('main','#654a36',.88,.72,.8),
   texture('line','dust',{color:'#dfd1a8',rough:.93,height:.3,grain:.3,amount:.96,ao:.06})
  ]
 },
 strap:{
  name:'绑带勒痕',category:'damage',mode:'path',
  description:'沿手绘带状路径留下压暗的旧印和偏浅的带缘。',
  fields:{width:cm('绑带宽度',7,40,.5),depth:mm('勒痕深浅',3),amount:ratio('印痕强度',.78)},
  coatings:[
   texture('main','cork',{color:'#4f392c',rough:.78,height:.35,grain:.4,keep:.48,amount:.86,ao:.25}),
   texture('rim','cork',{color:'#a88463',rough:.87,height:.95,grain:.65,keep:.72,amount:.72,ao:.08})
  ]
 },
 spray:{
  name:'自定义喷漆编号',category:'paint',mode:'point',
  description:'在点击位置投射自定义编号，可调尺寸、角度和磨损。',
  fields:{text:exampleText,color:tint('漆色','#dad3b0'),wear:ratio('掉漆量',.16),width:cm('编号宽度',26,120,1),height:cm('编号高度',12,100,1),rotation:degrees('旋转',0)},
  coatings:[texture('main','cork',{color:'#dad3b0',rough:.74,height:.1,grain:.27,amount:1,ao:.03,variation:.18})]
 },
 sap:{
  name:'定点树液流痕',category:'coating',mode:'point',
  description:'树液从点击的出液点向下拉长，起点较厚，末端逐渐收细。',
  fields:{length:cm('下流长度',40,220,2),width:cm('流痕宽度',5,40,.3),tail:ratio('尾滴大小',.68)},
  coatings:[
   stain('main','#9e5c26',.41,.72,{mode:'normal',grain:.55}),
   texture('drop','cork',{color:'#bd7735',rough:.26,height:1.7,grain:.27,keep:.64,amount:.89,ao:.1})
  ]
 },
 'paint-peel':{
  name:'双色漆露底',category:'paint',mode:'auto',
  description:'在同一脱漆形状上逐步露出赭红底漆与裸木，保留漆层之间的边界。',
  fields:{undercoat:ratio('露出底漆',.36),bare:ratio('露出木皮',.28),size:cm('剥落斑块尺寸',32,150,2)},
  coatings:[
   texture('main','cork',{color:'#e3dac5',rough:.87,height:.21,grain:.35,amount:1,ao:.03,variation:.18}),
   texture('primer','cork',{color:'#a95035',rough:.91,height:.1,grain:.42,amount:1,ao:.04,variation:.28})
  ]
 },
 'vine-print':{
  name:'藤蔓吸附残印',category:'bio',mode:'path',
  description:'沿选定的藤蔓旧路径留下细根和成串附着印，斑点跟随路径转向。',
  fields:{spacing:cm('附着点间距',7,45,.3),size:cm('附着印直径',2.6,20,.2),amount:ratio('残印强度',.69)},
  coatings:[texture('main','cork',{color:'#534633',rough:.91,height:.45,grain:.31,keep:.92,amount:.84,ao:.17})]
 },
 'tool-teeth':{
  name:'工具齿痕',category:'damage',mode:'pair',
  description:'从两点确定方向和长度，生成等距的齿痕与浅色露木。',
  fields:{width:cm('齿痕宽度',4.2,46,.3),spacing:cm('齿间距离',2.5,30,.3),depth:mm('齿痕深浅',4,18)},
  coatings:[texture('main','cork',{color:'#ba9767',rough:.89,height:.8,grain:.32,keep:.48,amount:.95,ao:.24})]
 },
 'hollow-rim':{
  name:'树洞口沿',category:'damage',mode:'path',
  description:'沿指定洞口描出浅磨口沿，洞壁一侧逐渐变暗。',
  fields:{width:cm('口沿影响宽度',14,70,1),shine:ratio('口沿磨亮量',.61),dark:ratio('内壁深染',.74)},
  coatings:[
   texture('main','cork',{color:'#a58562',rough:.81,height:.7,grain:.9,keep:.77,amount:.87,ao:.1}),
   stain('wall','#3b2c22',.98,.84,{mode:'multiply',grain:.85})
  ]
 },
 'buried-slope':{
  name:'坡地旧埋痕',category:'deposit',mode:'auto',
  description:'随旧地面坡向留下倾斜土线，经过树背和根盘时仍连续。',
  fields:{height:meters('旧地面高度',.54),slope:number('坡度',0,60,1,16,'°'),direction:degrees('坡向',30),width:cm('土线带宽',21,180,1)},
  coatings:[dirt('main','#745538',.95,.83,.9)]
 },
 litter:{
  name:'根叉积叶',category:'deposit',mode:'auto',
  description:'碎叶积在根叉凹处，周围树皮保留偏暖的腐殖染色。',
  fields:{size:cm('碎叶尺寸',7,35,.5),amount:ratio('积叶量',.7),spread:cm('染色外扩',34,120,1)},
  coatings:[
   texture('main','cork',{color:'#9c6138',rough:.97,height:1.8,grain:2.2,keep:.82,amount:.95,ao:.25,variation:.64}),
   stain('stain','#6b4631',.87,.74,{mode:'multiply',grain:1.8})
  ]
 },
 rime:{
  name:'迎风霜脊',category:'weathering',mode:'auto',
  description:'沿迎风凸起留下薄脆霜边，偏向开阔和突出的树皮轮廓。',
  fields:{direction:degrees('来风朝向',0),width:cm('霜脊宽度',12,70,1),amount:ratio('结霜覆盖量',.85)},
  coatings:[texture('main','dust',{color:'#e3edec',rough:.91,height:.42,grain:.24,amount:.98,ao:.05,variation:.23})]
 },
 'splash-fan':{
  name:'定向反溅泥点',category:'deposit',mode:'point',
  description:'以点击处为反溅中心，泥点在扇形范围内逐渐变小、变少。',
  fields:{direction:degrees('反溅方向',-22),angle:opening('反溅张角',73),length:cm('最远反溅距离',58,280,2)},
  coatings:[dirt('main','#6a4931',.92,.86,1.05)]
 },
 smoke:{
  name:'局部烟熏',category:'weathering',mode:'point',
  description:'从指定熏痕起点向上形成渐宽的烟尘，并向侧面偏移。',
  fields:{length:cm('向上延伸',72,300,3),direction:degrees('烟痕偏转',-14),amount:ratio('烟尘浓度',.77)},
  coatings:[stain('main','#39312b',.94,.9,{mode:'multiply',grain:.7,variation:.46})]
 },
 sprinkler:{
  name:'喷灌水垢',category:'deposit',mode:'point',
  description:'沿指定喷灌方向留下扇形水垢，矿斑在扇面边缘逐渐减少。',
  fields:{direction:degrees('喷灌方向',18),angle:opening('水垢扇角',76),amount:ratio('水垢覆盖量',.64)},
  coatings:[texture('main','dust',{color:'#ded3af',rough:.95,height:.34,grain:.45,amount:.91,ao:.06,variation:.51})]
 },
 rub:{
  name:'动物蹭亮带',category:'weathering',mode:'path',
  description:'沿接触路径磨亮外露树皮，保留沟缝内的粗糙纹理。',
  fields:{height:number('带状高度偏移',-100,100,1,0,'cm'),width:cm('磨亮带宽',36,130,1),amount:ratio('磨亮强度',.73)},
  coatings:[{
   ...stain('main','#a08163',.49,.75,{mode:'softlight',grain:2}),
   channels:channels(true,true,false,false)
  }]
 },
 bite:{
  name:'成组啃咬露木',category:'damage',mode:'point',
  description:'附着点周围形成成组破损，浅色露木与暗色啃咬边缘交错。',
  fields:{spacing:cm('咬痕间距',3.2,25,.3),width:cm('单道咬痕宽度',2.2,22,.3),depth:mm('咬痕深浅',3.6,18)},
  coatings:[texture('main','cork',{color:'#b28c58',rough:.91,height:1.35,grain:.56,keep:.55,amount:.94,ao:.24})]
 },
 graft:{
  name:'嫁接愈合线',category:'damage',mode:'path',
  description:'沿嫁接口生成愈合线和浅色隆起边，愈合进度逐步收窄裸露线。',
  fields:{width:cm('接合线宽',4.8,28,.4),height:mm('愈伤隆起',4.4,16),progress:ratio('愈合进度',.57)},
  coatings:[
   texture('main','cork',{color:'#4a3228',rough:.9,height:.38,grain:.48,keep:.55,amount:.91,ao:.25}),
   texture('rim','cork',{color:'#b18b56',rough:.91,height:1.7,grain:.7,keep:.74,amount:.87,ao:.16})
  ]
 },
 'blue-wood':{
  name:'裸木蓝灰染边',category:'weathering',mode:'point',
  description:'在所选露木处留下沿纹理拉长的蓝灰浸染边。',
  fields:{length:cm('染色长度',51,210,2),amount:ratio('浸染浓度',.64),stretch:ratio('沿木纹拉长',.74)},
  coatings:[stain('main','#485964',.89,.75,{mode:'color',grain:1.8,variation:.54})]
 },
 'leaf-print':{
  name:'落叶染印',category:'deposit',mode:'auto',
  description:'在承叶表面散布偏暖的扁平叶形和淡淡叶脉染色。',
  fields:{size:cm('叶印尺寸',12,50,1),density:ratio('叶印疏密',.35),amount:ratio('染印强度',.62)},
  coatings:[stain('main','#89533d',.87,.82,{mode:'normal',grain:1.1,variation:.31})]
 },
 'lichen-ring':{
  name:'地衣生长环',category:'bio',mode:'auto',
  description:'由较深的内斑和一圈浅色生长边组成，边缘有自然破口。',
  fields:{size:cm('地衣环直径',21,80,2),width:cm('生长环宽度',3.5,22,.3),breakup:ratio('环边破碎',.37)},
  coatings:[
   texture('main','cork',{color:'#666a4d',rough:.96,height:.3,grain:.32,keep:.86,amount:.88,ao:.18}),
   texture('ring','dust',{color:'#b5ba82',rough:.94,height:.61,grain:.42,amount:.95,ao:.11})
  ]
 },
 'shade-print':{
  name:'护板拆除晒影',category:'adjustment',mode:'point',
  description:'以旧护板的大小定位残印，通过周边褪色形成可见的色差边缘。',
  fields:{width:cm('遮挡宽度',33,180,2),height:cm('遮挡高度',48,220,2),amount:ratio('晒影色差',.67),edge:cm('边界过渡宽度',2.4,27,.1)},
  coatings:[stain('main','#74644b',.86,.81,{mode:'multiply',grain:2.3,variation:.17})]
 },
 rust:{
  name:'钉孔锈淌',category:'coating',mode:'point',
  description:'钉孔下有向下延伸的赭锈，孔周颜色更深。',
  fields:{size:cm('锈眼直径',3.5,24,.3),length:cm('锈痕下延长度',38,200,2),amount:ratio('锈染强度',.82)},
  coatings:[
   stain('main','#a54f29',.83,.87,{mode:'normal',grain:.9,variation:.48}),
   texture('ring','cork',{color:'#512f22',rough:.95,height:.48,grain:.35,amount:.95,ao:.22,keep:.86})
  ]
 },
 boot:{
  name:'靴底泥印',category:'deposit',mode:'point',
  description:'在树面转印带断续纹路的靴底泥印，可调整大小和磨耗。',
  fields:{size:cm('靴印长度',28,80,5),rotation:degrees('旋转',-16),wear:ratio('泥印缺损',.27)},
  coatings:[dirt('main','#775139',.87,.93,1.1)]
 },
 brand:{
  name:'木面烙印',category:'coating',mode:'point',
  description:'在裸木或树皮上形成深色标记，外沿留较浅的熏色。',
  fields:{size:cm('烙印尺寸',24,90,3),amount:ratio('灼色强度',.82),width:cm('熏边宽度',1.9,18,.2)},
  coatings:[
   stain('main','#33231d',.94,.96,{mode:'multiply',grain:.6}),
   stain('rim','#8d6845',.87,.69,{mode:'normal',grain:.5,variation:.24})
  ]
 },
 saw:{
  name:'端面锯纹',category:'detail',mode:'point',
  description:'沿指定朝向在木质端面压出成排锯纹，近看有明暗和粗糙度差异。',
  fields:{direction:degrees('锯纹方向',16),spacing:cm('锯纹间距',.9,9,.12,.02),depth:mm('纹路深浅',1.8,8),size:cm('锯纹范围',22,140,3)},
  coatings:[texture('main','cork',{color:'#886846',rough:.87,height:.82,grain:.17,keep:.88,amount:.85,ao:.21})]
 },
 filler:{
  name:'填缝残浆',category:'deposit',mode:'path',
  description:'沿描出的树皮沟缝填入浅色残浆，可控制填缝和表面残留。',
  fields:{depth:mm('填缝深度',4.2,22),width:cm('残浆宽度',5.8,45,.4),amount:ratio('残浆覆盖量',.82)},
  coatings:[texture('main','cork',{color:'#c1b291',rough:.94,height:1.05,grain:.44,keep:.51,amount:.95,ao:.14})]
 },
 drying:{
  name:'雨后逐步干燥',category:'weathering',mode:'auto',
  description:'树皮自外侧逐步干燥，较深沟缝更久保留湿色和较低粗糙度。',
  fields:{progress:ratio('干燥进度',.52),retention:ratio('凹处保湿',.72),amount:ratio('湿润强度',.72)},
  coatings:[water('main',.29,.42,.91)]
 },
 snowmelt:{
  name:'融雪残斑',category:'weathering',mode:'auto',
  description:'残雪逐渐退成较小斑块，迎向融雪方向的表面更早露出树皮。',
  fields:{progress:ratio('融雪进度',.49),direction:degrees('融雪朝向',28),size:cm('残雪斑块尺寸',30,125,2)},
  coatings:[texture('main','dust',{color:'#e7edeb',rough:.87,height:.58,grain:.63,keep:.87,amount:.98,ao:.06})]
 },
 'dust-wash':{
  name:'积灰雨点冲洗',category:'deposit',mode:'auto',
  description:'在灰层上留下雨点冲洗的小缺口，露出下方树皮。',
  fields:{size:cm('冲洗斑尺寸',2.4,25,.2,.02),amount:ratio('冲洗量',.55),edge:cm('斑缘过渡宽度',.25,8,.01,.01)},
  coatings:[texture('main','dust',{color:'#b8aa8a',rough:.96,height:.23,grain:.3,amount:.88,ao:.11})]
 },
 evaporation:{
  name:'水斑蒸发边',category:'deposit',mode:'auto',
  description:'水斑中心逐渐干燥，矿物沿蒸发边缘留下浅色细圈。',
  fields:{size:cm('水斑尺寸',17,70,2),progress:ratio('蒸发进度',.66),amount:ratio('残留程度',.72)},
  coatings:[
   water('main',.4,.27,.76),
   texture('ring','dust',{color:'#d8c49c',rough:.94,height:.21,grain:.32,amount:.88,ao:.07})
  ]
 },
 dew:{
  name:'枝下凝露',category:'weathering',mode:'auto',
  description:'在枝下和朝下树面留下片状小凝露，局部表面更湿亮。',
  fields:{size:cm('凝露尺度',.42,5,.05,.01),density:ratio('凝露疏密',.52),amount:ratio('湿亮程度',.58)},
  coatings:[{...texture('main','algae',{color:'#82898a',rough:.17,height:.28,grain:.11,keep:.96,amount:.9,ao:.02}),blend:blend('multiply',.18)}]
 },
 'bark-patch':{
  name:'局部树皮接片',category:'detail',mode:'path',
  description:'沿描出的区域铺接一段树皮，控制树皮尺度与接缝宽度。',
  fields:{material:patchMaterial,scale:number('树皮尺度',.25,4,.05,1,'×'),edge:cm('接缝宽度',4,35,.1),width:cm('接片范围',32,140,2)},
  coatings:[texture('main','cork',{color:'#808080',rough:.9,height:1.45,grain:1.6,keep:.15,amount:1,ao:.19,variation:.5})]
 }
};
