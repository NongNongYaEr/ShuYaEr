import {Vector3} from 'three';
import {createSweptBranchGeometry,normalizeSettings} from './branch-kernel.js';
import {prepareBranchBarkSurface} from './branch-bark-surface.js';

// A fixed metre-sized, smooth sample makes presets comparable across projects.
export function createBarkPreviewSample(){
  const points=Array.from({length:49},(_,i)=>{const t=i/48;return new Vector3(.18*Math.sin(t*Math.PI),0,t*3);});
  const branch={id:0,stableId:'BARK_PREVIEW',parentId:-1,order:0,points,controlPoints:points,
    length:points.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(points[i]),0),startRadius:.48,endRadius:.43,
    phase:0,windPhase:0,windStiffness:1,sections:[],children:[]};
  const settings=normalizeSettings({adaptive_tessellation:false,radial_segments:64,surface_roughness:0,
    lobe_strength:0,groove_depth:0,knot_strength:0,junction_flare:0,junction_collar:false,twist:0});
  const geometry=createSweptBranchGeometry(branch,64,settings,{continuousBark:true});
  return {branch,settings,geometry:prepareBranchBarkSurface(geometry,branch,settings)};
}
