import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { normalizeTrunkMeshSettings, createTrunkMeshPreset, createTrunkMeshSampling, trunkRingAngleSegment,
  trunkMeshStats, TRUNK_MESH_VERTEX_LIMIT } from '../web/trunk-mesh-density.js';
import { normalizeTrunkForm, normalizeTrunkForms, createDirectTrunkForm } from '../web/trunk-form.js';
import { createTrunkDetailSampler } from '../web/trunk-details.js';
import { createSweptBranchGeometry, createTrunkFormPreviewGeometry, DEFAULT_SETTINGS, normalizeSettings,
  buildBranchAsset, disposeBranchAsset } from '../web/branch-kernel.js';
import { normalizeAuthoring } from '../web/authoring-state.js';
import { interpolateSectionRing } from '../web/trunk-section-interaction.js';

const settings = normalizeSettings({ ...DEFAULT_SETTINGS, cross_section: 'CIRCLE', surface_roughness: 0,
  groove_depth: 0, knot_strength: 0, leaf_density: 0, junction_collar: false, twist: 0, section_roll: 0 });
const branch = () => ({ id: 0, stableId: 'ROOT', parentId: -1, order: 0, length: 10, startRadius: .5, endRadius: .5,
  points: [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,10)], sections: [], phase: 0, windPhase: .2, windStiffness: 1, children: [] });
const form = (details = [], mesh = createTrunkMeshPreset()) => normalizeTrunkForm({ geometry_version: 2, details, mesh });
const buffers = g => Object.fromEntries(['position','normal','uv','color','index'].map(name=>{
  const a=name==='index'?g.index.array:g.getAttribute(name).array;
  return [name,createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex')];
}));
const detail = type => ({ id: 'D', type, t: 64.5/128, angle: 1.875, height: .02, width: 8, seed: 1 });

test('mesh precision is explicit, bounded, versioned and survives mixed old/direct recipes', () => {
  assert.equal(normalizeTrunkMeshSettings(), null);
  assert.equal(normalizeTrunkMeshSettings({ version: 9 }), null);
  const normalized = normalizeTrunkMeshSettings({ version: 1, radial_segments: 99999, segment_length: -1, detail_samples: 1, adaptive_details: false });
  assert.deepEqual(normalized, { version: 1, radial_segments: 512, segment_length: .005, detail_samples: 8, adaptive_details: false });
  const old = normalizeTrunkForm({ preset: 'BUTTRESS' });
  assert.ok(!Object.hasOwn(old, 'mesh'));
  const explicit = normalizeTrunkForm({ ...old, mesh: createTrunkMeshPreset('FINE') });
  const recipes = normalizeTrunkForms({ branches: { OLD: old, FINE: explicit, DIRECT: createDirectTrunkForm(explicit) } });
  assert.deepEqual(normalizeTrunkForms(JSON.parse(JSON.stringify(recipes))), recipes);
  assert.deepEqual(recipes.branches.OLD, old);
  assert.deepEqual(recipes.branches.DIRECT.mesh, explicit.mesh);
});

test('physical axial spacing scales with real carrier length, not its control-point count', () => {
  const a = branch(), b = branch(); b.length = 20; b.points[1].z = 20;
  const ga = createSweptBranchGeometry({ ...a, trunkForm: form() }, 9, settings);
  const gb = createSweptBranchGeometry({ ...b, trunkForm: form() }, 9, settings);
  try {
    assert.ok(trunkMeshStats(ga).max_axial_spacing <= .08 + 1e-7);
    assert.ok(trunkMeshStats(gb).max_axial_spacing <= .08 + 1e-7);
    assert.ok(gb.userData.radiusRings.length > ga.userData.radiusRings.length * 1.4);
    assert.equal(ga.userData.radiusRings[0].count, 128);
    assert.equal(gb.userData.radiusRings[0].count, 128);
    assert.deepEqual(a.points.map(p => p.toArray()), [[0,0,0],[0,0,10]]);
  } finally { ga.dispose(); gb.dispose(); }
});

function surfaceRadius(g, t, angle) {
  const ring = g.userData.radiusRings[0], direction = new THREE.Vector3(...ring.rolledX).multiplyScalar(Math.cos(angle))
    .addScaledVector(new THREE.Vector3(...ring.rolledY), Math.sin(angle));
  const centre = new THREE.Vector3(0,0,t*10), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, material); mesh.updateMatrixWorld();
  try { const hit = new THREE.Raycaster(centre.clone().addScaledVector(direction, 2), direction.clone().negate()).intersectObject(mesh)[0];
    assert.ok(hit, 'actual triangle hit'); return hit.point.distanceTo(centre); }
  finally { material.dispose(); }
}

