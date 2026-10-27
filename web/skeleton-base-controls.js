import { proposedSkeletonBase, skeletonBranches } from './skeleton-thickness.js';

export function createSkeletonBaseControls(host,api){
  const sizeFields=(prefix,title)=>`<div><small>${title}</small><div class="wb-row"><label>基准直径（cm）<input id="${prefix}Diameter" type="number" min="0.01" max="1000" step="any"></label><label>变化 ±（%）<input id="${prefix}Variation" type="number" min="0" max="90" step="any"></label></div></div>`;
  host.innerHTML=`<label>基部尺寸来源<select id="skeletonThicknessBaseMode"><option value="SOURCE">沿用各枝原基部</option><option value="UNIFORM">本级统一基准</option><option value="LENGTH_GROUPS">按枝长分组</option></select></label>
    <div data-base-uniform>${sizeFields('skeletonBase','本级骨架')}</div>
    <div data-base-groups><label>长短枝分界（m）<input id="skeletonBaseSplit" type="number" min="0.01" max="100" step="any"></label>
      ${sizeFields('skeletonShort','短枝组：长度小于分界')}${sizeFields('skeletonLong','长枝组：长度大于或等于分界')}
      <label>高亮范围<select id="skeletonBaseHighlight"><option value="ALL">本级全部</option><option value="SHORT">短枝组</option><option value="LONG">长枝组</option></select></label></div>
    <small id="skeletonBaseInfo"></small>`;
  const $=id=>host.querySelector('#'+id),mode=$('skeletonThicknessBaseMode'),inputs=[...host.querySelectorAll('input')];
  function visibility(){
    for(const [attribute,visible] of [['data-base-uniform',mode.value==='UNIFORM'],['data-base-groups',mode.value==='LENGTH_GROUPS']]){
      const element=host.querySelector('['+attribute+']');element.hidden=!visible;element.querySelectorAll('input,select').forEach(e=>e.disabled=!visible);
    }
    api.sourceScale.disabled=mode.value!=='SOURCE';api.sourceScale.closest('label').hidden=mode.value!=='SOURCE';
  }
  mode.onchange=()=>{visibility();api.change();};
  $('skeletonBaseHighlight').onchange=()=>api.highlight();
  function load(carriers){
    const context=api.context(),{settings,workbench,level}=context;
    const branches=carriers || context.branches,base=proposedSkeletonBase(branches,settings,workbench,level);
    mode.value=base.mode;$('skeletonBaseSplit').value=base.split_length;
    for(const [prefix,size] of [['skeletonBase',base],['skeletonShort',base.short],['skeletonLong',base.long]]){$(prefix+'Diameter').value=size.diameter_cm;$(prefix+'Variation').value=Number((size.variation*100).toPrecision(6));}
    visibility();
    const targets=skeletonBranches(branches).filter(b=>Math.min(3,b.order)===level),short=targets.filter(b=>b.length<base.split_length).length;
    const band=s=>`${(s.diameter_cm*(1-s.variation)).toFixed(2)}–${(s.diameter_cm*(1+s.variation)).toFixed(2)} cm`;
    $('skeletonBaseInfo').textContent=base.mode==='SOURCE'?'沿用原尺寸会保留原有粗细差距。选择统一基准或按枝长分组，可限制同级差异。':
      (base.mode==='UNIFORM'?`基准范围 ${band(base)}。`:`短枝 ${short} 根：${band(base.short)}；长枝 ${targets.length-short} 根：${band(base.long)}。`)+
      '组内较长略粗、较短略细；变化为 0 时同组同粗。沿枝曲线在此基础上生效。';
  }
  function read(previous){
    if(mode.value==='SOURCE'&&!previous)return undefined;
    const size=prefix=>({diameter_cm:Number($(prefix+'Diameter').value),variation:Number($(prefix+'Variation').value)/100});
    return {mode:mode.value,...size('skeletonBase'),split_length:Number($('skeletonBaseSplit').value),short:size('skeletonShort'),long:size('skeletonLong')};
  }
  function filter(targets,rule){
    if(rule.base?.mode!=='LENGTH_GROUPS')return targets;
    const choice=$('skeletonBaseHighlight').value;
    return targets.filter(b=>choice==='ALL'||(choice==='SHORT'?b.length<rule.base.split_length:b.length>=rule.base.split_length));
  }
  return {inputs,load,read,filter,get highlightKey(){return $('skeletonBaseHighlight').value;}};
}
