import {filterGeometryIndices,inspectGeometry,repairGeometryGLB} from './geometry-repair.js';
import {hashUV,parseGLB} from './model.js';
import {parseSourcePbrGLB} from './source-pbr.js';
import {repairSourcePbrGLB} from './source-pbr-repair.js';
import {analyzeUV} from './uv-analysis.js';
import {buildUvTopology} from './uv-topology.js';
import {restoreWorkingMesh} from './working-mesh.js';

const inspections=new WeakMap();
export function workspaceGeometry(mesh){
 if(!inspections.has(mesh))inspections.set(mesh,inspectGeometry(mesh));
 return inspections.get(mesh);
}

export async function filteredCheckpointMesh(mesh,report){
 const indices=filterGeometryIndices(mesh.indices,report),uvSHA256=await hashUV({uv:mesh.uv,indices});
 return {pos:mesh.pos,normal:mesh.normal,uv:mesh.uv,indices,tangent:mesh.tangent,height:mesh.height,
  extraAttributes:mesh.extraAttributes,tangentMethod:mesh.tangentMethod,sourceSHA256:mesh.sourceSHA256,uvSHA256,
  sourceUvSHA256:mesh.uvSHA256===mesh.sourceUvSHA256?uvSHA256:mesh.sourceUvSHA256};
}

export async function prepareRepairedUVSource(source,working,report,meta){
 const hasSourcePbr=!!source.sourcePbr;
 const bytes=(hasSourcePbr?repairSourcePbrGLB:repairGeometryGLB)(source.sourceBytes,source,report);
 const name=source.name.replace(/\.glb$/i,'').slice(0,160)+'_几何修复.glb';
 const clean=await (hasSourcePbr?parseSourcePbrGLB:parseGLB)(bytes,name);
 if(clean.indices.length!==report.outputTriangles*3||workspaceGeometry(clean).removedFaces)throw Error('清理后仍有退化面，当前工程保持。');
 if(working===source)return {source:clean,input:clean};
 return {source:clean,input:await restoreRepairedWorkingUV(clean,working,report,meta)};
}

export async function restoreRepairedWorkingUV(clean,working,report,meta){
 // The retained face corners identify both the authored UV vertex and the
 // cleaned source vertex, even when a whole source primitive was removed.
 const indices=filterGeometryIndices(working.indices,report);
 const remap=new Int32Array(working.pos.length/3).fill(-1),vertices=[],xrefs=[];
 for(let corner=0;corner<indices.length;corner++){
  const old=indices[corner],xref=clean.indices[corner];
  let vertex=remap[old];
  if(vertex<0){
   vertex=vertices.length;
   remap[old]=vertex;vertices.push(old);xrefs.push(xref);
  }else if(xrefs[vertex]!==xref)throw Error('清理后的 UV 面角映射不一致。');
  indices[corner]=vertex;
 }
 const copy=(array,size,refs)=>Float32Array.from({length:refs.length*size},(_,i)=>array[refs[Math.floor(i/size)]*size+i%size]);
 const result={
  pos:copy(working.pos,3,vertices),normal:copy(clean.normal,3,xrefs),uv:copy(working.uv,2,vertices),
  tangent:copy(working.tangent,4,vertices),chartIds:Int32Array.from(vertices,vertex=>working.chartIds[vertex]),
  sourceIndices:Uint32Array.from(xrefs),atlas:working.atlas,indices,
 };
 return restoreWorkingMesh(clean,result,meta);
}

export function survivingFaceMap(report){
 const map=new Int32Array(report.inputTriangles);
 let deleted=0,output=0;
 for(let face=0;face<map.length;face++){
  if(face===report.faces[deleted]){map[face]=-1;deleted++;}
  else map[face]=output++;
 }
 return map;
}

