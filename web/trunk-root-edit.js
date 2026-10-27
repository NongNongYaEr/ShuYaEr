// Existing buttress recipe fields only. UI selections and gesture snapshots
// never enter authoring or the UE/PVE interchange format.
export const TRUNK_ROOT_FIELDS=Object.freeze({
  length:{label:'伸出倍率',min:0,max:6,step:.01},
  angle:{label:'绕干方向 °',min:0,max:360,step:.1},
  width:{label:'展开角度 °',min:4,max:90,step:.1},
  height:{label:'沿干范围 %',min:2.5,max:100,step:.1},
});
export const TRUNK_ROOT_MODES=Object.freeze(['length','angle','width','height']);
const wrap=a=>(a%360+360)%360;
export function selectTrunkRoots(items,current,incoming,mode='REPLACE'){
  const valid=new Set(items.map(p=>p.id)),ids=new Set(mode==='REPLACE'?[]:current.filter(id=>valid.has(id)));
  for(const id of incoming)if(valid.has(id))mode==='SUBTRACT'?ids.delete(id):ids.add(id);
  return items.filter(p=>ids.has(p.id)).map(p=>p.id);
}
export function rootFieldValue(root,field){return field==='height'?root.height*100:root[field];}
export function editTrunkRootGroup(items,ids,field,delta){
  const spec=TRUNK_ROOT_FIELDS[field],chosen=new Set(ids),roots=items.filter(p=>chosen.has(p.id));
  if(!spec||!roots.length||!Number.isFinite(delta))return {updates:[],delta:0,limited:false};
  const applied=field==='angle'?delta:Math.max(Math.max(...roots.map(p=>spec.min-rootFieldValue(p,field))),Math.min(Math.min(...roots.map(p=>spec.max-rootFieldValue(p,field))),delta));
  return {delta:applied,limited:Math.abs(applied-delta)>1e-9,updates:roots.map(p=>{
    const before=rootFieldValue(p,field),value=field==='angle'?wrap(before+applied):before+applied;
    return {id:p.id,[field]:Math.abs(applied)<1e-10||field==='angle'&&Math.abs(applied%360)<1e-10?p[field]:field==='height'?value/100:value};
  })};
}
export function rootAngleDelta(from,to){return ((to-from+180)%360+360)%360-180;}

export function trunkSelectionContext({region='SECTION',roots={},selectionScope='POINTS',section,sections=[],selectedSectionIds=[],contourScope='BASE',wholeTool='POINT',points={},mode='PROFILE'}={}){
  if(region==='ROOT'){
    if(roots.field==='root_flare')return {kind:'ROOT_BASE',count:1,label:'根盘 · 整体展开',constraint:'形状约束：基部膨大',pivot:'基准：本枝基部半径',influence:'仅调整根盘膨大；板根与截面参数保持'};
    const count=(roots.selectedIds||[]).length;
    return {kind:'ROOT',count,label:count?'已选 '+count+' 条板根':'未选板根',constraint:roots.mode==='height'?'形状约束：沿干范围':'形状约束：基部截面',pivot:'基准：本枝根部',influence:count?'只修改所选板根；截面与其他板根参数保持':'点击根部标记或列表选板根',operation:TRUNK_ROOT_FIELDS[roots.field||roots.mode]?.label||'板根形状',transformReason:'当前板根挂接与朝向尚未独立；请用伸出、方向、展开和沿干范围形状手柄'};
  }
  const index=sections.findIndex(p=>p.id===section?.id),name=section?'截面 '+(index+1):'未选截面',ring=selectionScope==='RING',count=ring?selectedSectionIds.length:points.selectedCount||0,child=contourScope==='FINAL';
  return {kind:ring?'RING':'POINTS',count,label:ring?name+' · 已选 '+count+' 圈':name+' · 已选 '+count+' 个'+(child?'子点':'主点'),constraint:ring?'移动：沿树干':'移动：当前截面',pivot:ring?'旋转／缩放：各自圈中心':points.selectedCount===1?'旋转／缩放：截面中心':'旋转／缩放：选点中心',influence:ring?'仅所选控制圈；圈间表面保持连接':wholeTool==='SOFT'?'柔和推拉已开启 · 浅色邻点也会跟随':child?'精确：只动选点，主点保持':'精确主点：子点随大形变化',operation:points.transform?points.transform.action==='ROTATE'?'旋转':'缩放':points.move?'移动':mode==='TWIST'?'整圈扭转':'',transformReason:count?'':'先点选或拖空白框选，不会隐式操作整枝'};
}
