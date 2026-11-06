import {identifyTrunkSkeleton} from './trunk-auto-skeleton.js';
import {flowComponents,normalizedPositions} from './bark-flow.js';
import {validateBarkFlow,SURFACE_FLOW_DEFAULTS,CONTINUITY_FLOW_DEFAULTS,BANYAN_FLOW_DEFAULTS} from './bark-flow-rules.js';
export function analyzeBarkFlow(mesh,{quality='fast',detail='standard',algorithm='legacy',surface=SURFACE_FLOW_DEFAULTS,continuity=CONTINUITY_FLOW_DEFAULTS,banyan=BANYAN_FLOW_DEFAULTS}={},progress=()=>{}){
 if(!['legacy','surface','metric','continuous','banyan'].includes(algorithm))throw Error('树皮走势算法无效。');
 if(mesh.indices.length/3>250000)throw Error('枝干识别当前支持25万三角面以内。');
 const {groups}=flowComponents(mesh),p=normalizedPositions(mesh),area=faces=>faces.reduce((sum,f)=>{const ids=[0,1,2].map(c=>mesh.indices[f*3+c]*3),a=[0,1,2].map(k=>p[ids[1]+k]-p[ids[0]+k]),b=[0,1,2].map(k=>p[ids[2]+k]-p[ids[0]+k]);return sum+Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);},0),main=groups.map(faces=>({faces,area:area(faces)})).sort((a,b)=>b.area-a.area)[0];if(!main)throw Error('没有可识别的树干表面。');
 const map=new Map(),position=[],index=[];for(const face of main.faces)for(let c=0;c<3;c++){const id=mesh.indices[face*3+c];if(!map.has(id)){map.set(id,map.size);position.push(p[id*3],-p[id*3+2],p[id*3+1]);}index.push(map.get(id));}
 // Right-handed Y-up -> Z-up rotation for the pinned V040 analysis code.
 // Only a temporary copy is transformed; output returns to normalized Y-up.
 const result=identifyTrunkSkeleton({primitives:[{position,index}]},{quality,detail,density:'standard',includeRoots:true},progress),guides=result.guides.map(g=>({...g,points:g.points.map(p=>[p[0],p[2],-p[1]])})),warnings=result.warnings.map(w=>w.includes('试弯曲')?'候选可能误识别树皮沟槽或漏掉细枝，请检查分叉、根部及方向预览后采用。':w);
 if(groups.length>1)warnings.push(`源表面有${groups.length}个独立/歧义边分区，仅识别面积最大的分区；其它部分使用直立投射，不跨接。`);
 const {pitch_m,suggested_root,...summary}=result.summary;
 return validateBarkFlow({kind:'tree-bark-flow',version:algorithm==='banyan'?5:algorithm==='continuous'?4:algorithm==='metric'?3:algorithm==='surface'?2:1,...(algorithm!=='legacy'?{surface:{...surface}}:{}),...(['continuous','banyan'].includes(algorithm)?{continuity:{...continuity}}:{}),...(algorithm==='banyan'?{banyan:{...banyan}}:{}),coordinates:'height-normalized-y-up-v1',sourceSHA256:mesh.sourceSHA256,componentSeed:main.faces[0],guides,summary:{...summary,pitch_in_tree_height:pitch_m,root_height_normalized_y_up:[suggested_root[0],suggested_root[2],-suggested_root[1]],sourceComponents:groups.length,analyzedTriangles:main.faces.length},warnings},mesh.sourceSHA256);
}
