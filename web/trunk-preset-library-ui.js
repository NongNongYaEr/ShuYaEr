// Personal library navigation is local UI data, never plant authoring data.
const validId=id=>typeof id==='string'&&/^(?:builtin-[a-z0-9_.-]+|(?:section|trunk)-preset-[a-f0-9]{32})$/.test(id);
export function normalizeTrunkPresetPreferences(raw={}){
  const unique=items=>[...new Set((Array.isArray(items)?items:[]).filter(validId))].slice(0,500);
  return {favorites:unique(raw?.favorites),recent:unique(raw?.recent).slice(0,24)};
}
export function filterTrunkPresetRecords(records,{query='',mode='ALL',scope='ALL',category='ALL'}={},preferences={}){
  const prefs=normalizeTrunkPresetPreferences(preferences),needle=query.trim().toLocaleLowerCase();
  const items=records.filter(r=>(!needle||[r.name,r.scopeLabel,r.category,...(r.tags||[])].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle))&&(scope==='ALL'||r.scope===scope)&&(category==='ALL'||r.category===category)&&(mode!=='FAVORITES'||prefs.favorites.includes(r.id))&&(mode!=='RECENT'||prefs.recent.includes(r.id)));
  return mode==='RECENT'?items.sort((a,b)=>prefs.recent.indexOf(a.id)-prefs.recent.indexOf(b.id)):items;
}
export function createTrunkPresetPreferences(kind,{fetch:request=globalThis.fetch,storage=globalThis.localStorage}={}){
  if(!['section','profile','detail','combination','root'].includes(kind))throw Error('预设导航类型无效');
  const url='/api/trunk-preset-preferences?kind='+kind,key='branchforge.trunk-preset-ui.'+kind;
  let data=normalizeTrunkPresetPreferences(),loading,queue=Promise.resolve(),disk=false;
  async function response(options){const res=await request(url,{cache:'no-store',...options});if(res.status===404)return null;const body=await res.json();if(!res.ok||body.success===false)throw Error(body.message||'预设收藏与最近使用读写失败');return body;}
  function load(){return loading||=Promise.resolve().then(async()=>{const result=request?await response():null;disk=Boolean(result);data=normalizeTrunkPresetPreferences(result?result.preferences:JSON.parse(storage?.getItem(key)||'{}'));return data;});}
  function change(fn){const result=queue.catch(()=>{}).then(async()=>{await load();const next=normalizeTrunkPresetPreferences(fn(structuredClone(data)));if(disk){const result=await response({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});if(!result)throw Error('本机预设导航不可用，请重启软件后重试');}else storage?.setItem(key,JSON.stringify(next));data=next;return data;});queue=result;return result;}
  return {load,get data(){return structuredClone(data);},toggle:id=>{if(!validId(id))return Promise.reject(Error('预设身份无效'));return change(p=>({...p,favorites:p.favorites.includes(id)?p.favorites.filter(x=>x!==id):[id,...p.favorites]}));},used:id=>validId(id)?change(p=>({...p,recent:[id,...p.recent.filter(x=>x!==id)]})):Promise.resolve(),remove:id=>change(p=>({favorites:p.favorites.filter(x=>x!==id),recent:p.recent.filter(x=>x!==id)}))};
}
export const trunkPresetFilterMarkup=(prefix,placeholder='搜索预设')=>`<div class="trunk-preset-filters"><input data-${prefix}-search type="search" placeholder="${placeholder}" aria-label="${placeholder}"><select data-${prefix}-filter aria-label="预设筛选"><option value="ALL">全部</option><option value="RECENT">最近使用</option><option value="FAVORITES">收藏</option></select></div>`;
export function trunkDetailPresetThumbnail(shape){
  const details=shape.details||[],reference=details[0]?.angle||0,angle=a=>((a-reference+540)%360)-180;
  const anchors=details.flatMap(d=>d.path?.length?d.path:[d]),angles=anchors.map(p=>angle(p.angle)),heights=anchors.map(p=>p.t);
  const a0=Math.min(...angles),a1=Math.max(...angles),t0=Math.min(...heights),t1=Math.max(...heights),cx=(a0+a1)/2,cy=(t0+t1)/2;
  const aw=Math.max(24,a1-a0,...details.map(d=>d.width))*1.3,th=Math.max(.08,t1-t0,...details.map(d=>d.height))*1.3;
  const xy=p=>[50+(angle(p.angle)-cx)/aw*76,35-(p.t-cy)/th*52];
  const marks=details.map(d=>{const color=['GROOVE','SCAR','WRINKLE'].includes(d.type)?'#95bee2':'#ddb0ed',at=xy(d),path=d.path||[];
    return path.length>1?`<polyline points="${path.map(p=>xy(p).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${Math.min(12,Math.max(2,d.width/aw*50))}" stroke-linecap="round" stroke-linejoin="round"/>`:`<ellipse cx="${at[0]}" cy="${at[1]}" rx="${Math.min(32,Math.max(3,d.width/aw*34))}" ry="${Math.min(23,Math.max(3,d.height/th*23))}" fill="${color}" fill-opacity=".2" stroke="${color}" stroke-width="1.5"/>`;
  }).join('');
  return `<svg viewBox="0 0 100 70" aria-hidden="true"><path d="M50 4V66M4 35H96" stroke="#56565e" stroke-dasharray="2 3"/>${marks}</svg>`;
}
