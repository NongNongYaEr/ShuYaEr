import * as THREE from './vendor/three.module.min.js';
import {createMeshPreview} from './tree-sculpt.js';
import {createTrunkFormPreviewJob} from './branch-kernel.js';
import {createGeometryJobClient} from './geometry-job-client.js';
import {createCoalescedGeometryPreview} from './coalesced-geometry-preview.js';
import {computeTrunkGeometry} from './trunk-geometry-compute.js';

// Whole units keep their rigid GPU preview. Rebuild only the edited carrier,
// whose topology now includes the actual bend anchor and local transition rows.
export function createPointCornerPreview(asset,snapshot,root){
  let source;asset.group.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.userData.category==='branch'&&o.userData.stable_id===root.stableId)source=o;});
  const material=source?.material,visible=source?.visible,base=createMeshPreview(asset,snapshot,{targets:new Set([root.stableId]),rigidUnits:true});
  // Imported trunks already deform their original vertices through the skin
  // palette. A procedural tube would hide the sculpted detail and root mesh.
  if(root.importedTrunkHost||source?.userData.imported_trunk){base.updateCarrier=()=>{};return base;}
  let overlay=null,restored=false;
  const queue=createCoalescedGeometryPreview(createGeometryJobClient(),{valid:()=>!restored,
    fallback:computeTrunkGeometry,onError:error=>console.warn('Point preview fallback',error),
    install(geometry){
      const uv1=source.geometry.getAttribute('uv1');if(uv1){const values=new Float32Array(geometry.attributes.position.count*2);for(let i=0;i<values.length;i+=2){values[i]=uv1.getX(0);values[i+1]=uv1.getY(0);}geometry.setAttribute('uv1',new THREE.BufferAttribute(values,2));}
      if(!overlay){overlay=new THREE.Mesh(geometry,material);overlay.matrix.copy(source.matrix);overlay.matrixAutoUpdate=false;overlay.castShadow=source.castShadow;overlay.receiveShadow=source.receiveShadow;overlay.userData.point_corner_preview=root.stableId;source.parent.add(overlay);source.visible=false;}
      else{overlay.geometry.dispose();overlay.geometry=geometry;}
    }});
  const result=Object.assign(Object.create(base),{
    updateCarrier(branch){
      if(!source||restored)return;
      queue.request(createTrunkFormPreviewJob(branch,asset.settings,branch.trunkForm||null,asset.settings.preview_lod,{vertexLimit:48000}));
    },
    restore(){if(restored)return;restored=true;queue.dispose();base.restore();if(overlay){overlay.removeFromParent();overlay.geometry.dispose();overlay=null;}if(source)source.visible=visible;if(asset.activeEditPreview===result)asset.activeEditPreview=null;},
  });
  if(asset.activeEditPreview===base)asset.activeEditPreview=result;
  Object.defineProperty(result,'carrierPreviewStats',{get:()=>queue.stats});
  return result;
}
