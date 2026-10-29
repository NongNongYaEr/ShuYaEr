import * as T from './vendor/three.module.min.js';
export const guidePointKey=p=>p.guide+':'+p.index;
export function normalizeGuideSelection(model,items=[]){
 const seen=new Set(),result=[];for(const p of items){const g=model?.guides.find(g=>g.id===p?.guide);if(!g||!Number.isInteger(p.index)||p.index<0||p.index>=g.points.length||seen.has(guidePointKey(p)))continue;seen.add(guidePointKey(p));result.push({guide:p.guide,index:p.index});}return result;
}
export function combineGuideSelection(model,current,items,operation='replace'){
 const next=normalizeGuideSelection(model,items);if(operation==='replace')return next;const keys=new Set(next.map(guidePointKey)),old=normalizeGuideSelection(model,current);return operation==='subtract'?old.filter(p=>!keys.has(guidePointKey(p))):normalizeGuideSelection(model,[...old,...next]);
}
export function guideSelectionCenter(model,items){const selected=normalizeGuideSelection(model,items),center=new T.Vector3();for(const p of selected)center.add(new T.Vector3(...model.guides.find(g=>g.id===p.guide).points[p.index]));return center.multiplyScalar(1/Math.max(1,selected.length));}
// Only explicit selected points change. Child branches and neighbouring points
// do not follow implicitly; source primitives and calibration retain identity.
export function transformGuideSelection(model,items,{translation=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(1,1,1)}={},pivot=guideSelectionCenter(model,items)){
 const keys=new Set(normalizeGuideSelection(model,items).map(guidePointKey));if(!keys.size)throw Error('请先选择控制点');if(![...translation.toArray(),...rotation.toArray(),...scale.toArray()].every(Number.isFinite)||Math.min(...scale.toArray())<=0)throw Error('点位变换数值无效');
 return {...model,guides:model.guides.map(g=>({...g,points:g.points.map((p,index)=>keys.has(guidePointKey({guide:g.id,index}))?new T.Vector3(...p).sub(pivot).multiply(scale).applyQuaternion(rotation).add(pivot).add(translation).toArray():p)}))};
}
export function guidePointsInRectangle(model,camera,bounds,rect){
 const result=[];camera.updateMatrixWorld(true);for(const g of model.guides)for(const [index,point]of g.points.entries()){const p=new T.Vector3(...point).project(camera),x=(p.x+1)*bounds.width/2,y=(1-p.y)*bounds.height/2;if(p.z>=-1&&p.z<=1&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)result.push({guide:g.id,index});}return result;
}
