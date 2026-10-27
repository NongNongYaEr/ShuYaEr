import * as THREE from './vendor/three.module.min.js';
// Separate a shared presentation root from its descendants' local transforms.
// Source matrices and CPU picking keep their original complete world matrices.
export function createNativeTransformRetention(getRoot){
 const states=new WeakMap(),identity=new THREE.Matrix4().elements;let root=null,rootState=null;
 function get(object,frame){
  const nextRoot=getRoot();if(nextRoot!==root){root=nextRoot;rootState=root?{root:root.uuid,matrix:identity,revision:0}:null;}
  if(!root||!object)return null;if(object===root)return rootState;
  let state=states.get(object);if(state?.frame===frame)return state.value;
  const parent=get(object.parent,frame);if(!state)states.set(object,state={});state.frame=frame;
  if(!parent){state.value=null;return null;}
  const local=object.matrix.elements;let changed=!state.value||state.root!==parent.root||state.parent!==object.parent||state.parentRevision!==parent.revision;
  if(!changed)for(let i=0;i<16;i++)if(state.local[i]!==local[i]){changed=true;break;}
  if(changed){state.root=parent.root;state.parent=object.parent;state.parentRevision=parent.revision;state.local=local.slice();state.value={root:parent.root,revision:(state.value?.revision||0)+1,matrix:new THREE.Matrix4().fromArray(parent.matrix).multiply(object.matrix).elements};}
  return state.value;
 }
 return {get};
}
