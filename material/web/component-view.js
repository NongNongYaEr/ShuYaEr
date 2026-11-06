import {cameraBasis,cameraCenter} from './blender-navigation.js';
const zUp=p=>[p[0],-p[2],p[1]],yUp=p=>[p[0],p[2],-p[1]];
export function readComponentView(renderer){
 if(!renderer?.model)return null;const {model:m}=renderer,target=cameraCenter(renderer).map((v,i)=>v*m.height+m.min[i]),back=cameraBasis(renderer).back;
 return {version:1,eye:zUp(target.map((v,i)=>v+back[i]*renderer.radius*m.height)),target:zUp(target),fov:40,orthographic:!!renderer.orthographic};
}
export function applyComponentView(renderer,value){
 if(!renderer?.model||!value)return false;
 if(![value.eye,value.target].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))throw Error('观察视角无效');
 const eye=yUp(value.eye),target=yUp(value.target),delta=eye.map((v,i)=>v-target[i]),distance=Math.hypot(...delta);if(distance<1e-8)return false;
 renderer.yaw=Math.atan2(delta[0],delta[2]);renderer.pitch=Math.asin(Math.max(-1,Math.min(1,delta[1]/distance)));
 renderer.radius=distance/renderer.model.height*Math.tan((value.fov||36)*Math.PI/360)/Math.tan(Math.PI/9);renderer.focus=target.map((v,i)=>(v-renderer.model.min[i])/renderer.model.height);renderer.pan=[0,0,0];renderer.orthographic=!!value.orthographic;renderer.dirty=true;renderer.onViewChanged?.();return true;
}
