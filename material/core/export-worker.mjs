import {measureUvClearance} from '../uv-clearance.js';
import {validatePartMaterials} from '../part-materials.js';
import {validateParts} from '../surface-parts.js';
import {inspectPNG} from '../png-data.js';
import {parentPort,workerData} from 'node:worker_threads';import {createProjectStore} from './project-store.mjs';import {parseBakePayload,exportTextures} from './texture-export.mjs';
import {loadExportMesh} from './export-mesh.mjs';
try{const {root,payload,stageDirectory}=workerData,b=Buffer.from(payload),{meta}=parseBakePayload(b),store=createProjectStore({root}),{mesh,source}=await loadExportMesh(meta,store);
  meta.referenceDataInfo={};for(const [key,target]of [['height','heightMap'],['roughness','roughMap'],['normal','normalMap']])if(meta.resources?.[key]){const data=store.get(meta.resources[key]),info=inspectPNG(data,key);meta.referenceDataInfo[target]={width:info.width,height:info.height,bitDepth:info.bitDepth,dataSpace:'linear-raw'};}
  const partReferenceDataInfo={};for(const entry of validatePartMaterials(meta.partMaterials,validateParts(meta.parts,meta.sourceSHA256))){const output=partReferenceDataInfo[entry.partId]={};let aspect=null;for(const channel of ['bark','height','roughness','normal'])if(entry.refs[channel]){const info=inspectPNG(store.get(entry.refs[channel]),channel==='bark'?'height':channel);if(channel==='bark')aspect=info.width/info.height;else if(Math.abs(info.width/info.height-aspect)>Math.max(1e-6,aspect*1e-4))throw Error('部位数据图与颜色比例不一致。');output[{bark:'bark',height:'heightMap',roughness:'roughMap',normal:'normalMap'}[channel]]={width:info.width,height:info.height,bitDepth:info.bitDepth,dataSpace:channel==='bark'?'sRGB':'linear-raw'};}}
  // Pass verified reference metadata separately; do not duplicate the 4K pixel body.
  parentPort.postMessage({ready:exportTextures(b,{root,mesh,source,deferCommit:true,stageDirectory,referenceDataInfo:meta.referenceDataInfo,partReferenceDataInfo,uvClearanceReport:mesh?measureUvClearance(mesh):null})});
}catch(e){parentPort.postMessage({error:e.message});}
