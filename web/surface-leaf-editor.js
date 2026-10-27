import { SURFACE_LEAF_DEFAULTS,createDefaultSurfaceRuler } from './surface-defaults.js';
import { normalizeVine } from './vine-data.js';
import { normalizeGrowthRuler } from './surface-growth-ruler-data.js';
export function createSurfaceLeafEditor({host,api,state,transact}){
 const box=document.createElement('details');box.open=true;box.id='surfaceLeafPanel';
 const fields=[['surfaceLeafSize','叶片大小（cm，全局）',2,60,1,'leaf_size','vine',100],['surfaceLeafDensity','叶量（0 稀疏 → 100 茂密，全局）',0,100,1,'foliage','vine',1],['surfaceLeafSpacing','挂接点最小间距（cm）',0,50,.1,'leaf_spacing','ruler',100],['surfaceLeafGapRatio','额外留空比例（0 不挖空）',0,1,.05,'leaf_gap_ratio','ruler',1],['surfaceLeafGapSize','留空区域宽度（m）',.1,5,.1,'leaf_gap_size','ruler',1]];
 box.innerHTML=`<summary>叶片铺设</summary><p class="vine-note">尺寸与叶量为所有藤蔓共用。分布、留空、间距与高度曲线只作用于自动整面叶层。</p><div class="field-grid"></div><details id="surfaceLeafAdvanced"><summary>高级 · 留空与挂接间距</summary><div class="field-grid"></div><p class="vine-note">最小间距约束挂接点，不是叶缘距离；留空 0 关闭、1 全空。实际叶量还取决于支撑藤干、挂接规则与预算，可在“性能与检查”查看。</p></details>`;
 host.querySelector('.field-grid').before(box);
 for(const [i,f]of fields.entries()){const[id,label,min,max,step]=f;const target=i<2?box.querySelector('.field-grid'):box.querySelector('#surfaceLeafAdvanced .field-grid');target.insertAdjacentHTML('beforeend',`<label>${label}<input id="${id}" type="number" min="${min}" max="${max}" step="${step}"></label>`);}
 const defaults={...createDefaultSurfaceRuler(),...SURFACE_LEAF_DEFAULTS};for(const[id,,,,,key,,mult]of fields)box.querySelector('#'+id).defaultValue=Number((defaults[key]*mult).toFixed(4));
 const inputs=new Map(fields.map(([id])=>[id,box.querySelector('#'+id)]));
 const refresh=()=>{for(const[id,,,,,key,scope,mult]of fields){const input=inputs.get(id),source=scope==='vine'?api.getAuthoring().vine:state()?.growth_ruler;if(source&&document.activeElement!==input)input.value=Number((source[key]*mult).toFixed(4));}};
 for(const[id,,,,,key,scope,mult]of fields){const input=inputs.get(id);input.onchange=()=>{
  if(input.value===''||!input.checkValidity()){refresh();return;}
  const value=+input.value/mult;
  if(scope==='vine')api.transact('调整藤蔓全局叶片',a=>{a.vine=normalizeVine({...a.vine,[key]:value});},{bypassLayers:true});
  else transact('调整自动叶层疏密',s=>{s.growth_ruler=normalizeGrowthRuler({...s.growth_ruler,[key]:value});});
 };}
 return {refresh};
}
