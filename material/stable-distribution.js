import {layerIsLocked} from './surface-layers.js';
const n=(label,min,max,step,value,unit='')=>({kind:'number',label,min,max,step,value,unit,group:'distribution'});
export const STABLE_RULE='treeauto';
export const STABLE_FIELDS={role:n('分布角色',0,5,1,0),recognitionCm:n('形体识别宽度',4,100,1,18,'cm'),patchCm:n('斑块尺寸',1,200,1,28,'cm'),density:n('覆盖密度',0,1,.01,.55),rootHeightMeters:n('根部附着高度',.1,20,.05,1.85,'m'),edge:n('边缘过渡',.01,.35,.01,.08),seed:n('随机种子',0,10000,1,0)};
export const stableRule=(surface,e)=>surface?.masks.find(m=>m.id===e.maskRef)?.items.find(r=>r.type===STABLE_RULE&&r.enabled&&r.strength>0);
const clamp=x=>Math.min(1,Math.max(0,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function hash(x,y,z,seed){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;}
function noise(p,s,seed){const q=p.map(v=>v/s),i=q.map(Math.floor),f=q.map((v,k)=>{const t=v-i[k];return t*t*t*(t*(t*6-15)+10);}),mix=(a,b,t)=>a+(b-a)*t;return mix(mix(mix(hash(i[0],i[1],i[2],seed),hash(i[0]+1,i[1],i[2],seed),f[0]),mix(hash(i[0],i[1]+1,i[2],seed),hash(i[0]+1,i[1]+1,i[2],seed),f[0]),f[1]),mix(mix(hash(i[0],i[1],i[2]+1,seed),hash(i[0]+1,i[1],i[2]+1,seed),f[0]),mix(hash(i[0],i[1]+1,i[2]+1,seed),hash(i[0]+1,i[1]+1,i[2]+1,seed),f[0]),f[1]),f[2]);}
export function stableGeometry({short,broad,signed,wideSigned}){return{cavity:smooth(.015,.22,-signed),contact:smooth(.06,.5,1-short),shade:smooth(.04,.46,1-broad),ridge:smooth(.02,.22,signed)*smooth(.008,.12,signed-wideSigned/3)*broad,broad};}
const surfaceSupport=({cavity,contact,shade})=>clamp(Math.max(cavity,contact,shade*.75)*1.5);
const ROOT_SAMPLES=[[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]];
const OPEN_ROOT_STRENGTH={2:.27,4:.20};

// Judge the amount of shelter in physical surface area, independent of UV density.
export function rootMossSupplement(mesh,analysis,heightMeters,rootHeightMeters){
 const {indices,pos,min,height}=mesh,limit=min[1]+height*rootHeightMeters/heightMeters;
 let rootArea=0,shelteredArea=0;
 for(let corner=0;corner<indices.length;corner+=3){
  const a=indices[corner]*3,b=indices[corner+1]*3,c=indices[corner+2]*3;
  if(Math.min(pos[a+1],pos[b+1],pos[c+1])>=limit)continue;
  const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2];
  const vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];
  const area=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
  for(const [x,y,z] of ROOT_SAMPLES){
   if(pos[a+1]*x+pos[b+1]*y+pos[c+1]*z>=limit)continue;
   const interpolate=values=>values[corner]*x+values[corner+1]*y+values[corner+2]*z;
   const geometry=stableGeometry({...analysis.ao.sample(corner/3,x,y,z),
    signed:interpolate(analysis.local.signed),wideSigned:interpolate(analysis.wide.signed)});
   rootArea+=area;
   shelteredArea+=area*smooth(.42,.68,surfaceSupport(geometry));
  }
 }
 return rootArea?1-smooth(.02,.10,shelteredArea/rootArea):1;
}

