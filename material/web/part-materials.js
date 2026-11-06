const hash=/^[a-f0-9]{64}$/;
export const PART_MATERIAL_CHANNELS=['bark','height','roughness','normal'];
const numbers={physicalWidthMeters:[.02,10],rough:[.2,1],bump:[0,2],reliefMm:[.1,20],detail:[0,1],barkStyle:[0,3],normalStrength:[0,4],barkReliefMm:[0,20],barkCavity:[0,1]};
export function partMaterialSettings(settings,actualHeightMeters){return{physicalWidthMeters:Math.max(.02,Math.min(10,actualHeightMeters/(settings.scale||16))),tint:settings.tint||'#ffffff',rough:settings.rough??.84,bump:settings.bump??.65,reliefMm:settings.reliefMm??3,detail:settings.detail??.35,barkStyle:settings.barkStyle??0,normalStrength:settings.normalStrength??1,barkReliefMm:settings.barkReliefMm??5,barkCavity:settings.barkCavity??.55,normalDirectX:!!settings.normalDirectX,heightWithNormal:!!settings.heightWithNormal};}
export function validatePartMaterials(raw,parts){
 if(raw==null)return[];if(!Array.isArray(raw)||raw.length>8)throw Error('部位材质数量无效。');const ids=new Set();return raw.map(entry=>{
  if(!entry||!parts.groups.some(group=>group.id===entry.partId)||ids.has(entry.partId)||typeof entry.enabled!=='boolean'||!entry.settings||!entry.refs)throw Error('部位材质绑定无效。');ids.add(entry.partId);
  const settings={};for(const [key,[min,max]]of Object.entries(numbers)){const value=entry.settings[key]??({barkReliefMm:5,barkCavity:.55}[key]);if(!Number.isFinite(value)||value<min||value>max||(key==='barkStyle'&&!Number.isInteger(value)))throw Error('部位树皮参数无效。');settings[key]=value;}
  if(!/^#[a-fA-F0-9]{6}$/.test(entry.settings.tint)||['normalDirectX','heightWithNormal'].some(key=>typeof entry.settings[key]!=='boolean'))throw Error('部位法线或色调参数无效。');Object.assign(settings,{tint:entry.settings.tint,normalDirectX:entry.settings.normalDirectX,heightWithNormal:entry.settings.heightWithNormal});
  const refs={};for(const channel of PART_MATERIAL_CHANNELS){const value=entry.refs[channel]??null;if(value!=null&&!hash.test(value))throw Error('部位素材引用无效。');refs[channel]=value;}if(!refs.bark)throw Error('独立部位材质缺少颜色素材。');return{partId:entry.partId,enabled:entry.enabled,settings,refs};
 });
}
export function partMaterialResources(resources,bindings){const result={...resources};for(const key of Object.keys(result))if(/^part_[a-f0-9]{16}_(bark|height|roughness|normal)$/.test(key))delete result[key];for(const entry of bindings)for(const channel of PART_MATERIAL_CHANNELS)if(entry.refs[channel])result['part_'+entry.partId+'_'+channel]=entry.refs[channel];return result;}
export const partTextureKey=refs=>JSON.stringify(PART_MATERIAL_CHANNELS.map(channel=>refs[channel]||null));
// Later parts win, each source face exactly once. Working triangles retain source order.
export function materialDrawGroups(mesh,parts,bindings){
 const enabled=new Map(bindings.filter(entry=>entry.enabled).map(entry=>[entry.partId,entry])),ordered=parts.groups.filter(group=>enabled.has(group.id)),owners=new Int16Array(mesh.indices.length/3).fill(-1),arrays=Array.from({length:ordered.length+1},()=>[]);
 for(let i=0;i<ordered.length;i++)for(const face of ordered[i].faces){if(face<0||face>=owners.length)throw Error('部位材质选面不属于当前模型。');owners[face]=i;}
 for(let face=0;face<owners.length;face++){const dest=arrays[owners[face]+1];for(let c=0;c<3;c++)dest.push(mesh.indices[face*3+c]);}
 return arrays.map((indices,i)=>({partId:i?ordered[i-1].id:null,indices:Uint32Array.from(indices)})).filter(group=>group.indices.length);
}
