export const SURFACE_FLOW_DEFAULTS={barrier:4,fiberStrength:.65,fiberRadiusCm:12};
export const CONTINUITY_FLOW_DEFAULTS={version:1,amount:.2,radiusCm:18};
export const BANYAN_FLOW_DEFAULTS={version:1,shapeScaleCm:35,strength:1};
const hash=/^[a-f0-9]{64}$/;
export function validateBarkFlow(raw,source){
 if(raw==null)return null;
 if(raw.kind!=='tree-bark-flow'||![1,2,3,4,5].includes(raw.version)||raw.coordinates!=='height-normalized-y-up-v1'||!hash.test(raw.sourceSHA256)||source&&raw.sourceSHA256!==source||!Number.isInteger(raw.componentSeed)||raw.componentSeed<0||raw.componentSeed>2000000||!Array.isArray(raw.guides)||!raw.guides.length||raw.guides.length>256)throw Error('枝干流向不属于当前源模型，或格式无效。');
 let count=0;const ids=new Set();for(const g of raw.guides){if(typeof g.id!=='string'||!/^G\d+$/.test(g.id)||ids.has(g.id)||typeof g.parent!=='string'||g.parent&&!ids.has(g.parent)||!Number.isFinite(g.attach)||g.attach<0||g.attach>1||!Array.isArray(g.points)||g.points.length<2||g.points.length>4096)throw Error('枝干流向层级无效。');ids.add(g.id);count+=g.points.length;
  for(const [i,p]of g.points.entries())if(!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||i&&Math.hypot(...p.map((v,k)=>v-g.points[i-1][k]))<1e-9)throw Error('枝干控制点无效或重复。');
  for(const k of ['start_radius','end_radius'])if(!Number.isFinite(g[k])||g[k]<=0||g[k]>10000)throw Error('枝干半径无效。');
 }
 if(count>16384||JSON.stringify(raw).length>1500000)throw Error('枝干流向超出容量。');
 if(raw.version>=2){if(!raw.surface||typeof raw.surface!=='object'||Array.isArray(raw.surface)||Object.keys(raw.surface).length!==3)throw Error('表面走势配置无效。');for(const [k,v]of Object.entries(raw.surface)){const range={barrier:[0,12],fiberStrength:[0,1],fiberRadiusCm:[2,100]}[k];if(!range||!Number.isFinite(v)||v<range[0]||v>range[1])throw Error('表面走势参数无效。');}}
 if(raw.version>=4){const c=raw.continuity;if(!c||Object.keys(c).length!==3||c.version!==1||!Number.isFinite(c.amount)||c.amount<0||c.amount>1||!Number.isFinite(c.radiusCm)||c.radiusCm<2||c.radiusCm>100)throw Error('连续走势衔接配置无效。');}
 if(raw.version===5){const c=raw.banyan;if(!c||Object.keys(c).length!==3||c.version!==1||!Number.isFinite(c.shapeScaleCm)||c.shapeScaleCm<5||c.shapeScaleCm>200||!Number.isFinite(c.strength)||c.strength<0||c.strength>1)throw Error('榕根表面走势配置无效。');}
 return structuredClone(raw);
}
export function validateDirectionCorrections(raw=[]){
 if(!Array.isArray(raw)||raw.length>128)throw Error('方向校正最多128条。');
 for(const g of raw){for(const k of ['start','end']){const h=g?.[k];if(!Number.isInteger(h?.face)||h.face<0||h.face>2000000||!Array.isArray(h.bary)||h.bary.length!==3||h.bary.some(v=>!Number.isFinite(v)||v<0||v>1)||Math.abs(h.bary.reduce((s,v)=>s+v,0)-1)>1e-4)throw Error('方向校正的源面锚点无效。');}if(!Number.isFinite(g.radiusMeters)||g.radiusMeters<.01||g.radiusMeters>20||!Number.isFinite(g.strength)||g.strength<=0||g.strength>1)throw Error('方向校正范围或强度无效。');}
 return structuredClone(raw);
}
