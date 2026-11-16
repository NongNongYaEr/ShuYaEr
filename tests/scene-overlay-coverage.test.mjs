import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSceneOverlayCoverage,sceneOverlayGeometry} from '../material/web/scene-overlay-coverage.js';
import {SCENE_OVERLAYS} from '../material/web/scene-overlay-catalog.js';

const point={position:[.52,.49,.6],normal:[0,0,1]};
const end={position:[.75,.67,.65],normal:[0,0,1]};
const options={max:[1.1,1.4,.9],seed:271};
const defaults=style=>Object.fromEntries(Object.entries(SCENE_OVERLAYS[style].fields).map(([key,field])=>[key,field.value]));
function create(style,parameters={},role='main',points=[point,end]){
 return createSceneOverlayCoverage({style,role,params:{...defaults(style),...parameters},points},options);
}

test('全部32种效果的默认参数都产生有限、可区分的覆盖量',()=>{
 const samples=[];
 for(let y=0;y<84;y++)for(let x=0;x<84;x++){
  samples.push([x/83,y/83,.6,0,0,1,.56,.42,.48]);
  samples.push([x/83,y/83,.6,.37,.91,.15,.56,.42,.48]);
  samples.push([x/83,y/83,.6,.12,-.96,.23,.56,.42,.48]);
 }
 const signatures=new Set();
 for(const [style,entry] of Object.entries(SCENE_OVERLAYS)){
  const points=entry.mode==='auto'?[]:entry.mode==='point'?[point]:[point,end];
  const sums=entry.coatings.map(({role})=>{
   const sample=create(style,{},role,points),values=samples.map(s=>sample(...s));
   assert(values.every(value=>Number.isFinite(value)&&value>=0&&value<=1),style);
   assert(values.some(value=>value>.01),`${style}: ${role}`);
   return values.reduce((a,b)=>a+b,0).toFixed(5);
  });
  signatures.add(sums.join('|'));
 }
 assert.equal(signatures.size,32);
});

test('局部编号和路径遵循命中位置、表面法线与有限范围',()=>{
 const args={...options,textMask:()=>1};
 const params={...defaults('spray'),wear:0,width:24,height:10};
 const stamp=createSceneOverlayCoverage({style:'spray',params,points:[point]},args);
 const stampRotated=createSceneOverlayCoverage({style:'spray',params:{...params,rotation:90},points:[point]},args);
 assert.equal(stamp(.6,.49,.6,0,0,1),1);
 assert.equal(stampRotated(.6,.49,.6,0,0,1),0);
 assert.equal(stamp(.52,.49,.66,0,0,1),0);
 assert.equal(stamp(.52,.49,.6,0,0,-1),0);
 assert.equal(create('spray',{},'main',[])(.52,.49,.6,0,0,1),0);
 assert.equal(create('tool-teeth',{},'main',[point])(.52,.49,.6,0,0,1),0);

 const strap=create('strap'),rim=create('strap',{},'rim');
 assert(strap(.52,.49,.6,0,0,1)>0);
 assert.equal(rim(.52,.49,.6,0,0,1),0);
 assert(strap(.63,.58,.625,0,0,1)>0);
 assert.equal(strap(.63,.58,.625,0,0,-1),0);
 assert.equal(strap(.63,.82,.625,0,0,1),0);
});

test('场景坡度、方向、沉积带与时间进度各自改变对应区域',()=>{
 const slope=create('buried-slope',{height:.45,slope:35,direction:90});
 const reverse=create('buried-slope',{height:.45,slope:35,direction:-90});
 assert(slope(1,.49,.45,0,0,1)>slope(.1,.49,.45,0,0,1));
 assert(reverse(1,.49,.45,0,0,1)<reverse(.1,.49,.45,0,0,1));

 const wet=create('tide',{height:.9,width:24}),line=create('tide',{height:.9,width:24},'line');
 assert(wet(.1,.78,.26,0,0,1)>.3);
 assert.equal(wet(.1,.30,.26,0,0,1),0);
 assert.equal(line(.1,.78,.26,0,0,1),0);
 assert(line(.1,.90,.26,0,0,1)>0);

 for(const style of ['drying','snowmelt']){
  const start=create(style,{progress:0}),mid=create(style,{progress:.5}),later=create(style,{progress:.7}),end=create(style,{progress:1});
  for(let i=0;i<37;i++){
   const p=[i*.027,.35+(i%7)*.043,.13+(i%11)*.07,0,1,0,.25,.44,.51];
   assert(start(...p)>=mid(...p)&&mid(...p)>=later(...p));
   assert.equal(end(...p),0);
  }
  assert(sceneOverlayGeometry(style));
 }
 assert(!sceneOverlayGeometry('tide'));
});

test('双色漆存在实心底漆和裸木，两个漆层不重叠',()=>{
 const top=create('paint-peel'),primer=create('paint-peel',{},'primer');
 const primerOnly=create('paint-peel',{undercoat:1,bare:0},'primer');
 const allBare=create('paint-peel',{bare:1},'primer');
 let solidTop=0,solidPrimer=0,bareWood=0;
 for(let i=0;i<64;i++)for(let j=0;j<64;j++){
  const p=[i/63,j/63,.6,0,0,1],a=top(...p),b=primer(...p);
  assert(a+b<=1+1e-7);
  assert.equal(primerOnly(...p),1);
  assert.equal(allBare(...p),0);
  solidTop+=Number(a===1&&b===0);
  solidPrimer+=Number(a===0&&b===1);
  bareWood+=Number(a===0&&b===0);
 }
 assert(solidTop>100&&solidPrimer>100&&bareWood>100);
});

