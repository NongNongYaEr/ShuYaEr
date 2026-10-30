const fail=m=>{throw Error('雕刻数据：'+m);};
export function encodeSculptArray(array){const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let s='';for(let i=0;i<bytes.length;i+=24576)s+=String.fromCharCode(...bytes.subarray(i,i+24576));return btoa(s);}
export function decodeSculptArray(text,Type){if(typeof text!=='string'||text.length>128*1024*1024||text.length%4||/[^A-Za-z0-9+/=]/.test(text))fail('编码无效');let s;try{s=atob(text);}catch{fail('编码无效');}const bytes=Uint8Array.from(s,c=>c.charCodeAt(0));if(bytes.byteLength%Type.BYTES_PER_ELEMENT)fail('字节长度无效');return new Type(bytes.buffer);}
export function sculptIndexHash(index){let h=2166136261;for(const n of index){h^=n;h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
export function restoreSculptGeometry(primitives,sculpt){
 if(!sculpt)return primitives;if(sculpt.version!==1||!Array.isArray(sculpt.primitives)||sculpt.primitives.length>primitives.length)fail('格式无效');
 const patches=new Map();for(const p of sculpt.primitives){if(patches.has(p.id))fail('重复网格');patches.set(p.id,p);}if([...patches.keys()].some(id=>!primitives.some(p=>p.id===id)))fail('网格不存在');
 return primitives.map(p=>{const patch=patches.get(p.id);if(!patch)return p;const source=p.geometry,count=source.position.length/3;if(patch.vertices!==count||patch.topology!==sculptIndexHash(source.index))fail('原模型拓扑不匹配');const ids=decodeSculptArray(patch.ids,Uint32Array);if(ids.length>count)fail('顶点过多');const g={...source},seen=new Set();for(const i of ids){if(i>=count||seen.has(i))fail('顶点越界或重复');seen.add(i);}
  for(const [name,size]of [['position',3],['normal',3],['tangent',4]]){const values=decodeSculptArray(patch[name],Float32Array);if(values.length!==ids.length*size||!values.every(Number.isFinite))fail('属性无效');g[name]=source[name].slice();ids.forEach((id,i)=>{for(let k=0;k<size;k++)g[name][id*size+k]=values[i*size+k];});}return {...p,geometry:g};});
}
