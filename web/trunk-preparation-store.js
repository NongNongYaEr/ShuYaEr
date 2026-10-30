async function request(url,options={}){const r=await fetch(url,{cache:'no-store',...options}),v=await r.json();if(!r.ok||v.success===false)throw Error(v.message||'树干整理草稿保存失败');return v;}
export function createTrunkPreparationStore(){return {
 async source(model){const {items}=await request('/api/trunk-preparation-sources'),existing=items.find(i=>i.id===model.id);if(existing)return {id:existing.id,revision:existing.revision};const saved=await request('/api/trunk-preparation-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,expectedRevision:0})});return {id:saved.item.id,revision:saved.item.revision};},
 async remove(id){const {draft}=await this.get(id);if(draft.workbench!=='sculpt')throw Error('仅可删除雕刻草稿');return request('/api/trunk-preparation-draft?id='+encodeURIComponent(id)+'&revision='+draft.revision,{method:'DELETE'});},
 async rename(id,name){const {draft}=await this.get(id);if(draft.workbench!=='sculpt')throw Error('仅可改名雕刻草稿');return this.put({...draft,edits:{...draft.edits,name:String(name).trim().slice(0,80)}});},
 async list(){return (await request('/api/trunk-preparation-drafts')).items;},
 async get(id){const draft=await request('/api/trunk-preparation-draft?id='+encodeURIComponent(id)),model=await request('/api/trunk-preparation-source?id='+encodeURIComponent(draft.sourceId)+'&revision='+draft.sourceRevision);return {draft,model};},
 async put(draft){const result=await request('/api/trunk-preparation-draft?id='+encodeURIComponent(draft.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});return {...draft,revision:result.revision,updatedAt:result.updatedAt};}
};}
