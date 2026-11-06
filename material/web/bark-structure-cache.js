import {validateBarkFlow,validateDirectionCorrections} from './bark-flow-rules.js';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
function identity(mesh,flow,{actualHeightMeters=10,transition=1,corrections=[]}={}){
 const record=validateBarkFlow(flow,mesh.sourceSHA256);
 if(record?.version!==5||!Number.isFinite(actualHeightMeters)||actualHeightMeters<.1||actualHeightMeters>200||!Number.isFinite(transition)||transition<0||transition>3)return null;
 const {summary,...settings}=record;
 return JSON.stringify(stable({source:mesh.sourceSHA256,vertices:mesh.pos.length/3,faces:mesh.indices.length/3,height:mesh.height,min:mesh.min,actualHeightMeters,transition,corrections:validateDirectionCorrections(corrections),settings,sampling:summary?.banyanSampling||null}));
}
// A transient, UV-only snapshot of the field BEFORE material integration. It is
// not a project resource and never enters the renderer or saved document.
export function captureBarkStructure(mesh,field,corrections=[]){
 const uvDirections=field.banyanDirections.slice();
 if(corrections.length)for(let f=0;f<mesh.indices.length/3;f++){
  const n=[0,0,0];for(let c=0;c<3;c++)for(let k=0;k<3;k++)n[k]+=field.growth[mesh.indices[f*3+c]*3+k];
  const length=Math.hypot(...n);if(length>1e-12)for(let k=0;k<3;k++)uvDirections[f*3+k]=n[k]/length;
 }
 return{uvDirections,banyanTypes:field.banyanTypes.slice(),summary:{banyan:{algorithm:field.summary.banyan.algorithm}}};
}
export function bindBarkStructure(mesh,flow,snapshot,options){return{version:1,key:identity(mesh,flow,options),...snapshot};}
export function reuseBarkStructure(mesh,flow,options,snapshot){
 if(!snapshot||snapshot.version!==1)return null;
 const key=identity(mesh,flow,options),count=mesh.indices.length/3;
 if(!key||snapshot.key!==key||!(snapshot.uvDirections instanceof Float32Array)||snapshot.uvDirections.length!==count*3||!(snapshot.banyanTypes instanceof Int8Array)||snapshot.banyanTypes.length!==count||snapshot.summary?.banyan?.algorithm!=='banyan-multiscale-surface-line-prototype-v1')return null;
 for(const v of snapshot.uvDirections)if(!Number.isFinite(v))return null;
 for(const v of snapshot.banyanTypes)if(v< -1||v>3)return null;
 // Own the receiving task's buffers; a UV task cannot change its source cache.
 return{uvDirections:snapshot.uvDirections.slice(),banyanTypes:snapshot.banyanTypes.slice(),summary:structuredClone(snapshot.summary),structureReused:true};
}
