import test from 'node:test';
import assert from 'node:assert/strict';
import { editableProjectCopy, projectBinding, activeProject } from '../web/project-library-data.js';

test('binding follows actual active instance/slot references rather than library or recipe tags',()=>{
  const doc={authoring:{recipe:{tags:['PLATANUS_FINISHED_SAMPLE_SHOOTS_V19']},branch_library:[{id:'FINISHED_CELTIS_SIDE_MATURE_V1'}]}};
  assert.equal(projectBinding(doc),'none');
  doc.authoring.branch_instances=[{asset_id:'CELTIS_SIDE'}];assert.equal(projectBinding(doc),'legacy');
  doc.authoring.workbench={assembly_slots:{inner:['FINISHED_CELTIS_SIDE_MATURE_V1']}};assert.equal(projectBinding(doc),'mixed');
  doc.workspaces={active:'TREE',tree:{authoring:{branch_instances:[{asset_id:'FINISHED_CELTIS_SIDE_MATURE_V1'}]}}};assert.equal(projectBinding(doc),'new');
});
test('template copies preserve authored geometry, seed, textures, and attachments without changing the original',()=>{
  const branch={settings:{object_name:'原始灌木',seed:442},authoring:{branch_shape:{branches:[{stableId:'A',points:[[1,2,3]]}]},leaf_material:{color:'data:image/png;base64,same'},branch_instances:[{asset_id:'OLD',id:'i1'}]},leaf_meshes:[{id:'L',geometry:{positions:[1,2,3]}}],history:[{}]};
  const original={...structuredClone(branch),workspaces:{active:'BRANCH',branch:structuredClone(branch)}};
  const before=structuredClone(original),copy=editableProjectCopy(original,'TREE');
  assert.deepEqual(original,before);assert.equal(copy.workspaces.active,'TREE');
  assert.equal(activeProject(copy).settings.object_name,'原始灌木_副本');assert.equal(activeProject(copy).settings.seed,442);
  assert.deepEqual(activeProject(copy).authoring,branch.authoring);assert.deepEqual(activeProject(copy).leaf_meshes,branch.leaf_meshes);
  assert.equal(activeProject(copy).history,undefined);
});