export function stableCoverage({position,cavity,contact,shade,ridge,broad},p,{openRootFallback=false,mossSupplement=1}={}){
 const density=p.density??.55;if(density<=0)return p.role===null?[0,0,0,0,0,0]:0;const size=(p.patchCm??28)/100,seed=p.seed??0,role=p.role===null?null:p.role??0,cloud=noise(position,size,193+seed),mid=noise(position,size*.41,811+seed),grain=noise(position,size*.08,177+seed),support=surfaceSupport({cavity,contact,shade}),low=1-smooth(p.rootHeightMeters*.45,p.rootHeightMeters,position[1]);
 const domains=[support,clamp(ridge*1.8),support*(1-smooth(p.rootHeightMeters*.08,p.rootHeightMeters*.55,position[1])),(.25+.75*ridge)*(1-support*.6)*broad,support*low,support*low*(1-ridge*.4)];
 const flow=role===null||role===4?noise([position[0],position[1]*.08,position[2]],size*.18,733+seed):0,score=cloud*.55+mid*.35+grain*.1;
 const edge=p.edge??.08;
 const coverage=i=>{
  const pattern=i===4?flow*.7+mid*.3:score;
  const existing=clamp(domains[i]*(density>=1?1:smooth(1-density-edge,1-density+edge,pattern)));
  if(openRootFallback&&i===5&&mossSupplement>0){
   const root=p.rootHeightMeters,top=root*(.75+.25*cloud);
   const height=1-smooth(root*.35,top,position[1]);
   const threshold=1-density+.12,edgeWidth=edge*.65;
   const clump=smooth(threshold-edgeWidth,threshold+edgeWidth,score);
   const openBark=1-smooth(.08,.42,support);
   return Math.max(existing,.92*mossSupplement*height*clump*openBark);
  }
  const strength=openRootFallback?OPEN_ROOT_STRENGTH[i]:0;
  if(!strength)return existing;
  const top=p.rootHeightMeters*(i===2?.55:1);
  const nearGround=1-smooth(top*.03,top,position[1]);
  // Keep the existing contact marks. On open bark only add a soft low band
  // with the same breakup, even when the wet-seam density is near one.
  const openDensity=i===4?Math.min(density,.55):density;
  const patch=openDensity>=1?1:smooth(1-openDensity-edge,1-openDensity+edge,pattern);
  return Math.max(existing,strength*nearGround*patch);
 };
 return role===null?domains.map((_,i)=>coverage(i)):coverage(role);
}
export function upgradeStableDistribution(document,effectIds){
 const d=structuredClone(document),s=d.surface,targets=new Set(effectIds),converted=new Map();
 if(!targets.size||[...targets].some(id=>!s.effects.some(e=>e.id===id)||layerIsLocked(s,id)))throw Error('请先选择并解锁需要转换的图层。');
 for(const e of s.effects.filter(e=>targets.has(e.id))){let m=s.masks.find(m=>m.id===e.maskRef);if(!m?.items.some(r=>r.type==='treeweather'))continue;
  if(s.effects.some(other=>!targets.has(other.id)&&other.maskRef===m.id)){if(!converted.has(m.id)){if(s.masks.length>=48)throw Error('分布数量不足以安全分离共享蒙版。');const copy=structuredClone(m),areas=new Map();copy.id=crypto.randomUUID();copy.name+=' · 独立分布';for(const r of copy.items){r.id=crypto.randomUUID();for(const key of ['areaRef','addRef','eraseRef'])if(r[key]){const a=s.areas.find(a=>a.id===r[key]);if(a&&(r.type==='paint'||a.ownedBy)){if(!areas.has(a.id)){if(s.areas.length>=64)throw Error('区域数量不足以安全保留局部修正。');const clone={...structuredClone(a),id:crypto.randomUUID(),ownedBy:e.id};s.areas.push(clone);areas.set(a.id,clone.id);}r[key]=areas.get(a.id);}}}s.masks.push(copy);converted.set(m.id,copy);}m=converted.get(m.id);e.maskRef=m.id;}
  for(const r of m.items)if(r.type==='treeweather'){const p=r.params;r.type=STABLE_RULE;r.params={role:p.role,recognitionCm:Math.max(4,Math.min(100,18*p.scale)),patchCm:Math.max(1,Math.min(200,28*p.scale)),density:clamp(p.density*.55),rootHeightMeters:p.rootHeightMeters,edge:.08,seed:p.seed};}delete e.legacyBinding;e.coverageMode='rules';
 }
 s.active=true;return d;
}
