import {planStructureUnwrap,packStructureUnwrap} from './tree-structure-uv.js';
import {analyzeBarkFlow} from './bark-flow-analysis.js';
import {planTreeUnwrap,packTreeUnwrap,treeGuideMetadata} from './tree-uv.js';
import {validateTreeUvOptions} from './tree-uv-rules.js';
let plan=null;
const arrays=mesh=>[...new Set(['pos','normal','uv','indices','faceGroups','sourceIndices','chartIds','tangent'].filter(key=>mesh?.[key]).map(key=>mesh[key].buffer))];
function verifySource(mesh,source){if(mesh.sourceSHA256!==source.sourceSHA256||mesh.indices.length!==source.indices.length)throw Error('树形UV分析源与当前工作模型不一致。');for(let c=0;c<mesh.indices.length;c++)for(let k=0;k<3;k++)if(mesh.pos[mesh.indices[c]*3+k]!==source.pos[source.indices[c]*3+k]||mesh.normal[mesh.indices[c]*3+k]!==source.normal[source.indices[c]*3+k])throw Error('树形UV源表面与工作副本不一致。');}
self.onmessage=async({data})=>{try{
 if(data.operation==='prepare'){const config=validateTreeUvOptions(data.options.treeOptions);verifySource(data.mesh,data.source);const flow=data.options.flow||analyzeBarkFlow(data.source,{quality:config.quality,algorithm:config.algorithm!=='legacy'?'banyan':'legacy'},p=>self.postMessage({id:data.id,progress:{phase:p.phase,progress:p.progress}}));plan=(config.algorithm!=='legacy'?planStructureUnwrap:planTreeUnwrap)(data.mesh,{...data.options,treeOptions:config,flow},{source:data.source,onProgress:p=>self.postMessage({id:data.id,progress:p})});plan.metadata=await treeGuideMetadata(flow,data.options.flow?'accepted':'automatic');self.postMessage({id:data.id,result:{mesh:config.algorithm!=='legacy'?plan.input:plan.fallback.mesh,stats:plan.stats}},arrays(config.algorithm!=='legacy'?plan.input:plan.fallback.mesh));
 }else if(data.operation==='pack'){if(!plan)throw Error('树形UV计划已失效。');const result=(plan.config.algorithm!=='legacy'?packStructureUnwrap:packTreeUnwrap)(plan,data.nativeResult,{onProgress:progress=>self.postMessage({id:data.id,progress:{phase:plan.config.algorithm!=='legacy'?'缝合并打包树结构UV':'打包树形UV',progress}})});plan=null;self.postMessage({id:data.id,result},arrays(result));
 }else throw Error('未知树形UV操作。');
}catch(error){plan=null;self.postMessage({id:data.id,error:error.message});}};
