/** Temporary editor selection, keyed by branch/section/layer. Never serialized. */
export function createTrunkPointSelectionMemory(limit=256){
  const records=new Map();
  const filter=(record,valid)=>{const available=new Set(valid),ids=[...new Set(record?.ids||[])].filter(id=>available.has(id));return {ids,primary:ids.includes(record?.primary)?record.primary:ids[0]||''};};
  return {
    remember(key,ids,primary){if(!key)return;records.delete(key);records.set(key,{ids:[...new Set(ids)],primary});while(records.size>limit)records.delete(records.keys().next().value);},
    restore(key,valid){const result=filter(records.get(key),valid);records.delete(key);records.set(key,result);while(records.size>limit)records.delete(records.keys().next().value);return {...result,ids:[...result.ids]};},
    prune(validFor){for(const [key,record] of records){const valid=validFor(key);if(valid===null)records.delete(key);else if(valid)records.set(key,filter(record,valid));}},
    clear(){records.clear();},
  };
}