test('actual minimum-size groove/knot/scar triangles retain the authored hollow or peak', () => {
  for (const type of ['GROOVE', 'KNOT', 'SCAR']) {
    const d = detail(type), recipe = form([d]), g = createSweptBranchGeometry({ ...branch(), trunkForm: recipe }, 9, settings);
    try {
      const expected = .5 * createTrunkDetailSampler(recipe.details)(d.t, d.angle*Math.PI/180);
      assert.ok(Math.abs(surfaceRadius(g,d.t,d.angle*Math.PI/180)-expected) < 1e-6, type);
      const stats = trunkMeshStats(g); assert.ok(stats.radial_samples > 128); assert.equal(stats.limited, false);
      if (type === 'SCAR') assert.ok(surfaceRadius(g,d.t,d.angle*Math.PI/180) < .5, 'the scar centre stays hollow');
    } finally { g.dispose(); }
  }
});

test('small wrinkles get enough local samples per wave while distant carrier bands retain coarse spacing', () => {
  const d = detail('WRINKLE'), g = createSweptBranchGeometry({ ...branch(), trunkForm: form([d]) }, 9, settings);
  try {
    const ts = g.userData.radiusRings.map(r=>r.t), low = d.t-d.height/2, high = d.t+d.height/2;
    let maxLocal = 0, maxDistant = 0;
    for (let i=1;i<ts.length;i++) {
      if (ts[i-1]>=low-1e-8 && ts[i]<=high+1e-8) maxLocal=Math.max(maxLocal,ts[i]-ts[i-1]);
      if (ts[i]<.3) maxDistant=Math.max(maxDistant,ts[i]-ts[i-1]);
    }
    assert.ok(maxLocal <= d.height/(5*12)+1e-8);
    assert.ok(maxDistant > maxLocal*15);
    assert.ok(ts.length < 400, 'refinement does not apply the smallest wrinkle spacing to the entire branch');
    assert.equal(g.userData.trunkMeshSampling.adaptive_detail_count,1);
  } finally { g.dispose(); }
});

