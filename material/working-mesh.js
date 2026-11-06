import {hashUV} from './model.js';
import {verifySurfacePreserved} from './mesh-codec.js';
export async function applyUvResult(input,result,{mode='unwrap',revision=1}={}){
  verifySurfacePreserved(input,result);const n=result.pos.length/3,copy=(data,size)=>{const out=new Float32Array(n*size);for(let i=0;i<n;i++)for(let c=0;c<size;c++)out[i*size+c]=data[result.sourceIndices[i]*size+c];return out;};
  const extraAttributes={};for(const [key,value]of Object.entries(input.extraAttributes||{}))extraAttributes[key]={components:value.components,data:copy(value.data,value.components)};
  const sourceIndices=Uint32Array.from(result.sourceIndices,i=>input.sourceIndices?input.sourceIndices[i]:i);
  return {...input,...result,sourceIndices,sourceUV:copy(input.sourceUV||input.uv,2),ao:copy(input.ao||new Float32Array(input.pos.length/3).fill(1),1),...(input.growth?{growth:copy(input.growth,3)}:{}),...(input.regionMasks?{regionMasks:copy(input.regionMasks,6)}:{}),extraAttributes,uvSHA256:await hashUV(result),uvRevision:revision,uvMode:mode,tangentMethod:'MikkTSpace'};
}
// Rehydrate a saved result whose xrefs refer directly to the source model.
export async function restoreWorkingMesh(source,result,meta={}){
  const n=result.pos.length/3;if(result.indices.length!==source.indices.length)throw Error('工程网格面数与源模型不一致。');
  for(let c=0;c<result.indices.length;c++){const i=result.indices[c],xref=result.sourceIndices[i],expected=source.indices[c];if(xref>=source.pos.length/3||xref!==expected)throw Error('工程网格来源与原始面角不匹配。');for(let k=0;k<3;k++)if(result.pos[i*3+k]!==source.pos[expected*3+k]||result.normal[i*3+k]!==source.normal[expected*3+k])throw Error('工程网格与源表面不一致。');}
  return applyUvResult(source,result,meta);
}
