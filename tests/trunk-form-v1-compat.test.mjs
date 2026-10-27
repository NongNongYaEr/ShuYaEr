import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { normalizeTrunkForm, createTrunkSectionProfile } from '../web/trunk-form.js';
import { createTrunkFormPreviewGeometry, normalizeSettings, DEFAULT_SETTINGS } from '../web/branch-kernel.js';

// Frozen before DIRECT implementation, using the then-current V1 evaluator.
// This is a historical buffer oracle, not two calls to the new implementation.
const OLD_SHA256 = [
  'e2d637940776f8ed0ef28db1282d626013e64fd705d487f9bb2e8063ec3d0feb',
  'e2d637940776f8ed0ef28db1282d626013e64fd705d487f9bb2e8063ec3d0feb',
  '2e973e37886408b8bf55892bb2326eb0be900a5062c2670672c93a3773838972',
  '2e973e37886408b8bf55892bb2326eb0be900a5062c2670672c93a3773838972',
];

test('all four V1 LODs preserve historical bent/profile/buttress/global-effect mesh bytes',()=>{
  const profile=createTrunkSectionProfile(8).map((p,i)=>({...p,radius:[1.3,.85,1.05,1.4,.72,1.15,.91,1.2][i]}));
  const form=normalizeTrunkForm({preset:'BUTTRESS',groove_depth:.28,groove_count:11,root_flare:.31,asymmetry:.14,
    height_start:.08,height_end:.96,sections:[{id:'A',t:.23,radius:1.4,oval:1.2,roll:37,span:.3,profile},
      {id:'B',t:.64,radius:.8,oval:.78,roll:-51,span:.24,profile:profile.map(p=>({...p,angle:(p.angle+13)%360,radius:1/p.radius}))}],
    buttresses:[{id:'R1',angle:19,length:2.2,height:.32,width:13,strength:.9},{id:'R2',angle:207,length:1.7,height:.43,width:24,strength:1.2}]});
  const branch={id:0,stableId:'ROOT',parentId:-1,order:0,length:4,startRadius:.35,endRadius:.13,
    radiusProfile:{points:[[0,1],[.5,.8],[1,1]],interpolation:'LINEAR'},
    points:[[0,0,0],[.21,-.18,1],[.91,.23,2],[1.2,.8,3],[1.5,.65,4]].map(p=>new THREE.Vector3(...p)),
    sections:[{t:0,radius:1,oval:1.2,roll:17},{t:.53,radius:.8,oval:.83,roll:-12},{t:1,radius:1.1,oval:1.1,roll:48}],
    phase:.27,windPhase:.43,windStiffness:1,children:[]};
  const settings=normalizeSettings({...DEFAULT_SETTINGS,radial_segments:9,leaf_density:0,cross_section:'LOBED',
    surface_roughness:.11,lobe_strength:.17,lobe_count:5,groove_depth:.22,groove_count:7,knot_strength:.16,
    twist:23,section_roll:11,adaptive_tessellation:true,junction_collar:false});
  for(let lod=0;lod<4;lod++){
    const geometry=createTrunkFormPreviewGeometry(branch,settings,form,lod),hash=createHash('sha256');
    try{
      for(const [name,attribute] of Object.entries(geometry.attributes)){
        hash.update(name);hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
      }
      hash.update(Buffer.from(geometry.index.array.buffer,geometry.index.array.byteOffset,geometry.index.array.byteLength));
      assert.equal(hash.digest('hex'),OLD_SHA256[lod],`V1 LOD ${lod} historical buffers changed`);
      assert.equal(form.geometry_version,undefined);
    }finally{geometry.dispose();}
  }
});
