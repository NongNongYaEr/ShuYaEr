// A generator-owned model is retained only with explicit revision, parent/root
// pose and material validation. Unmanaged scene objects keep the normal scan.
const equalMatrix=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function createNativeModelCache(){
 let snapshot=null;
 return {
  clear(){snapshot=null;},
  read({root,revision,epoch,pose,materialIndex}){
   const s=snapshot;if(!s||s.root!==root||s.revision!==revision||s.epoch!==epoch||s.parent!==root.parent||s.poseRoot!==pose.root||!equalMatrix(s.matrix,pose.matrix))return null;
   for(const g of s.groups)if(g.object.parent!==g.parent||g.object.visible!==g.visible||g.object.children!==g.children||g.object.children.length!==g.count)return null;
   for(const m of s.materials){const value=m.material;if(value.visible!==m.visible||value.depthTest!==m.depthTest||value.isShaderMaterial!==m.shader||value.isRawShaderMaterial!==m.raw)return null;if(m.index!==undefined&&materialIndex(value)!==m.index)return null;}
   return s;
  },
  capture({root,revision,epoch,pose,draws,objects,materials,bindings,eligible=true}){
   const groups=[];if(eligible)root.traverse(object=>{if(object===root||object.isGroup||object.children.length)groups.push({object,parent:object.parent,visible:object.visible,children:object.children,count:object.children.length});});
   snapshot=eligible?{root,revision,epoch,parent:root.parent,poseRoot:pose.root,matrix:pose.matrix.slice(),draws:draws.slice(),objects:objects.slice(),materials:materials.map(({material,index})=>({material,index,visible:material.visible,depthTest:material.depthTest,shader:material.isShaderMaterial,raw:material.isRawShaderMaterial})),bindings:new Map(bindings),groups}:null;
   return snapshot;
  },
  matches(previous,draws,bindings){return previous.draws.length===draws.length&&previous.draws.every((draw,i)=>draw===draws[i])&&previous.bindings.size===bindings.size&&[...previous.bindings].every(([key,value])=>bindings.get(key)===value);},
 };
}
