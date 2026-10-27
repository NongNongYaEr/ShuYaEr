import * as THREE from './vendor/three.module.min.js';
import {branchMountAt} from './branch-mount-frame.js';

// Shared by the displayed assembly and the geometry-free placement reference.
// Keep the same double-precision operations/order as the original compiler.
export function historySampleShape(instance,shape,matrix,family){
  if(!family.length)return null;
  const inverse=matrix.clone().invert(),ids=new Map(family.map(b=>[b.id,b.stableId.slice(instance.id.length+1)]));
  const scale=new THREE.Vector3().setFromMatrixScale(matrix).x;
  return {...shape,branches:family.map(b=>({id:ids.get(b.id),parent:ids.get(b.parentId)||'',attach:b.parentT,
    points:b.points.map(p=>p.clone().applyMatrix4(inverse).toArray()),knots:b.controlPoints.map(p=>p.clone().applyMatrix4(inverse).toArray()),
    length:b.length/scale,start_radius:b.startRadius/scale,end_radius:b.endRadius/scale,radius_profile:b.radiusProfile,sections:b.sections}))};
}

export function compiledBranchTransform({i,matrix,custom,parent,branchIds,elementIds=new Map()}){
  const scale=new THREE.Vector3().setFromMatrixScale(matrix).x,rotation=new THREE.Matrix3().getNormalMatrix(matrix);
  return local=>({...local,id:branchIds.get(local.id),stableId:i.id+'.'+local.stableId,instanceId:i.id,unitOwner:i.id,mountMatrix:branchMountAt(parent,i.attach),
    parentId:branchIds.get(local.parentId)??parent?.id??-1,parentT:local.parentId<0?i.attach:local.parentT,
    order:Math.min(3,(parent?.order??-1)+1+local.order),shootRole:i.shootRole,
    points:local.points.map(v=>v.clone().applyMatrix4(matrix)),controlPoints:local.controlPoints.map(v=>v.clone().applyMatrix4(matrix)),
    length:local.length*scale,startRadius:local.startRadius*scale*(custom?1:i.radius_scale),endRadius:local.endRadius*scale*(custom?1:i.radius_scale),parentRadius:local.parentRadius*scale*(custom?1:i.radius_scale),
    children:local.children.map(id=>branchIds.get(id)),elementIndex:elementIds.get(local.elementIndex)??-1,
    surfaceNormals:local.surfaceNormals?.map(v=>v.clone().applyMatrix3(rotation).normalize())||null});
}

export function compiledSampleAuthoring(sample,item,authoring,shape,custom,overrides){
  const local={...sample.authoring,branch_shape:shape,branch_library:[],branch_instances:[],
    workbench:{...sample.authoring.workbench,skeleton_thickness:undefined,trunk_forms:undefined},
    recipe:{...sample.authoring.recipe,tags:(sample.authoring.recipe?.tags||[]).filter(t=>!['SAMPLE_FOLIAGE_FROM_LIBRARY','FOLIAGE_ON_INSTANCES_ONLY'].includes(t))},
    tree_organs:{...sample.authoring.tree_organs,units:sample.authoring.tree_organs?.units?.length?sample.authoring.tree_organs.units:authoring.tree_organs.units.filter(u=>item.organ_source_ids.includes(u.id))}};
  if(custom){local.overrides=Object.fromEntries(overrides||[]);local.sculpt_layers=[];local.topology={};}
  return local;
}
