import * as T from './vendor/three.module.min.js';
import {trunkCalibrationMatrix} from './imported-trunk-data.js';
import {recalibrateTrunk} from './trunk-preparation-data.js';
// A gesture changes the calibration frame, never the fixed GLB vertices.
export function transformTrunkCalibration(model,{translation=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(1,1,1)}={}){
 if(!(scale.x>0)||Math.abs(scale.x-scale.y)>1e-8||Math.abs(scale.x-scale.z)>1e-8)throw Error('模型校准使用等比缩放；整树中可单独调整高度');
 const positioning=Math.abs(rotation.x)+Math.abs(rotation.y)+Math.abs(rotation.z)<1e-12&&Math.abs(scale.x-1)<1e-12;
 if(positioning&&translation.lengthSq()===0)return model;
 const matrix=new T.Matrix4().compose(translation,rotation,scale).multiply(trunkCalibrationMatrix(model.calibration)),inverse=matrix.clone().invert(),factor=new T.Vector3().setFromMatrixScale(matrix).x,rawLength=new T.Vector3(...model.calibration.tip).distanceTo(new T.Vector3(...model.calibration.base));
 if(rawLength*factor<.001||rawLength*factor>1000)throw Error('校准长度需在 1 毫米至 1000 米内');
 const next={base:new T.Vector3().applyMatrix4(inverse).toArray(),tip:new T.Vector3(0,0,rawLength*factor).applyMatrix4(inverse).toArray(),front:new T.Vector3(0,1,0).transformDirection(inverse).toArray(),scale:factor};
 const result=recalibrateTrunk(model,next,{anchorRoot:false});
 // G positions the mesh against a stationary control skeleton. Rotating and
 // calibrating physical size retain the established aligned-frame semantics.
 return positioning?{...result,guides:model.guides}:result;
}
