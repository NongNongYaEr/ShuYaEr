// Independent scene-side audit: fingerprint every triangle (position, normal,
// UV, tangent and winding) by owning unit, without using the package writer.
function fingerprintScene(asset,T,foliageInstances=false,projectUv=null) {
 const result={}, f32=new Float32Array(1),bits=new Uint32Array(f32.buffer);
 const branches=new Map(asset.masterBranches.map(b=>[b.stableId,b]));
 const keyFor=id=>{const b=branches.get(id);if(!b)throw Error('Missing scene owner '+id);return b.instanceId?'I:'+b.instanceId:'B:'+b.stableId;};
 const foliageIds=new Set(foliageInstances?asset.masterPlacements.map(p=>p.stableId):[]);
 const owners=asset.elements.map(e=>e.type==='BRANCH'?keyFor(e.id):foliageIds.has(e.id)?'I:'+e.id:null);
 asset.elements.forEach((e,i)=>{if(!owners[i])owners[i]=owners[e.parentIndex];});
 asset.group.updateWorldMatrix(true,true);
 asset.group.traverseVisible(mesh=>{
  if(!mesh.isMesh)return;
  if(mesh.isInstancedMesh)throw Error('Audit requires expanded scene');
  const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,t=g.attributes.tangent,lookup=g.attributes.uv1;
  const direct=mesh.userData.stable_id||(typeof mesh.userData.branch_id==='string'?mesh.userData.branch_id:'');
  const hashes=new Uint32Array(p.count),keys=new Array(p.count),point=new T.Vector3(),normal=new T.Vector3(),tangent=new T.Vector3(),nm=new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for(let i=0;i<p.count;i++){
   keys[i]=direct?keyFor(direct):owners[Math.floor(lookup.getY(i)*asset.lookupTexture.height)*asset.lookupTexture.width+Math.floor(lookup.getX(i)*asset.lookupTexture.width)];
   point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);normal.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();tangent.set(t.getX(i),t.getY(i),t.getZ(i)).transformDirection(mesh.matrixWorld);
   const mapped=projectUv?projectUv(mesh,uv.getX(i),uv.getY(i)):[uv.getX(i),uv.getY(i)];
   let h=2166136261;for(const x of [point.x*100,-point.y*100,point.z*100,normal.x,-normal.y,normal.z,mapped[0],1-mapped[1],tangent.x,-tangent.y,tangent.z,t.getW(i)]){f32[0]=x;h=Math.imul(h^bits[0],16777619);}hashes[i]=h>>>0;
  }
  const count=g.index?.count||p.count;
  for(let j=0;j<count;j+=3){let h=2166136261,key;for(let v=0;v<3;v++){const i=g.index?g.index.getX(j+v):j+v;key=keys[i];h=Math.imul(h^hashes[i],16777619);}const r=result[key]||={triangles:0,sum:0,xor:0};r.triangles++;r.sum=(r.sum+(h>>>0))>>>0;r.xor=(r.xor^h)>>>0;}
 });return result;
}
function fingerprintBinary(r,b) {
 const result={};
 for(const c of r.chunks){const key=c.instance_index<0?'B:'+c.host_branch_id:'I:'+r.instances[c.instance_index].id.replace(/^UNIT_/,'');const hashes=new Uint32Array(c.vertex_count);
  for(let i=0;i<c.vertex_count;i++){let h=2166136261;for(let a=0;a<12;a++)h=Math.imul(h^b.readUInt32LE(c.vertex_offset+i*48+a*4),16777619);hashes[i]=h>>>0;}
  const out=result[key]||={triangles:0,sum:0,xor:0};
  for(let j=0;j<c.index_count;j+=3){let h=2166136261;for(let v=0;v<3;v++)h=Math.imul(h^hashes[b.readUInt32LE(c.index_offset+(j+v)*4)],16777619);out.triangles++;out.sum=(out.sum+(h>>>0))>>>0;out.xor=(out.xor^h)>>>0;}
 }return result;
}
function collapseVineFingerprint(fingerprints,host,id) {
 const result={};
 for(const [key,value] of Object.entries(fingerprints)) {
  const target=key==='B:'+host?key:'I:'+id.replace(/^UNIT_/,''),r=result[target]||={triangles:0,sum:0,xor:0};
  r.triangles+=value.triangles;r.sum=(r.sum+value.sum)>>>0;r.xor=(r.xor^value.xor)>>>0;
 }
 return result;
}
module.exports={fingerprintScene,fingerprintBinary,collapseVineFingerprint};
