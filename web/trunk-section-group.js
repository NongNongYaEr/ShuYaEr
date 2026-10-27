// Group gestures use existing direct fields or a V1 local rotation correction.
// Empty selection never means all sections; no selection state is serialized.
export function selectTrunkSections(sections,current,incoming,mode='REPLACE'){
  const valid=new Set(sections.map(s=>s.id)),ids=new Set(mode==='REPLACE'?[]:current.filter(id=>valid.has(id)));
  for(const id of incoming)if(valid.has(id)){if(mode==='SUBTRACT')ids.delete(id);else ids.add(id);}
  return sections.filter(s=>ids.has(s.id)).map(s=>s.id);
}

// Delete only explicit circle IDs. Keep the nearest surviving circle as the
// editor's context; callers clear the selection so another Delete is harmless.
export function removeTrunkSections(sections,ids,primary,{protectedIds=[]}={}){
  const chosen=new Set(ids),protectedSet=new Set(protectedIds),removed=sections.filter(s=>chosen.has(s.id)&&!protectedSet.has(s.id)).map(s=>s.id),deleted=new Set(removed),remaining=sections.filter(s=>!deleted.has(s.id));
  const ordered=[...sections].sort((a,b)=>a.t-b.t),at=ordered.findIndex(s=>s.id===primary);
  const next=remaining.find(s=>s.id===primary)||ordered.slice(at+1).find(s=>!deleted.has(s.id))||ordered.slice(0,Math.max(0,at)).reverse().find(s=>!deleted.has(s.id))||remaining[0];
  return{sections:remaining,removed,nextId:next?.id||''};
}

export function transformTrunkSectionGroup(sections,ids,action,value,{localRoll=false}={}){
  const chosen=new Set(ids),selected=sections.filter(s=>chosen.has(s.id));
  if(!selected.length||!Number.isFinite(value))return {updates:[],value:0,limited:false};
  let applied=value,key;
  if(action==='SLIDE'){
    key='t';applied=Math.max(Math.max(...selected.map(s=>-s.t)),Math.min(Math.min(...selected.map(s=>1-s.t)),value));
  }else if(action==='RADIUS'){
    key='radius';applied=Math.max(Math.max(...selected.map(s=>.2/s.radius)),Math.min(Math.min(...selected.map(s=>3/s.radius)),value));
  }else if(action==='TWIST'){
    key=localRoll?'roll_offset':'roll';
    if(localRoll)applied=Math.max(Math.max(...selected.map(s=>-3600-(s.roll_offset||0))),Math.min(Math.min(...selected.map(s=>3600-(s.roll_offset||0))),value));
  }
  else return {updates:[],value:0,limited:false};
  const wrap=angle=>{const v=((angle+180)%360+360)%360-180;return v===-180&&angle>0?180:v;};
  return {value:applied,limited:Math.abs(applied-value)>1e-10,updates:selected.map(s=>{
    const before=s[key]||0,next=action==='SLIDE'?s.t+applied:action==='RADIUS'?s.radius*applied:localRoll?before+applied:Math.abs(applied%360)<1e-10?s.roll:wrap(s.roll+applied);
    return {id:s.id,[key]:Math.abs(next-before)<1e-10?before:next};
  })};
}
