export const TRUNK_IMPORT_ROUTES=Object.freeze([
 {id:'rig',title:'直接绑定骨骼',summary:'模型、UV 和材质都已准备好',flow:'保留原模型与材质 → 自动骨架与绑定',action:'开始自动骨架与绑定 →'},
 {id:'material',title:'保留模型，只制作材质',summary:'面数和 UV 已合适，需要新的树皮材质',flow:'保留面数与 UV → 走势分析 → 制作材质 → 骨架',action:'分析模型并制作材质 →'},
 {id:'full',title:'高模完整处理',summary:'从高面数模型生成中低模和材质',flow:'按需减面 → 树结构 UV → 走势与材质 → 骨架',action:'一键准备并制作材质 →'}
]);
export function normalizeTrunkRoute(value){return value==='keep'?'rig':value==='new'||value==null?'full':TRUNK_IMPORT_ROUTES.some(r=>r.id===value)?value:(()=>{throw Error('请选择有效的树干处理方式。');})();}
export function trunkRoutePlan(value){const id=normalizeTrunkRoute(value),route=TRUNK_IMPORT_ROUTES.find(r=>r.id===id);return {...route,material:id!=='rig',optimize:id==='full',unwrap:id==='full'};}
export function createTrunkRouteChoice(parent,{value='full',change=()=>{}}={}){
 const group=document.createElement('fieldset');group.className='trunk-route-choice';group.innerHTML='<legend>这棵树需要哪些处理？</legend>';
 const name='trunk-route-'+crypto.randomUUID();
 for(const [i,route]of TRUNK_IMPORT_ROUTES.entries()){const card=document.createElement('label');card.className='trunk-route-card';card.innerHTML=`<input type="radio" name="${name}" value="${route.id}"><span class="trunk-route-index">0${i+1}</span><span><strong>${route.title}</strong><small>${route.summary}</small><em>${route.flow}</em></span><b aria-hidden="true">✓</b>`;group.append(card);}
 parent.append(group);const inputs=[...group.querySelectorAll('input')];let current=normalizeTrunkRoute(value);
 function sync({value=current,disabled=false}={}){current=normalizeTrunkRoute(value);for(const input of inputs){input.checked=input.value===current;input.disabled=disabled;input.closest('label').classList.toggle('selected',input.checked);}}
 group.onchange=event=>{current=normalizeTrunkRoute(event.target.value);sync();change(current);};sync();
 return {element:group,sync,get value(){return current;},dispose(){group.onchange=null;group.remove();}};
}
