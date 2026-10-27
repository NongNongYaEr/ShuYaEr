import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPveGeometry } from '../scripts/pve-geometry-quality.mjs';
const clean = { ok:true, invalid_vertices:0, degenerate_faces:0, missing_uv:0, missing_normals:0, missing_tangents:0, warnings:[] };
const maple = {...clean,ok:false,attachment_overlap_ratio:.273,attachment_overlap_limit:.08,warnings:['附着物重叠率 27.3%，超过 8.0%']};
test('PVE preserves overlap as a named quality warning without changing the report',()=>{
 const before=structuredClone(maple);
 assert.deepEqual(checkPveGeometry(maple,'鸡爪槭'),['鸡爪槭：附着物重叠率 27.3%，超过 8.0%']);
 assert.deepEqual(maple,before);assert.deepEqual(checkPveGeometry(clean,'整树'),[]);
});
test('overlap never excuses invalid vertices, degenerate faces or missing attributes',()=>{
 for(const key of ['invalid_vertices','degenerate_faces','missing_uv','missing_normals','missing_tangents'])assert.throws(()=>checkPveGeometry({...maple,[key]:1},'test'),/几何无效/);
 assert.throws(()=>checkPveGeometry({...clean,ok:false},'test'),/几何无效/);
 assert.throws(()=>checkPveGeometry({...maple,attachment_overlap_ratio:NaN},'test'),/几何无效/);
});
