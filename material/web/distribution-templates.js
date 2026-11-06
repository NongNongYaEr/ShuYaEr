import {switchDistribution} from './distribution-presets.js';
import {defaultBlend} from './material-blend.js';
import {validateSurface} from './surface-effects.js';
import {layerIsLocked} from './surface-layers.js';
// Public recipes, separate from the lower-level distribution algorithms. Height
// interaction uses the existing channel mixer; quantity scatter uses decal data.
import {DISTRIBUTION_TEMPLATES} from './distribution-template-rules.js';
export {DISTRIBUTION_TEMPLATES,validatePublicDistribution} from './distribution-template-rules.js';
export function applyDistributionTemplate(document,effectId,templateId){
 const template=DISTRIBUTION_TEMPLATES.find(t=>t.id===templateId);if(!template)throw Error('公共分布模板不存在。');
 const original=document.surface.effects.find(e=>e.id===effectId);if(!original||(original.paint||original.manualBrush)||layerIsLocked(document.surface,effectId))throw Error('请选择并解锁自动效果层。');
 if(template.decal&&original.type!=='burl')throw Error('局部数量散布用于树瘤、伤疤等表面贴花，请先选择贴花层。');
 let next=template.decal?structuredClone(document):switchDistribution(document,effectId,template.mode,template.params||{}),e=next.surface.effects.find(e=>e.id===effectId);
 // Height selection is owned only while this template is active. A preexisting
 // user channel blend is never reset by selecting an ordinary distribution.
 if(e.publicDistribution?.id==='D11'&&!template.height&&e.publicDistribution.heightOwned){e.blend.conditions={...e.blend.conditions,...e.publicDistribution.previousHeight};}
 let metadata={version:1,id:template.id};
 if(template.height){e.blend||=defaultBlend();const keys=['height','heightSource','heightStrength','heightBalance','heightSoftness'],previousHeight=e.publicDistribution?.id==='D11'?e.publicDistribution.previousHeight:Object.fromEntries(keys.map(k=>[k,e.blend.conditions[k]]));Object.assign(e.blend.conditions,{height:'cavity',heightSource:'bark',heightStrength:1,heightBalance:.5,heightSoftness:.2});metadata={...metadata,heightOwned:true,previousHeight};}
 if(template.decal){delete e.manualDecal;delete e.legacyBinding;e.params.burlPreference=0;const used=next.surface.effects.filter(v=>v.id!==e.id&&v.type==='burl').reduce((n,v)=>n+v.params.burlCount,0);if(used>=8)throw Error('表面贴花数量已满，请先减少其它贴花层数量。');e.params.burlCount=Math.min(Math.max(1,e.params.burlCount),8-used);}
 e.publicDistribution=metadata;next.surface=validateSurface(next.surface,next);return next;
}