export function remapUVIslandRules(rules,previous,input,faces){
 if(!rules.pins.length&&!Object.keys(rules.weights).length)return rules;
 const oldIslands=previous.diagnostic.faceIslands;
 const newIslands=analyzeUV(input,{includeFaces:true,sampleSize:64}).faceIslands;
 const pins=new Set(rules.pins),newPins=new Set(),weights={};
 for(let face=0;face<faces.length;face++){
  const nextFace=faces[face];
  if(nextFace<0)continue;
  const old=oldIslands[face],next=newIslands[nextFace];
  if(old<0||next<0)continue;
  if(pins.has(old))newPins.add(next);
  if(rules.weights[old]!=null)weights[next]=rules.weights[old];
 }
 return {...rules,pins:[...newPins],weights};
}

export function rebindRepairedMaterialProject(document,source,faces){
 const next=structuredClone(document),hash=source.sourceSHA256;
 const mapped=face=>faces[face]??-1;
 const indices=list=>list.map(mapped).filter(face=>face>=0);
 const anchor=value=>mapped(value.face)<0?null:{...value,face:mapped(value.face)};
 const anchors=list=>list.map(anchor).filter(Boolean);
 next.sourceName=source.name;
 next.resources={...next.resources,source:hash,working:null,ao:null,uvDensityReference:null};
 if(next.materialBase){
  const slots=new Set(source.sourcePbr.primitives.map(primitive=>primitive.materialIndex));
  next.materialBase.affectedSlots=next.materialBase.affectedSlots.filter(slot=>slots.has(slot));
 }
 next.output.includeModel=true;
 // Optimizer evidence and AO/density/curvature caches describe the previous surface.
 delete next.meshOptimization;
 if(next.sculptMaterial)delete next.sculptMaterial.evidence;
 next.parts.sourceSHA256=hash;
 for(const group of next.parts.groups){group.faces=indices(group.faces);delete group.origin;}
 for(const region of next.regions)region.strokes=anchors(region.strokes);
 for(const area of next.surface.areas){area.sourceSHA256=hash;area.strokes=anchors(area.strokes);}
 delete next.surface.analysis.curvature.preparedFor;
 for(const effect of next.surface.effects){
  if(effect.paint){
   effect.paint.sourceSHA256=hash;
   effect.paint.strokes=effect.paint.strokes.map(stroke=>({...stroke,dabs:anchors(stroke.dabs)})).filter(stroke=>stroke.dabs.length);
  }
  if(effect.manualDecal){
   const nextAnchor=anchor(effect.manualDecal.anchor);
   if(nextAnchor)effect.manualDecal={...effect.manualDecal,sourceSHA256:hash,anchor:nextAnchor};
   else{delete effect.manualDecal;effect.params.burlCount=0;}
  }
  if(effect.manualDecals){
   const surviving=[];
   for(const point of effect.manualDecals){
    const nextAnchor=anchor(point.anchor);
    if(nextAnchor)surviving.push({...point,sourceSHA256:hash,anchor:nextAnchor});
   }
   effect.manualDecals=surviving;
   effect.params.burlCount=surviving.length;
  }
 }
 next.uvCutRules.seams=anchors(next.uvCutRules.seams);
 if(next.uvCutRules.seams.length){
  const topology=buildUvTopology(source);
  // A previously marked edge can become an open boundary when its neighbor is removed.
  next.uvCutRules.seams=next.uvCutRules.seams.filter(({face,edge})=>{
   const retainedEdge=topology.edges[topology.faceEdges[face*3+edge]];
   return retainedEdge?.halves.length!==1;
  });
 }
 next.uvCutRules.protectedFaces=indices(next.uvCutRules.protectedFaces);
 next.directionCorrections=next.directionCorrections.map(guide=>({...guide,start:anchor(guide.start),end:anchor(guide.end)})).filter(guide=>guide.start&&guide.end);
 if(next.barkFlow)next.barkFlow={...next.barkFlow,componentSeed:Math.max(0,mapped(next.barkFlow.componentSeed)),sourceSHA256:hash};
 return next;
}
