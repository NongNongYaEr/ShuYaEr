// A coverage catalog: existing resources retain their identities; only missing
// structures receive newly authored maps. Variant IDs are stable project metadata.
const existing=key=>'bark-new-'+key+'-v1.png',featured=key=>'bark-featured-'+key+'-v1.png';
const families=[
 ['B01','雕刻块面树皮',['宽片纵裂','断续厚脊','圆钝块皮','扭结宽褶'],[null,null,null,null],['plate','broken-ridge','round-plate','twist-fold'],'wide-bark',[.8,.9,.55,.7],3.8,['S01','S04','S09']],
 ['B02','榕根纤维树皮',['细孔榕皮','绳根纵纤','板根舒展','融合气根'],['ficus-lenticels','banyan-rope','buttress-folds','aerial-root'],[],null,[.45,.4,.85,.35],1.8,['S02','S03']],
 ['B03','深裂脊状树皮',['黑沟厚脊','菱形交裂','窄脊深缝','老结扭裂'],['ironbark','poplar-diamond','acacia-scars','olive-gnarled'],[],null,[.65,.6,.55,.7],5,['S01','S04','S10']],
 ['B04','厚鳞针叶树皮',['松皮厚块','长条鳞皮','细层鳞片','柏杉纤鳞'],['pine-blocks','pine-longplates','spruce-scales','cypress-shaggy'],[],null,[.75,.6,.4,.45],4,['S05']],
 ['B05','细鳞与颗粒树皮',['编织细裂','薄鳞碎皮','细颗粒皮','圆脊细孔'],['elm-braids','maple-scales','camphor-fissures','walnut-ridges'],[],null,[.45,.4,.35,.55],2,['S01','S04','S09']],
 ['B06','光滑薄皮树皮',['青绿薄皮','灰褐细肤','横向皮孔','浅裂嫩皮'],[featured('firmiana-green'),'beech-satin','cherry-lenticels','aspen-smooth'],[],null,[.3,.4,.35,.3],.4,['S06','S09']],
 ['B07','拼片剥落树皮',['法桐大斑','残皮翘边','紫薇云斑','榔榆细拼'],[featured('plane-mosaic'),featured('plane-peeling'),featured('crape-cloud'),featured('lacebark-scales')],[],null,[.45,.4,.35,.25],.6,['S06']],
 ['B08','纸皮与带状树皮',['白桦纸皮','桉树丝带','松散长纤','层叠薄膜'],['birch-papery','eucalyptus-ribbon',null,null],[null,null,'long-fibre','ribbon'],'wood-fibres',[.4,.6,.45,.35],1.4,['S06','S07']],
 ['B09','裸露木质',['新鲜浅木','干枯纵纤','风化银木','磨蚀漂木'],[null,null,null,null],['fresh-wood','dry-fibre','silver-wood','driftwood'],'wood-fibres',[.5,.6,.6,.8],1.5,['S07','S08']],
 ['B10','腐木与焦木',['软腐孔木','深褐朽木','纵裂炭木','灰化焦皮'],[null,null,null,null],['porous-rot','fibre-rot','char-plate','ash-char'],'rotted-wood',[.4,.5,.7,.6],4,['S07','S08','S10']],
 ['B11','木材端面',['平整年轮','撕裂断口','偏心根端','腐朽空芯'],[null,null,null,null],['endgrain','torn-end','eccentric-end','hollow-end'],'end-grain',[.6,.45,.35,.7],1.5,['S07','S08']],
 ['B12','风格化与幻想木质',['宽块手绘皮','简化层叠皮','腐化扭纤','矿化木纹'],[null,null,null,null],['painted-plate','painted-layer','corrupt-fibre','mineral-fibre'],'painted-bark',[.7,.5,.65,.6],2.5,['S09','S10']]
];
export const SCULPT_BARK_FAMILIES=Object.fromEntries(families.map(([id,name])=>[id,name]));
export const SCULPT_BARK_CATALOG=Object.freeze(families.flatMap(([family,familyName,names,files,patterns,source,widths,relief,profiles])=>names.map((name,index)=>{
 const id=family.toLowerCase()+'-'+(index+1),file=files[index],endgrain=family==='B11',painted=family==='B12'&&index<2;
 const sourceId=family==='B09'&&index>=2?'silver-driftwood':family==='B10'&&index>=2?'charred-wood':family==='B12'&&index===2?'wide-bark':family==='B12'&&index===3?'mineral-wood':source;
 return Object.freeze({id,family,familyName,name,structure:name,file:file?(file.endsWith('.png')?file:existing(file)):'bark-sculpt-'+id+'-v1.png',existing:!!file,pattern:patterns[index]||null,source:sourceId,variant:index,physicalWidthMeters:widths[index],heightMm:relief,roughness:family==='B09'&&index===0?.74:family==='B10'?.96:.86,role:endgrain?'endgrain':'surface',style:painted?'painted':family==='B12'?'fantasy':'game',profiles:profiles.slice(),directional:!endgrain&&!painted&&!['B06','B07'].includes(family),normalStrength:painted?.9:1.3});
})));
export function sculptBarkMetadata(id){const entry=SCULPT_BARK_CATALOG.find(p=>p.id===id);if(!entry)throw Error('雕刻树基材方向不存在。');return{version:1,id:entry.id,family:entry.family,structure:entry.structure,profiles:entry.profiles,role:entry.role,style:entry.style,physicalWidthMeters:entry.physicalWidthMeters,directional:entry.directional};}
export function validateSculptBarkMetadata(raw){if(raw==null)return null;const expected=sculptBarkMetadata(raw.id);if(raw.version!==1||raw.family!==expected.family)throw Error('雕刻树基材元数据无效。');return expected;}
