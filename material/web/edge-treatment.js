// Coverage processing only: never blurs material images, normals or geometry.
export const EDGE_DEFAULTS={version:2,blurCm:0,spreadCm:0,amount:1,resolution:512};
export const EDGE_FIELDS={blurCm:{label:'模糊半径',min:0,max:20,step:.1,unit:'cm'},spreadCm:{label:'扩张 / 收缩',min:-10,max:10,step:.1,unit:'cm'},amount:{label:'柔化程度',min:0,max:1,step:.01}};
export const EDGE_PRESETS={soft:{name:'轻柔边缘',version:2,blurCm:3,spreadCm:0},diffuse:{name:'向外柔散',version:2,blurCm:6,spreadCm:1},shrink:{name:'收缩柔边',version:2,blurCm:3,spreadCm:-1}};
export function validateEdgeTreatment(raw){if(raw==null)return null;if(!raw||typeof raw!=='object'||Array.isArray(raw)||![1,2].includes(raw.version))throw Error('边缘处理配置无效。');const p={...EDGE_DEFAULTS,version:raw.version};for(const[k,v]of Object.entries(raw)){if(k==='version')continue;if(k==='resolution'){if(![256,512,1024].includes(v))throw Error('边缘滤波精度无效。');}else if(!EDGE_FIELDS[k]||!Number.isFinite(v)||v<EDGE_FIELDS[k].min||v>EDGE_FIELDS[k].max)throw Error('边缘处理参数超出范围。');p[k]=v;}return p;}
export const edgeTreatmentActive=p=>!!p&&p.amount>0&&(p.blurCm>0||p.spreadCm!==0);