test('洞口沿内外侧、擦痕凹凸与上扬烟痕依据各自的真实控制',()=>{
 const loop=[[.5,.4,.6],[.7,.4,.6],[.7,.6,.6],[.5,.6,.6],[.5,.4,.6]]
  .map(position=>({position,normal:[0,0,1]}));
 const dark=create('hollow-rim',{width:10},'wall',loop);
 const reverse=create('hollow-rim',{width:10},'wall',[...loop].reverse());
 const bright=create('hollow-rim',{width:10},'main',loop);
 const n=[0,0,1];
 assert(dark(.6,.421,.6,...n)>.15);
 assert(reverse(.6,.421,.6,...n)>.15);
 assert.equal(dark(.6,.379,.6,...n),0);
 assert(bright(.6,.400,.6,...n)>.22);

 const rub=create('rub'),filler=create('filler');
 const p=[...point.position,...n];
 assert(rub(...p,.72,.1,.93)>rub(...p,.02,.72,.35));
 assert(filler(...p,.72,.1,.93)<filler(...p,.02,.72,.35));
 assert(sceneOverlayGeometry('rub')&&sceneOverlayGeometry('filler'));

 const smokeR=create('smoke',{direction:90,length:45});
 const smokeL=create('smoke',{direction:-90,length:45});
 let momentR=0,momentL=0;
 for(let i=0;i<71;i++){
  const x=.16+i*.01;
  assert.equal(smokeR(x,.36,.6,...n),0);
  assert.equal(smokeL(x,.36,.6,...n),0);
  momentR+=(x-point.position[0])*smokeR(x,.74,.6,...n);
  momentL+=(x-point.position[0])*smokeL(x,.74,.6,...n);
 }
 assert(momentR>momentL);
});

test('喷湿从树外喷头照射朝向面，细霜宽度能覆盖更多凸脊肩部',()=>{
 const narrow=create('sprinkler',{direction:90,angle:16,amount:1});
 const wide=create('sprinkler',{direction:90,angle:86,amount:1});
 const turned=create('sprinkler',{direction:-90,angle:86,amount:1});
 const at=[...point.position];
 assert(narrow(...at,0,0,1)>.1);
 assert.equal(wide(...at,0,0,-1),0);
 let narrowArea=0,wideArea=0,directionDelta=0;
 for(let i=0;i<=50;i++)for(let j=0;j<=50;j++){
  const q=[.2+i*.012,.2+j*.012,.6,0,0,1];
  narrowArea+=Number(narrow(...q)>.04);
  wideArea+=Number(wide(...q)>.04);
  directionDelta+=Math.abs(wide(...q)-turned(...q));
 }
 assert(wideArea>narrowArea*2&&directionDelta>10);

 const thin=create('rime',{direction:0,width:1,amount:1});
 const broad=create('rime',{direction:0,width:60,amount:1});
 const shoulder=(sample,x)=>sample(x,.4,.5,0,0,1,.165);
 const ridge=(sample,x)=>sample(x,.4,.5,0,0,1,.8);
 let expansion=0;
 for(let i=0;i<25;i++){
  const x=i*.04;
  expansion+=shoulder(broad,x)-shoulder(thin,x);
  assert.equal(ridge(thin,x),ridge(broad,x));
 }
 assert(expansion>2);
});

test('尾滴独立于流痕，锯齿节距和接片软边各自可调',()=>{
 const head=[...point.position,0,0,1];
 const end=[head[0],head[1]-.32*.93,...head.slice(2)];
 const dropsOff=create('sap',{tail:0,length:32,width:6},'drop');
 const dropsOn=create('sap',{tail:1,length:32,width:6},'drop');
 assert(dropsOff(...head)>.5);
 assert.equal(dropsOn(...head),dropsOff(...head));
 assert.equal(dropsOff(...end),0);
 assert(dropsOn(...end)>.5);
 assert.equal(create('sap',{tail:0})(...end),create('sap',{tail:1})(...end));

 const teethA=create('saw',{spacing:2,size:22}),teethB=create('saw',{spacing:5,size:22});
 let patternDelta=0;
 for(let i=0;i<80;i++){
  const sample=[head[0],head[1]+.25*(i/79-.5),...head.slice(2)];
  patternDelta+=Math.abs(teethA(...sample)-teethB(...sample));
 }
 assert(patternDelta>3);
 const far=[head[0],head[1]+.12,...head.slice(2)];
 assert.equal(teethA(...far)+teethB(...far),0);

 const soft=create('bark-patch',{width:20,edge:8},'main',[point]);
 const sharp=create('bark-patch',{width:20,edge:1},'main',[point]);
 const edge=[head[0]+.075,...head.slice(1)];
 assert.equal(soft(...head),sharp(...head));
 assert(soft(...edge)<sharp(...edge));
});
