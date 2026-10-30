import {restoreSculptGeometry} from './model-sculpt-patch.js';
import * as T from './vendor/three.module.min.js';
import {validateImportedTrunk,validateTrunkGuides,trunkCalibrationMatrix,setTrunkPhysicalLength,pointOnTrunkGuide,closestTrunkGuide} from './imported-trunk-data.js';
export const trunkEditable=model=>({id:model.id,name:model.name,revision:model.revision,calibration:structuredClone(model.calibration),guides:structuredClone(model.guides),binding:structuredClone(model.binding||{}),thumbnail:model.thumbnail||'',...(model.sculpt_parent?{sculpt_parent:structuredClone(model.sculpt_parent)}:{}),physical_size_confirmed:!!model.physical_size_confirmed,...(model.sculpt?{sculpt:structuredClone(model.sculpt),sculptMask:model.sculptMask||''}:{})});
export function restoreTrunkEdits(source,edits){const result={...source,...structuredClone(edits),primitives:restoreSculptGeometry(source.primitives,edits.sculpt)};validateImportedTrunk(result);validateTrunkGuides(result.guides);trunkCalibrationMatrix(result.calibration);return result;}
export function recalibrateTrunk(model,next,{anchorRoot=true}={}){
 const before=trunkCalibrationMatrix(model.calibration),after=trunkCalibrationMatrix(next),matrix=after.clone().multiply(before.invert()),ratio=next.scale/model.calibration.scale;
 const guides=model.guides.map(g=>({...g,points:g.points.map(p=>new T.Vector3(...p).applyMatrix4(matrix).toArray()),start_radius:g.start_radius*ratio,end_radius:g.end_radius*ratio}));
 if(anchorRoot)guides[0].points[0]=[0,0,0];validateTrunkGuides(guides);return {...model,calibration:structuredClone(next),guides};
}
export function resizeTrunk(model,length){return {...recalibrateTrunk(model,setTrunkPhysicalLength(model,length)),physical_size_confirmed:true};}
export function addTrunkGuide(model,{parent=model.guides[0].id,attach=.65}={}){
 const base=model.guides.find(g=>g.id===parent);if(!base)throw Error('请先选择一条父控制枝');if(model.guides.length>=256)throw Error('最多保留 256 条控制枝');
 const frame=pointOnTrunkGuide(base.points,attach),length=base.points.slice(1).reduce((sum,p,i)=>sum+new T.Vector3(...p).distanceTo(new T.Vector3(...base.points[i])),0)*.3;
 let n=0;while(model.guides.some(g=>g.id==='G'+n))n++;const direction=new T.Vector3(1,0,.35).normalize(),points=Array.from({length:5},(_,i)=>frame.position.clone().addScaledVector(direction,Math.max(.01,length)*i/4).toArray()),g={id:'G'+n,parent,attach,points,start_radius:base.start_radius*.4,end_radius:base.end_radius*.25};return {...model,guides:[...model.guides,g]};
}
export function removeTrunkGuide(model,id){if(id===model.guides[0].id)throw Error('主控制骨架不能删除');const removed=new Set([id]);for(const g of model.guides)if(removed.has(g.parent))removed.add(g.id);const guides=model.guides.filter(g=>!removed.has(g.id)),regions={...model.binding?.primitive_guides};for(const [key,ids]of Object.entries(regions)){regions[key]=ids.filter(id=>!removed.has(id));if(!regions[key].length)delete regions[key];}return {...model,guides,binding:{...model.binding,primitive_guides:regions}};}
export function validateTrunkReady(model){validateImportedTrunk(model);validateTrunkGuides(model.guides);trunkCalibrationMatrix(model.calibration);if(!model.name?.trim()||model.name.length>80)throw Error('请输入 1～80 字的树干名称');for(const ids of Object.values(model.binding?.primitive_guides||{}))if(!Array.isArray(ids)||!ids.length||ids.some(id=>!model.guides.some(g=>g.id===id)))throw Error('网格绑定区域引用无效');return model;}
