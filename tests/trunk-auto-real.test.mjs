import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
import{readImportedTrunkGlb}from'../web/imported-trunk-glb.js';
import{prepareImportedTrunk}from'../web/imported-trunk-runtime.js';
import{trunkCalibrationMatrix,validateTrunkGuides}from'../web/imported-trunk-data.js';
import{createTrunkAnalysisInput,identifyTrunkSkeleton}from'../web/trunk-auto-skeleton.js';
const root=new URL('../',import.meta.url),file=new URL('测试树干/测试复杂树2.glb',root),exists=fs.existsSync(file);
test('real gnarly trunk preserves its data, yields a central hierarchy and keeps a physical rescale consistent',{skip:!exists},async()=>{
 const bytes=fs.readFileSync(file),sha=createHash('sha256').update(bytes).digest('hex'),model=prepareImportedTrunk(await readImportedTrunkGlb(bytes,{name:path.basename(file.pathname)}));
 const input=createTrunkAnalysisInput(model,trunkCalibrationMatrix(model.calibration)),before=JSON.stringify(input),a=identifyTrunkSkeleton(input,{quality:'standard'});validateTrunkGuides(a.guides);
 assert.equal(model.triangles,15707);assert(a.guides.length>=7&&a.guides.length<=25,JSON.stringify(a.summary));assert(a.summary.control_points<150);assert(a.summary.filled_section_voxels>0);assert.equal(JSON.stringify(input),before);
 const m=input.matrix.map((x,i)=>i===15?x:x*3.6),b=identifyTrunkSkeleton({...input,matrix:m},{quality:'standard'});validateTrunkGuides(b.guides);assert.equal(b.guides.length,a.guides.length);
 for(let i=0;i<a.guides.length;i++){assert.equal(a.guides[i].points.length,b.guides[i].points.length);for(let j=0;j<a.guides[i].points.length;j++)for(let k=0;k<3;k++)assert(Math.abs(b.guides[i].points[j][k]-a.guides[i].points[j][k]*3.6)<1e-6);}
 assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha);
});
