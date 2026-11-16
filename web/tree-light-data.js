const sampleBytes=6*Float32Array.BYTES_PER_ELEMENT;
const maxSamples=150000;
const normalized=new WeakSet();
const idPattern=/^[A-Za-z0-9_.-]+$/;

export function packLightTrack(points){
  const bytes=new Uint8Array(points.buffer,points.byteOffset,points.byteLength);
  let text='';
  for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(text);
}

export function unpackLightTrack(text){
  return new Float32Array(Uint8Array.from(atob(text),c=>c.charCodeAt(0)).buffer);
}

export function normalizeTreeLights(raw,imported){
  if(raw==null)return undefined;
  const procedural=raw.kind==='procedural';
  const mount=procedural?null:imported?.mounts.find(m=>m.id===raw.mount&&m.asset_id===raw.asset&&m.revision===raw.revision);
  if(!procedural&&!mount)return undefined;
  if(normalized.has(raw))return raw;
  const fail=()=>{throw Error('工程中的灯带数据无效。');};
  const model=mount&&imported.assets.find(a=>a.id===mount.asset_id&&a.revision===mount.revision);
  const guides=new Set(model?.guides.map(g=>g.id));
  const validGuide=id=>typeof id==='string'&&id.length<=240&&idPattern.test(id)&&(procedural||guides.has(id));
  const params=raw.params;
  const valid=(number,min,max)=>Number.isFinite(number)&&number>=min&&number<=max;
  if(raw.version!==1||!params||!valid(params.bottom,0,10000)||!valid(params.top,params.bottom+1e-8,10000)
    ||!valid(params.pitch,.01,.5)||!valid(params.radius,.0005,.006)||!valid(params.gap,.0002,.015)
    ||params.pitch<params.radius*2||!valid(params.intensity,.1,8)||!/^#[\da-f]{6}$/i.test(params.color)
    ||!['main','major','all','selected'].includes(params.scope)||![1,-1].includes(params.direction)
    ||params.scope==='selected'&&!validGuide(params.selectedGuide)||!valid(raw.ground,-10000,10000)
    ||!/^\d+:[a-f0-9]+$/.test(raw.pose)||!Array.isArray(raw.tracks)||!Array.isArray(raw.replaces))fail();
  const lampIds=new Set(model?.primitives.filter(p=>model.materials[p.material].emissiveFactor?.some(v=>v>0)).map(p=>p.id));
  if(raw.replaces.some(id=>!lampIds.has(id))||raw.replaces.length>lampIds.size)fail();
  let size=0;
  for(const track of raw.tracks){
    if(!track||!validGuide(track.guide)||!valid(track.turns,0,maxSamples)
      ||typeof track.points!=='string'||track.points.length<sampleBytes*2*4/3)fail();
    size+=track.points.length;
    if(size>maxSamples*sampleBytes*4/3||track.points.length%32)fail();
    const data=unpackLightTrack(track.points);
    if(!data.every(v=>Number.isFinite(v)&&Math.abs(v)<10000))fail();
  }
  const source=procedural?{kind:'procedural'}:{mount:raw.mount,asset:raw.asset,revision:raw.revision};
  const value={version:1,...source,pose:raw.pose,ground:raw.ground,
    params:{...params},replaces:[...raw.replaces],tracks:raw.tracks.map(t=>({guide:t.guide,turns:t.turns,points:t.points}))};
  normalized.add(value);
  return value;
}

export function lightPoseKey(guides,ground){
  let count=0,hash=2166136261;
  function add(n){hash=Math.imul(hash^Math.round(n*100000),16777619);count++;}
  add(ground);
  for(const guide of guides){
    add(guide.start_radius);add(guide.end_radius);
    for(const point of guide.points)for(const n of point)add(n);
  }
  return count+':'+(hash>>>0).toString(16);
}

export function normalizeTreeLightFlow(raw){
  const speed=Number.isFinite(raw?.speed)?Math.min(3,Math.max(.05,raw.speed)):.30;
  return {version:1,speed,direction:raw?.direction===-1?-1:1};
}
