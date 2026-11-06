export const emptyCutRules=()=>({version:1,seams:[],protectedFaces:[]});
export function validateCutRules(raw=emptyCutRules()){
  if(raw==null)raw=emptyCutRules();
  if(raw.version!==1||!Array.isArray(raw.seams)||raw.seams.length>4096||!Array.isArray(raw.protectedFaces)||raw.protectedFaces.length>200000)throw Error('接缝/保护规则超出容量或版本无效。');
  const seams=new Set();for(const m of raw.seams){if(!Number.isInteger(m?.face)||m.face<0||m.face>=2000000||!Number.isInteger(m.edge)||m.edge<0||m.edge>2||seams.has(m.face+':'+m.edge))throw Error('接缝标记无效。');seams.add(m.face+':'+m.edge);}
  if(raw.protectedFaces.some(f=>!Number.isInteger(f)||f<0||f>=2000000)||new Set(raw.protectedFaces).size!==raw.protectedFaces.length)throw Error('UV保护范围无效。');return structuredClone(raw);
}
export const hasCutRules=rules=>!!(rules?.seams?.length||rules?.protectedFaces?.length);
