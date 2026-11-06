import * as T from './vendor/three.module.min.js';
import {trunkPoseGeometry} from './imported-trunk-binding.js';
import {TRUNK_WEIGHT_VERTEX_LIMIT,trunkWeightRepairs,withTrunkWeightEdits} from './trunk-weight-data.js';

export function checkTrunkWeightBudget(model){
 const vertices=model.primitives.reduce((sum,p)=>sum+p.geometry.position.length/3,0),triangles=model.primitives.reduce((sum,p)=>sum+p.geometry.index.length/3,0);
 if(vertices>TRUNK_WEIGHT_VERTEX_LIMIT||triangles>500000)throw Error('权重修复支持 25 万顶点、50 万三角面以内的工作网格。');
}

export function trunkBendPose(model,angle){
 const root=model.guides[0],height=Math.max(.001,root.points.at(-1)[2]-root.points[0][2]);
 const bend=Math.tan(angle*Math.PI/180)/(height*2);
 const mount={guide_map:Object.fromEntries(model.guides.map(g=>[g.id,g.id])),binding:'FLEX'};
 const branches=model.guides.map(g=>({stableId:g.id,points:g.points.map(([x,y,z])=>new T.Vector3(x+bend*z*z,y,z)),startRadius:g.start_radius,endRadius:g.end_radius}));
 return {mount,branches};
}

export function scanTrunkWeights(model){
 checkTrunkWeightBudget(model);
 const root=model.guides[0],base=root.points[0][2],height=Math.max(.001,root.points.at(-1)[2]-base);
 const flagged=new Map(),suspects=new Set(),edges=new Map(),manual=trunkWeightRepairs(model);
 const minZ=model.guides.map(g=>Math.min(...g.points.map(p=>p[2])));
 let worst=null,source;
 const highOwner=(primitive,i)=>{
  const z=primitive.geometry.position[i*3+2],guide=primitive.guideIndices[i];
  return guide>0&&z<=base+height*.25&&minZ[guide]-z>height*.3&&!manual.get(primitive.id)?.has(i);
 };
 const length=(position,a,b)=>Math.hypot(position[a*3]-position[b*3],position[a*3+1]-position[b*3+1],position[a*3+2]-position[b*3+2]);
 for(const angle of [8,-8]){
  const {mount,branches}=trunkBendPose(model,angle),result=trunkPoseGeometry(model,mount,branches);
  source=result.pose.source;
  for(const primitive of source.primitives){
   const {position,index}=primitive.geometry,posed=result.primitives.get(primitive.id).position,count=position.length/3;
   if(!flagged.has(primitive.id)){flagged.set(primitive.id,new Set());edges.set(primitive.id,new Set());}
   const tested=new Set(),marks=flagged.get(primitive.id),affected=edges.get(primitive.id);
   for(let f=0;f<index.length;f+=3)for(let corner=0;corner<3;corner++){
    const i=index[f+corner],j=index[f+(corner+1)%3],key=Math.min(i,j)*count+Math.max(i,j);
    if(tested.has(key))continue;
    tested.add(key);
    const before=length(position,i,j),after=length(posed,i,j),delta=after-before;
    if(before<height*.0001||delta<height*.01||after<before*2)continue;
    affected.add(key);marks.add(i);marks.add(j);
    if(!worst||delta>worst.delta)worst={delta,point:[0,1,2].map(k=>(position[i*3+k]+position[j*3+k])/2)};
    if(model.binding?.primitive_guides?.[primitive.id]||primitive.guideIndices[i]===primitive.guideIndices[j])continue;
    for(const v of [i,j])if(highOwner(primitive,v))suspects.add(primitive.guideIndices[v]);
   }
  }
 }
 const edits=new Map();
 for(const primitive of source.primitives){
  if(!suspects.size||model.binding?.primitive_guides?.[primitive.id])continue;
  const items=new Map();
  for(let i=0;i<primitive.guideIndices.length;i++)if(suspects.has(primitive.guideIndices[i])&&highOwner(primitive,i))items.set(i,root.id);
  if(items.size)edits.set(primitive.id,items);
 }
 return {count:[...edges.values()].reduce((sum,items)=>sum+items.size,0),flagged,worst,edits};
}

export function autoRepairTrunkWeights(model,before=scanTrunkWeights(model)){
 const result=withTrunkWeightEdits(model,before.edits);
 if(!result.changed)return {...result,scan:before};
 const after=scanTrunkWeights(result.model);
 if(after.count>=before.count||after.worst?.delta>before.worst.delta)return {model,changed:0,scan:before};
 return {...result,scan:after};
}