test('refined seam-crossing path stays closed, nondegenerate and keeps UV angles and marker interpolation', () => {
  const b = branch(), recipe = form([{...detail('SCAR'), t:.45, height:.08, width:20,
    path:[{t:.2,angle:350,pressure:.5},{t:.5,angle:0,pressure:1},{t:.7,angle:12,pressure:.8}]}]);
  const g=createSweptBranchGeometry({...b,trunkForm:recipe},9,settings);
  try {
    const p=g.getAttribute('position'), uv=g.getAttribute('uv'), edges=new Map();
    for(const a of Object.values(g.attributes)) assert.ok(Array.from(a.array).every(Number.isFinite));
    const va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3();
    for(let i=0;i<g.index.count;i+=3){const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];
      va.fromBufferAttribute(p,ids[0]);vb.fromBufferAttribute(p,ids[1]);vc.fromBufferAttribute(p,ids[2]);
      assert.ok(vb.sub(va).cross(vc.sub(va)).lengthSq()>1e-16);
      for(let j=0;j<3;j++){const a=ids[j],c=ids[(j+1)%3],key=a<c?`${a}:${c}`:`${c}:${a}`;edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.ok([...edges.values()].every(n=>n===2));
    const r=interpolateSectionRing(g.userData.radiusRings,.417,p);
    assert.ok(r.sampleAngles.length===r.count);
    for(const angle of [0,.01,Math.PI,TAU-.01]){const bracket=trunkRingAngleSegment(r,angle);
      assert.ok(bracket.u>=0&&bracket.u<=1);assert.ok(bracket.i<r.count&&bracket.next<r.count);}
    const first=g.userData.radiusRings[0];
    for(let j=0;j<first.count;j++)assert.ok(Math.abs(uv.getX(first.offset+j)-first.sampleAngles[j]/TAU)<1e-6);
  } finally { g.dispose(); }
});
const TAU=Math.PI*2;

test('precision budgets stay bounded and explicitly report incomplete refinement', () => {
  const b=branch();b.points[1].z=500;b.length=500;
  const plan=createTrunkMeshSampling(b,{...createTrunkMeshPreset('FINE'),radial_segments:512,segment_length:.005},
    [{...detail('WRINKLE'),width:180,path:[{t:0,angle:0},{t:1,angle:179}]}],[0,.5,1]);
  assert.ok(plan.ts.length*plan.angles.length+2<=TRUNK_MESH_VERTEX_LIMIT);
  assert.equal(plan.info.limited,true);assert.equal(plan.ts[0],0);assert.equal(plan.ts.at(-1),1);
  assert.equal(plan.angles[0],0);assert.ok(plan.angles.at(-1)<TAU);
});

test('paused/zero details request no refinement and transport frames do not change with mesh precision', () => {
  const b=branch();b.points=[[0,0,0],[.5,.1,3],[1,-.2,7],[1.2,0,10]].map(p=>new THREE.Vector3(...p));
  const a=createSweptBranchGeometry({...b,trunkForm:form()},9,settings);
  const c=createSweptBranchGeometry({...b,trunkForm:form([{...detail('KNOT'),enabled:false},{...detail('RIDGE'),id:'ZERO',strength:0}])},9,settings);
  const fine=createSweptBranchGeometry({...b,trunkForm:form([],createTrunkMeshPreset('FINE'))},9,settings);
  try {
    // Legacy detail grids are only activated by a nonzero enabled detail.
    assert.deepEqual(buffers(a),buffers(c));
    for(const r of a.userData.radiusRings){const other=fine.userData.radiusRings.find(o=>Math.abs(o.t-r.t)<1e-8);
      if(other)for(const name of ['center','x','y','tangent'])assert.deepEqual(other[name],r[name]);}
  } finally { a.dispose();c.dispose();fine.dispose(); }
});

test('explicit precision keeps legacy contours in the same transported frames at their original rings',()=>{
  const b=branch();b.points=[[0,0,0],[.5,.1,3],[1,-.2,7],[1.2,0,10]].map(p=>new THREE.Vector3(...p));
  const recipe=normalizeTrunkForm({preset:'BUTTRESS',sections:[{id:'OLD',t:.41,radius:1.3,oval:1.2,roll:31,span:.2}]});
  const old=createSweptBranchGeometry({...b,trunkForm:recipe},9,settings);
  const refined=createSweptBranchGeometry({...b,trunkForm:{...recipe,mesh:createTrunkMeshPreset('FINE')}},9,settings);
  try{for(const r of old.userData.radiusRings){const other=refined.userData.radiusRings.find(o=>Math.abs(o.t-r.t)<1e-8);
    assert.ok(other);for(const name of ['center','x','y','tangent','rolledX','rolledY'])assert.deepEqual(other[name],r[name]);}}
  finally{old.dispose();refined.dispose();}
});

test('saved recipes reconstruct the same final mesh as interactive preview at all four LODs', () => {
  const b=branch(), recipe=form([detail('SCAR')]);
  const a=normalizeAuthoring({branch_shape:{branches:[{id:'ROOT',parent:'',points:b.points.map(p=>p.toArray()),length:10,start_radius:.5,end_radius:.5}]},
    workbench:{trunk_forms:{version:2,branches:{ROOT:recipe}}}});
  const reloaded=normalizeAuthoring(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(reloaded.workbench.trunk_forms,a.workbench.trunk_forms);
  for(let lod=0;lod<4;lod++){const asset=buildBranchAsset(settings,null,[],lod,reloaded);let mesh;
    asset.group.traverse(o=>{if(o.userData.stable_id==='ROOT'&&o.userData.category==='branch')mesh=o;});
    const root=asset.masterBranches.find(b=>b.stableId==='ROOT'),preview=createTrunkFormPreviewGeometry(root,settings,recipe,lod);
    try{assert.deepEqual(buffers(preview),buffers(mesh.geometry));}
    finally{preview.dispose();disposeBranchAsset(asset);}
  }
});
