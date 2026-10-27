export function createAssetOrganizer() {
  let items={},disk=false;
  const fallbackKey='tree-duck-asset-organizer-v1';
  async function request(url,options){const r=await fetch(url,options);if(r.status===404)return null;const value=await r.json();if(!r.ok)throw Error(value.message||'素材管理记录失败');return value;}
  const ready=request('/api/asset-organizer').then(value=>{disk=!!value;if(value)items=value.items||{};else try{items=JSON.parse(localStorage.getItem(fallbackKey)||'{}');}catch{items={};}});
  const get=id=>items[id]||{favorite:false,tags:[],lastUsed:0};
  async function update(id,patch){await ready;const current=get(id),next={...current,...patch};next.tags=[...new Set((next.tags||[]).map(t=>String(t).trim()).filter(Boolean))].slice(0,12).map(t=>t.slice(0,24));
    if(disk){const value=await request('/api/asset-organizer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...next})});if(!value)throw Error('素材管理服务不可用');}
    else localStorage.setItem(fallbackKey,JSON.stringify({...items,[id]:next}));items={...items,[id]:next};return next;}
  return {ready,get,update,use:id=>update(id,{lastUsed:Date.now()}),async dependencies(id){await ready;const result=await request('/api/asset-dependencies?id='+encodeURIComponent(id));if(!result)throw Error('保存工程引用检查需要桌面后台服务');return result;}};
}
