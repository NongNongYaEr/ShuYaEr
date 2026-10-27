// Attribution survives taking an editable copy and removing a package registration.
export function packageOrigins(values=[]){const out=new Map();for(const v of values){if(!v||typeof v!=='object')continue;const item={id:String(v.id||'').slice(0,100),...(v.name?{name:String(v.name).slice(0,100)}:{}),version:String(v.version||'').slice(0,40),digest:String(v.digest||'').slice(0,64),author:String(v.author||'').slice(0,160),license:String(v.license||'').slice(0,2000)};if(item.id&&item.version)out.set(item.id+'@'+item.version+':'+item.digest,item);}if(out.size>1000)throw Error('来源记录超过 1000 项，请拆分资源包');return [...out.values()];}
export function collectPackageOrigins(value){const found=[];function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){if(v.length&&typeof v[0]!=='object')return;for(const x of v)walk(x);return;}for(const [key,x]of Object.entries(v)){if(key==='package_origins')found.push(...(Array.isArray(x)?x:[]));else if(!['geometry','position','normal','uv','index'].includes(key))walk(x);}}walk(value);return packageOrigins(found);}
export function attachPackageOrigins(type,value,origins){const all=packageOrigins([...collectPackageOrigins(value),...origins]);if(!all.length)return value;
  if(type==='plant'){value.authoring.workbench={...value.authoring.workbench,package_origins:all};}
  else if(type==='branch'){for(const v of [value,...(value.versions||[])])if(v.sample)v.sample.package_origins=all;}
  else{value.package_origins=all;if(type==='material'&&value.kind==='bark')value.data={...value.data,package_origins:all};}
  return value;
}
