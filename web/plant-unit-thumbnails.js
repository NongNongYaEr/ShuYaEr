import {readPackAsset,isPackageAsset} from './plant-pack-client.js';
const ROLES={LEAF:'叶片',FLOWER:'花',FRUIT:'果实',BUD:'花苞'},memory=new Map(),pending=new Map();
let queue=Promise.resolve(),preview=null,host=null;
export function plantUnitThumbnailDirection(unit){
  const p=unit.geometry.position,index=unit.geometry.index,m=Array(9).fill(0),count=index?.length||p.length/3;
  for(let i=0;i+2<count;i+=3){const a=(index?index[i]:i)*3,b=(index?index[i+1]:i+1)*3,c=(index?index[i+2]:i+2)*3,u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]],n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],area=Math.hypot(...n);if(!area)continue;for(let r=0;r<3;r++)for(let col=0;col<3;col++)m[r*3+col]+=n[r]*n[col]/area;}
  let v=[.3,-.55,1];for(let i=0;i<12;i++){const n=[0,1,2].map(r=>m[r*3]*v[0]+m[r*3+1]*v[1]+m[r*3+2]*v[2]),length=Math.hypot(...n);if(length<1e-12)return [.3,-.55,1];v=n.map(x=>x/length);}if(v[0]*.3-v[1]*.55+v[2]<0)v=v.map(x=>-x);return [v[0]+.045,v[1]-.08,v[2]+.15];
}
const enqueue=action=>{const result=queue.catch(()=>{}).then(action);queue=result.catch(()=>{});return result;};
export function representativePlantUnits(pack){return (pack.units||[]).slice(0,64);}
export function plantUnitThumbnailCells(count){const columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns);return Array.from({length:count},(_,i)=>[(i%columns)*512/columns,Math.floor(i/columns)*384/rows,512/columns,384/rows]);}
export async function composePlantUnitThumbnail(pack,images){
  const units=representativePlantUnits(pack);if(!units.length)throw Error('套装中还没有可预览的单元');
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;const ctx=canvas.getContext('2d');ctx.fillStyle='#17221e';ctx.fillRect(0,0,512,384);
  const cells=plantUnitThumbnailCells(units.length);
  for(let i=0;i<units.length;i++){const unit=units[i],src=images.get(unit.id);if(!src)throw Error('单元模型预览尚未完成');const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('单元预览读取失败'));img.src=src;});const [x,y,w,h]=cells[i],caption=Math.min(24,h*.22),scale=Math.min((w-8)/image.width,(h-caption-8)/image.height);ctx.drawImage(image,x+(w-image.width*scale)/2,y+(h-caption-image.height*scale)/2,image.width*scale,image.height*scale);ctx.fillStyle='#bdcdc2';ctx.font=Math.max(8,Math.min(13,w/12))+'px "Segoe UI","Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText((ROLES[unit.role]||'单元')+' '+(i+1)+' · '+(unit.size_m*100).toFixed(1)+' cm',x+w/2,y+h-8,w-8);}
  return canvas.toDataURL('image/png');
}
async function render(pack){
  if(!preview){const {createPlantUnitPreview}=await import('./plant-unit-preview.js');host=document.createElement('div');host.style.cssText='position:fixed;left:-2000px;top:0;width:512px;height:384px;visibility:hidden;pointer-events:none';document.body.append(host);preview=createPlantUnitPreview(host,{cameraDirection:plantUnitThumbnailDirection});}
  const units=representativePlantUnits(pack),images=await preview.load({...pack,units});return composePlantUnitThumbnail(pack,images);
}
export function generatePlantUnitThumbnail(pack){return enqueue(()=>render(pack));}
async function request(id,body){const response=await fetch('/api/plant-unit-thumbnail'+(body?'':'?id='+encodeURIComponent(id)),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...body})}:{cache:'no-store'});const result=await response.json();if(!response.ok||!result.success)throw Error(result.message||'叶花果预览未能保存');return result;}
async function publish(id,sourceKey,thumbnail){const result=await request(id,{sourceKey,thumbnail});memory.set(id+':'+result.sourceKey,thumbnail);document.dispatchEvent(new CustomEvent('plant-unit-thumbnail-ready',{detail:{id,sourceKey:result.sourceKey,thumbnail}}));return thumbnail;}
export async function savePlantUnitThumbnail(id,thumbnail){const source=await request(id);return publish(id,source.sourceKey,thumbnail);}
export function ensurePlantUnitThumbnail(record,{isWanted=()=>true}={}){
  if(record.thumbnail)return Promise.resolve(record.thumbnail);const key=record.id+':'+(record.previewSourceKey||record.revision||1);if(memory.has(key))return Promise.resolve(memory.get(key));
  const existing=pending.get(key);if(existing){existing.wanted.add(isWanted);return existing.promise;}
  const entry={wanted:new Set([isWanted])};entry.promise=(async()=>{const source=await request(record.id);if(record.previewSourceKey&&record.previewSourceKey!==source.sourceKey)throw Error('素材已有更新，请刷新资源');if(source.thumbnail){memory.set(record.id+':'+source.sourceKey,source.thumbnail);return source.thumbnail;}return enqueue(async()=>{if(![...entry.wanted].some(fn=>fn()))return '';const pack=isPackageAsset(record.id)?await readPackAsset(record.id):await fetch('/api/plant-unit?id='+encodeURIComponent(record.id),{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('叶花果模型读取失败');return r.json();});if(!pack.units?.length)return '';const thumbnail=await render(pack);return publish(record.id,source.sourceKey,thumbnail);});})().finally(()=>pending.delete(key));pending.set(key,entry);return entry.promise;
}
export function watchPlantUnitThumbnails(root,records,{isVisible=()=>true,onReady=()=>{},onError=()=>{}}={}){
  let active=true;const rows=new Map(records.filter(r=>r.type==='units').map(r=>[r.id,r]));
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const node=entry.target,record=rows.get(node.dataset.unitPreviewId);if(!record)continue;observer.unobserve(node);const label=node.querySelector('.rc-placeholder span');if(label)label.textContent='正在生成预览…';ensurePlantUnitThumbnail(record,{isWanted:()=>active&&isVisible()&&node.isConnected}).then(thumbnail=>{if(!thumbnail){if(active&&node.isConnected&&label)label.textContent='暂无可预览的单元';return;}record.thumbnail=thumbnail;onReady(record,thumbnail);if(!active||!node.isConnected)return;for(const child of [...node.children])if(!child.classList.contains('rc-type-badge'))child.remove();const img=new Image();img.alt=record.name+' · 真实模型预览';img.draggable=false;img.src=thumbnail;node.prepend(img);}).catch(error=>{if(active&&node.isConnected){if(label)label.textContent='预览暂不可用';node.title=error.message;onError(record,error);}});}});
  for(const node of root.querySelectorAll('[data-unit-preview-id]'))observer.observe(node);return {disconnect(){active=false;observer.disconnect();}};
}
