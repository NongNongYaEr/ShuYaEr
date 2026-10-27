import {normalizeTrunkForm,createDirectTrunkForm,createTrunkSectionProfile} from './trunk-form.js';

export const isTrunkRootBase=section=>Boolean(section&&Math.abs(section.t)<1e-10);
export const trunkRootBaseSection=form=>(form?.sections||[]).filter(isTrunkRootBase).at(-1)||null;

// The implicit t=0 boundary is already neutral in both existing generators.
// This control is a temporary editing layer until the first actual change.
export function prepareTrunkRootBase(raw){
  const form=normalizeTrunkForm(raw)||createDirectTrunkForm(),existing=trunkRootBaseSection(form);
  if(existing)return {form,section:existing,created:false};
  if(form.sections.length>=24)throw Error('本枝已有 24 个截面，请先移除不需要的截面，再编辑根盘轮廓');
  const ids=new Set(form.sections.map(s=>s.id));let id='ROOT_BASE_SECTION',i=1;while(ids.has(id))id='ROOT_BASE_SECTION_'+(++i);
  const next=form.sections.find(s=>s.t>1e-10),span=Math.max(.03,Math.min(.18,next?.t??.18));
  form.sections.unshift({id,t:0,radius:1,oval:1,roll:0,span,profile:createTrunkSectionProfile(10)});
  const normalized=normalizeTrunkForm(form);return {form:normalized,section:trunkRootBaseSection(normalized),created:true};
}

// An unrelated mesh/branch edit must not serialize a neutral temporary base.
export function omitUnchangedTrunkRootBase(form,temporary){
  if(!temporary)return form;const found=form.sections.find(s=>s.id===temporary.id);
  return found&&JSON.stringify(found)===JSON.stringify(temporary)?{...form,sections:form.sections.filter(s=>s.id!==temporary.id)}:form;
}
