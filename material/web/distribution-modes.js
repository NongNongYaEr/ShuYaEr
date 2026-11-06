// Portable, source-independent distribution templates. Geometry is supplied separately.
export const DISTRIBUTION_MODES={scattered:'自然斑块',root:'根部附着',groove:'沟槽聚集',ridge:'凸脊风化',orientation:'朝向附着',streaks:'纵向流痕',uniform:'均匀覆盖',contact:'接缝与分叉',flow:'沿面导流',boundary:'开放边缘',endgrain:'端面朝向候选'};
export const DISTRIBUTION_KEYS=Object.keys(DISTRIBUTION_MODES);
const n=(label,min,max,step,value,unit='')=>({kind:'number',label,min,max,step,value,unit,group:'distribution'});
export const DISTRIBUTION_FIELDS={mode:n('分布方式',0,DISTRIBUTION_KEYS.length-1,1,0),variant:n('模式变体',0,2,1,0),density:n('覆盖密度',0,1,.01,.55),patchCm:n('斑块尺寸',1,200,1,28,'cm'),recognitionCm:n('形体识别宽度',4,100,1,18,'cm'),rootHeightMeters:n('附着高度',.01,200,.05,1.85,'m'),cavityPreference:n('凹处偏好',0,1,.01,.7),direction:n('附着方向',0,5,1,0),angle:n('附着角度',5,175,1,75,'°'),lengthMeters:n('流痕长度',.05,20,.05,1.2,'m'),widthCm:n('流痕宽度',.5,200,.5,3.5,'cm'),breakup:n('破碎程度',0,1,.01,.25),edge:n('边缘过渡',.01,.35,.01,.08),seed:n('随机种子',0,10000,1,0),boundaryCm:n('边缘影响宽度',.1,200,.5,12,'cm'),flowContrast:n('导流聚集',.25,4,.05,1.2)};
export const distributionNeedsGeometry=p=>[1,2,3,7].includes(p.mode);
export const distributionNeedsStructure=p=>[8,9,10].includes(p.mode);
export function distributionDefaults(mode='scattered'){const p=Object.fromEntries(Object.entries(DISTRIBUTION_FIELDS).map(([k,v])=>[k,v.value]));p.mode=DISTRIBUTION_KEYS.indexOf(mode);if(p.mode<0)throw Error('未知分布方式。');if(mode==='uniform')p.density=1;return p;}
export function validateDistributionParams(raw){const p=distributionDefaults();for(const[k,v]of Object.entries(raw||{})){const f=DISTRIBUTION_FIELDS[k];if(!f||!Number.isFinite(v)||v<f.min||v>f.max||['mode','variant','direction','seed'].includes(k)&&!Number.isInteger(v))throw Error('统一分布参数无效：'+k);p[k]=v;}return p;}
export function validateDistributionState(v){if(v==null)return null;if(v.version!==1||!v.memory||typeof v.memory!=='object'||Array.isArray(v.memory)||Object.keys(v.memory).length>DISTRIBUTION_KEYS.length)throw Error('分布模式记忆无效。');const memory={};for(const[k,p]of Object.entries(v.memory)){if(!DISTRIBUTION_KEYS.includes(k))throw Error('分布模式记忆无效。');memory[k]=validateDistributionParams(p);if(DISTRIBUTION_KEYS[memory[k].mode]!==k)throw Error('分布模式记忆不一致。');}return{version:1,memory};}
const clamp=x=>Math.min(1,Math.max(0,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/Math.max(1e-7,b-a));return t*t*(3-2*t);};
function hash(x,y,z,seed){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;}
export function distributionNoise(p,size,seed){const q=p.map(v=>v/size),i=q.map(Math.floor),f=q.map((v,k)=>{const t=v-i[k];return t*t*t*(t*(t*6-15)+10);}),mix=(a,b,t)=>a+(b-a)*t;return mix(mix(mix(hash(i[0],i[1],i[2],seed),hash(i[0]+1,i[1],i[2],seed),f[0]),mix(hash(i[0],i[1]+1,i[2],seed),hash(i[0]+1,i[1]+1,i[2],seed),f[0]),f[1]),mix(mix(hash(i[0],i[1],i[2]+1,seed),hash(i[0]+1,i[1],i[2]+1,seed),f[0]),mix(hash(i[0],i[1]+1,i[2]+1,seed),hash(i[0]+1,i[1]+1,i[2]+1,seed),f[0]),f[1]),f[2]);}
export function distributionCoverage(position,normal,geometry,p){
 if(p.density<=0)return 0;if(p.mode===6)return 1;
 const g={cavity:0,contact:0,shade:0,ridge:0,broad:1,...geometry},support=clamp(Math.max(g.cavity,g.contact,g.shade*.75)*1.5);let domain=1;
 if(p.mode===1)domain=(1-smooth(p.rootHeightMeters*.45,p.rootHeightMeters,position[1]))*(1-p.cavityPreference+p.cavityPreference*support);
 if(p.mode===2)domain=p.variant===1?clamp(Math.max(g.contact,g.cavity)*2):p.variant===2?clamp(Math.max(g.shade,support)*1.2):support;
 if(p.mode===3)domain=clamp(g.ridge*1.8);
 if(p.mode===4){const dirs=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]],d=dirs[p.direction],dot=normal.reduce((v,x,i)=>v+x*d[i],0),threshold=Math.cos(p.angle*Math.PI/180);domain=smooth(threshold-.12,threshold+.12,dot);}
 if(p.mode===7)domain=clamp(g.contact*1.8)*(.35+.65*clamp(g.cavity*2+g.shade*.4));
 if(p.mode===8)domain=Math.pow(clamp(g.flow??0),p.flowContrast??1.2);
 if(p.mode===9)domain=Number.isFinite(g.boundaryMeters)?1-smooth(0,(p.boundaryCm??12)/100,g.boundaryMeters):0;
 if(p.mode===10){const dirs=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]],d=dirs[p.direction],alignment=normal.reduce((v,x,i)=>v+x*d[i],0),threshold=Math.cos(Math.min(85,p.angle)*Math.PI/180);domain=smooth(threshold-.08,threshold+.08,alignment)*clamp(g.planarity??0);}
 if(domain<=0)return 0;if(p.density>=1)return clamp(domain);
 const size=p.patchCm/100,seed=p.seed,cloud=distributionNoise(position,size,seed+193),mid=distributionNoise(position,size*.41,seed+811),fine=distributionNoise(position,size*.08,seed+177);let pattern=cloud*(.8-p.breakup*.3)+mid*.2+fine*p.breakup*.3;
 if(p.mode===5){const q=[position[0]/(p.widthCm/100),position[1]/p.lengthMeters,position[2]/(p.widthCm/100)];pattern=distributionNoise(q,1,seed+733)*(.85-p.breakup*.3)+mid*(.15+p.breakup*.3);}
 return clamp(domain*smooth(1-p.density-p.edge,1-p.density+p.edge,pattern));
}
