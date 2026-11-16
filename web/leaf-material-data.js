// Large immutable PNG strings recur in every source-material variant. Cache
// validation by the original payload, with a bounded retention budget.
const pngCacheBudget=64*1024*1024;
const validPngs=new Map();let validPngBytes=0;
function png(value){
  if(typeof value!=='string'||value.length>96000000)return '';
  if(validPngs.has(value))return value;
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))return '';
  if(value.length<=pngCacheBudget){while(validPngBytes+value.length>pngCacheBudget&&validPngs.size){const first=validPngs.keys().next().value;validPngBytes-=first.length;validPngs.delete(first);}validPngs.set(value,true);validPngBytes+=value.length;}
  return value;
}
// An opaque canvas export is true-color PNG without alpha or a color key.
// Read the headers only, so restoring a large atlas does not decode all pixels.
function isOpaqueAtlasPng(data) {
  if (!data) return false;
  const start=data.indexOf(',')+1;
  const header=(offset,length)=>{
    const group=Math.floor(offset/3), skip=offset%3;
    return atob(data.slice(start+group*4,start+Math.ceil((offset+length)/3)*4)).slice(skip,skip+length);
  };
  try {
    const info=header(0,26);
    if(info.slice(0,8)!=='\x89PNG\r\n\x1a\n'||info.slice(12,16)!=='IHDR'||info.charCodeAt(25)!==2)return false;
    for(let offset=33;start+offset*4/3<data.length;){
      const chunk=header(offset,8);
      if(chunk.length!==8)return false;
      const type=chunk.slice(4),length=((chunk.charCodeAt(0)*256+chunk.charCodeAt(1))*256+chunk.charCodeAt(2))*256+chunk.charCodeAt(3);
      if(type==='tRNS'||type==='IEND')return false;
      if(type==='IDAT')return true;
      offset+=length+12;
    }
  } catch {}
  return false;
}
export function normalizeLeafMaterial(raw = {}) {
  // A detailed embedded 4K PNG can exceed the former 24 MB base64 limit.
  const map = png;
  const clamp = (value, fallback) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const color = map(raw?.color);
  const merge = raw?.merge_unit_materials === true && isOpaqueAtlasPng(color);
  return { color, ...(merge ? { merge_unit_materials: true } : {}), normal: map(raw?.normal), color_name: String(raw?.color_name || '').slice(0, 160), normal_name: String(raw?.normal_name || '').slice(0, 160), cutoff: clamp(raw?.cutoff, .4), roughness: clamp(raw?.roughness, .72) };
}
export function leafTextureFiles(material, prefix, kind = 'leaf') {
  const m = normalizeLeafMaterial(material);
  return ['color', 'normal'].filter((key) => m[key]).map((key) => ({ key, name: `${prefix}.${kind}-${key}.png`, base64: m[key].split(',')[1] }));
}

// The three shoot roles use tinted clones of M_Leaf. Those clones are created
// before the PNG finishes loading, so bind the same texture to each leaf mesh.
export function sampleLeafMaterial(sample, library, fallback) {
  const seen = new Set();
  while (sample) {
    if (sample.authoring?.leaf_material) return sample.authoring.leaf_material;
    const id = sample.material_asset_id;
    if (!id || seen.has(id)) break;
    seen.add(id); sample = library.find(item => item.id === id)?.sample;
  }
  return fallback;
}

export function sampleLeafMaterialName(id, texture, base) {
  // Preserve the established single-atlas M_Leaf slot for existing UE exports.
  if (['color','normal','cutoff','roughness'].every(key=>texture?.[key]===base?.[key])) return 'M_Leaf';
  return 'M_Leaf_' + String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function syncLeafMaterialVariants(asset, bindSample, {skip=null}={}) {
  const base = asset?.materials?.leaf;
  const foliage = asset?.group;
  if (!base || !foliage) return [];
  const visited = new Set();
  const pending = [];
  foliage.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || material === base || visited.has(material)||skip?.has(material)) continue;
      if (material.sampleLeafMaterial) {
        visited.add(material);
        if (bindSample) pending.push(bindSample(material, material.sampleLeafMaterial));
        continue;
      }
      if (material.name !== base.name) continue;
      visited.add(material);
      material.map = base.map;
      material.normalMap = base.normalMap;
      material.alphaTest = base.alphaTest;
      material.roughness = base.roughness;
      material.color.set(material.vegetationTint || '#ffffff');
      material.needsUpdate = true;
    }
  });
  return pending;
}
