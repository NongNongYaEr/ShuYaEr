import {EDGE_DEFAULTS,EDGE_FIELDS,EDGE_PRESETS,edgeTreatmentActive} from './edge-treatment.js';
import {upgradeStableDistribution,STABLE_FIELDS} from './stable-distribution.js';
import {DISTRIBUTION_MODES,DISTRIBUTION_FIELDS} from './distribution-modes.js';
import {DISTRIBUTION_TEMPLATES,applyDistributionTemplate} from './distribution-templates.js';
import {distributionState,switchDistribution,setDistributionScope,paintLineRule,editPaintLine,paintWearRule,editPaintWear} from './distribution-presets.js';
import {attachmentControls,editAttachment} from './attachment-distribution.js';
import {shapeControls,editShape} from './shape-distribution.js';
import {weatherTraceControls,editWeatherTrace} from './weather-trace-distribution.js';
import {exposureControls,editExposure} from './exposure-distribution.js';
import {RULE_TYPES} from './surface-effects.js';
import {layerIsLocked,layerLeafIds} from './surface-layers.js';
const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
const quickDistributionPanels=[
 {id:'attachment',controls:attachmentControls,edit:editAttachment,dataset:'attachmentField',advancedTitle:'形体识别与随机'},
 {id:'shape',controls:shapeControls,edit:editShape,dataset:'shapeField',advancedTitle:'斑缘与随机',prepareRecognition:true,foldEdge:true},
 {id:'weather-trace',controls:weatherTraceControls,edit:editWeatherTrace,dataset:'weatherTraceField',advancedTitle:'边缘与随机',foldEdge:true},
 {id:'exposure',controls:exposureControls,edit:editExposure,dataset:'exposureField',advancedTitle:'分布细节',foldEdge:true}
];
function quickDistributionPanel(document,effect){
 for(const panel of quickDistributionPanels){
  const controls=panel.controls(document,effect);
  if(controls)return {...panel,...controls};
 }
 return null;
}
export function createUnifiedDistributionPanel(api){
 let serial=0,loaded=false,presets=[],presetName='我的分布',lastRemoved=null;const identity=()=>JSON.stringify([api.document()?.id,api.document()?.resources.source,api.document()?.actualHeightMeters,api.selected()]);
 async function change(id,mode,changes={},edgeTreatment){const request=++serial,saved=identity();let authoring;try{api.stopPaint();authoring=JSON.stringify(api.document());const next=switchDistribution(api.document(),id,mode,changes);if(edgeTreatment!==undefined){const target=next.surface.effects.find(e=>e.id===id);if(edgeTreatment)target.edgeTreatment=structuredClone(edgeTreatment);else delete target.edgeTreatment;}await api.prepare('distribution',{strict:true,candidate:next,forNext:true});if(request!==serial||identity()!==saved||authoring!==JSON.stringify(api.document()))return;api.apply(next,id);}catch(e){if(e.name!=='AbortError')api.notify(e.message,true);api.sync();}}
 async function template(id,key){if(!key)return;const request=++serial,saved=identity(),authoring=JSON.stringify(api.document());try{api.stopPaint();const next=applyDistributionTemplate(api.document(),id,key);await api.prepare('distribution',{strict:true,candidate:next,forNext:true});if(request!==serial||identity()!==saved||authoring!==JSON.stringify(api.document()))return;api.apply(next,id);}catch(error){if(error.name!=='AbortError')api.notify(error.message,true);api.sync();}}
 function ownArea(s,owner,id){let a=s.areas.find(x=>x.id===id);if(s.effects.some(x=>x.id!==owner.id&&(x.scopeRef===id||s.masks.find(m=>m.id===x.maskRef)?.items.some(r=>[r.areaRef,r.addRef,r.eraseRef].includes(id))))){a={...structuredClone(a),id:crypto.randomUUID(),ownedBy:owner.id};s.areas.push(a);owner.scopeRef=a.id;}return a;}
 function renderPaintWear(parent,e,rule){
  const convex=rule.type==='curvature',fields=RULE_TYPES[rule.type].fields;
  const control=(key,label,value,change,options,disabled=false)=>{
   const input=api.field(parent,label,value,(v,commit)=>{
    api.apply(editPaintWear(api.document(),e.id,change(v)),e.id,commit);
   },options);
   input.dataset.paintWearField=key;
   if(disabled)for(const item of input.parentElement.querySelectorAll('input'))item.disabled=true;
  };
  control(convex?'range':'loss',convex?'磨损范围':'掉漆量',1-rule.params.threshold,v=>({params:{threshold:1-v}}),fields.threshold,convex&&rule.strength===0);
  if(convex){
   control('strength','磨损强度',rule.strength,v=>({strength:v}),{min:0,max:1,step:.01});
  }else{
   const sizeCm=rule.params.sizeMeters*100;
   control('size','斑块尺寸',sizeCm,v=>({params:{sizeMeters:v/100}}),{
    min:fields.sizeMeters.min*100,max:fields.sizeMeters.max*100,step:1,unit:'cm',sliderMax:Math.max(100,sizeCm)
   });
  }
  control('softness',convex?'磨损过渡':'斑缘过渡',rule.params.softness,v=>({params:{softness:v}}),{...fields.softness,step:.001},convex&&rule.strength===0);
  const note=node('p',convex?'范围越大，越平缓的凸起也会磨损。强度控制凸处露出树皮的程度。':'掉漆量越大，露出的树皮越多。斑缘过渡越小，缺口边缘越清晰。');
  note.className='surface-note';parent.append(note);
 }
 async function applyShapeRecognition(next,id){
  const request=++serial,saved=identity(),authoring=JSON.stringify(api.document());
  try{
   await api.prepare('distribution',{strict:true,candidate:next,forNext:true});
   if(request===serial&&saved===identity()&&authoring===JSON.stringify(api.document()))api.apply(next,id);
  }catch(error){
   if(error.name!=='AbortError')api.notify(error.message,true);
   api.sync();
  }
 }
 function renderRuleFields(parent,e,fields,{edit,dataset,prepareRecognition=false}){
  for(const {key,label,value,disabled,options:choices,...fieldOptions} of fields){
   const set=(next,commit)=>{
    if(key==='recognition'&&!commit)return;
    const edited=edit(api.document(),e.id,key,next);
    if(key==='recognition'&&prepareRecognition){void applyShapeRecognition(edited,e.id);return;}
    api.apply(edited,e.id,commit);
   };
   const input=choices?api.select(parent,label,choices,value,next=>set(Number(next),true)):api.field(parent,label,value,set,fieldOptions);
   input.dataset[dataset]=key;
   if(disabled)for(const item of input.parentElement.querySelectorAll('input,select'))item.disabled=true;
  }
 }
 function openBoundaryStatus(d,e){
  const info=api.structure?.();
  const known=info&&info.sourceSHA256===d.resources.source&&info.actualHeightMeters===d.actualHeightMeters&&Number.isInteger(info.openEdges);
  if(known)return info.openEdges===0
   ?{state:'closed',message:'未检测到开放边缘。可改用「均匀覆盖」并指定作用范围。'}
   :{state:'open',message:'已检测到开放边缘。'};
  const message=!e.enabled||e.opacity===0?'启用图层并提高整体强度后检测开放边缘。':'开放边缘状态待分析。';
  return {state:'pending',message};
 }
 function render(parent,e){
 const d=api.document(),state=distributionState(d,e.id),p=state.params,box=node('section');
 box.className='generation-panel';box.dataset.unifiedDistribution=e.id;parent.append(box);
 const paint=e.type==='paint',line=paintLineRule(d.surface,e),locked=layerIsLocked(d.surface,e.id),legacy=e.coverageMode==='legacy';
 const quick=quickDistributionPanel(d,e);
 const boundary=quick?.id==='exposure'&&quick.kind==='boundary'?openBoundaryStatus(d,e):null;
 const boundaryFields=fields=>boundary?.state==='closed'?fields.map(field=>({...field,disabled:true})):fields;
 const compact=!!line||!!quick,hasSpecializedEdge=paint||!!quick;
 const edgeParams={...EDGE_DEFAULTS,...e.edgeTreatment};
 const actions=(target)=>{
  const row=node('div');row.className='studio-quick-actions';target.append(row);
  api.button(row,'查看最终覆盖',()=>api.preview());
  api.button(row,'擦除／恢复局部影响',()=>api.correct(e));
 };
 if(line){
  const {minMeters,maxMeters,featherMeters}=line.params;
  const set=(key,value,commit)=>api.apply(editPaintLine(api.document(),e.id,{[key]:value}),e.id,commit);
  const height=api.field(box,'涂刷高度',maxMeters,(v,commit)=>set('maxMeters',v,commit),{min:minMeters,max:Math.max(d.actualHeightMeters,maxMeters),step:.01,unit:'m',slider:true});
  height.dataset.paintLineField='height';
  const width=api.field(box,'漆边过渡',featherMeters*100,(v,commit)=>set('featherMeters',v/100,commit),{min:0,max:2000,step:.1,unit:'cm',sliderMax:Math.max(20,featherMeters*100)});
  width.dataset.paintLineField='feather';
  const note=node('p','高度从树底量起。漆边从设定高度向上渐隐，设为 0 可得到硬边。');note.className='surface-note';box.append(note);
  if(featherMeters>.015||edgeTreatmentActive(e.edgeTreatment)){
   const tighten=api.button(box,'收紧漆边',()=>api.apply(editPaintLine(api.document(),e.id,{}, {tighten:true}),e.id));
   tighten.title='将漆边过渡收至最多 1.5 cm，并关闭额外扩散。';tighten.dataset.tightenPaintLine='';
  }
  const wear=paintWearRule(d.surface,e);
  if(wear)renderPaintWear(box,e,wear);
  actions(box);
 }
 if(quick){
  renderRuleFields(box,e,boundaryFields(quick.fields),quick);
  if(boundary){
   const status=node('p',boundary.message);status.className='surface-note';status.dataset.openBoundaryStatus=boundary.state;box.append(status);
  }
  actions(box);
 }
 const old=d.surface.masks.find(m=>m.id===e.maskRef)?.items.find(r=>['treeauto','treeweather'].includes(r.type));
 if(old){box.dataset.weatheringControls='layer';box.dataset.distributionVersion=old.type==='treeauto'?'stable':'legacy';}
 const modes=compact?api.section(line?'paint-line-modes':quick.id+'-modes','更换分布方式',false,box):box;
 const options=[...(!state.mode&&!line?[['custom',legacy?'旧版分布（保留原效果）':'现有专用／自定义分布']]:[]),...(paint?[['paint-line','按高度涂刷']]:[]),...Object.entries(DISTRIBUTION_MODES)];
 const mode=api.select(modes,'分布方式',options,line?'paint-line':state.mode||'custom',v=>{
  if(v==='paint-line'){api.stopPaint();api.apply(editPaintLine(api.document(),e.id,{}),e.id);}
  else if(v!=='custom')void change(e.id,v);
 });mode.dataset.distributionMode='';
 const preset=api.select(modes,'公共分布模板',[['','选择模板…'],...DISTRIBUTION_TEMPLATES.filter(t=>!t.decal||e.type==='burl').map(t=>[t.id,t.name])],'',key=>void template(e.id,key));preset.dataset.publicDistribution='';
 const current=DISTRIBUTION_TEMPLATES.find(t=>t.id===e.publicDistribution?.id);
 if(current||!compact){const description=node('p',current?.description||'模板只更改分布，材质外观和独立手绘层保留。');description.className='surface-note';modes.append(description);}
 const edgeKey=line?'paint-line-edge-treatment':quick?quick.id+'-edge-treatment':'distribution-edge-treatment';
 const edgeActive=edgeTreatmentActive(e.edgeTreatment);
 const edgeTitle=compact?'额外柔化与扩散':'边缘柔化与扩散';
 const edge=api.section(edgeKey,quick?.foldEdge&&edgeActive?edgeTitle+' · 已启用':edgeTitle,!quick?.foldEdge&&(!compact||edgeActive),box);edge.dataset.edgeTreatment=e.id;
 const hasEdgeDistance=edgeParams.blurCm>0||edgeParams.spreadCm!==0;
 const edgeVersion=api.select(edge,'柔化方式',[[2,'连续柔化 · 推荐'],[1,'旧版混合 · 兼容']],edgeParams.version,value=>api.edit(s=>{s.effects.find(v=>v.id===e.id).edgeTreatment={...edgeParams,version:Number(value)};},{ids:[e.id]}));edgeVersion.disabled||=hasSpecializedEdge&&!hasEdgeDistance;
 if(edgeParams.version===1){const tip=node('p','旧版混合会保留原来的硬边；可切换连续柔化，参数与原分布保留。');tip.className='surface-note';edge.append(tip);const upgrade=api.button(edge,'改用连续柔化',()=>api.edit(s=>{s.effects.find(v=>v.id===e.id).edgeTreatment={...edgeParams,version:2};},{ids:[e.id]}));upgrade.dataset.edgeUpgrade='';upgrade.disabled||=hasSpecializedEdge&&!hasEdgeDistance;}
 const edgeButtons=node('div');edgeButtons.className='studio-quick-actions';edge.append(edgeButtons);for(const [key,preset]of Object.entries(EDGE_PRESETS)){const button=api.button(edgeButtons,preset.name,()=>api.edit(s=>{s.effects.find(v=>v.id===e.id).edgeTreatment={...edgeParams,...Object.fromEntries(Object.entries(preset).filter(([k])=>k!=='name')),amount:1};},{ids:[e.id]}));button.dataset.edgePreset=key;}
 for(const[k,f]of Object.entries(EDGE_FIELDS)){
  const input=api.field(edge,f.label,edgeParams[k],(value,commit)=>api.edit(s=>{s.effects.find(v=>v.id===e.id).edgeTreatment={...edgeParams,[k]:value};},{ids:[e.id],commit}),{...f,slider:true,live:false});input.dataset.edgeField=k;
  if(k==='amount'&&hasSpecializedEdge&&!hasEdgeDistance)for(const c of input.parentElement.querySelectorAll('input'))c.disabled=true;
 }
 const precision=api.section('edge-treatment-quality','滤波精度',false,edge);
 const resolution=api.select(precision,'表面采样精度',[[256,'256 · 快速'],[512,'512 · 标准'],[1024,'1024 · 精细']],edgeParams.resolution,value=>api.edit(s=>{s.effects.find(v=>v.id===e.id).edgeTreatment={...edgeParams,resolution:Number(value)};},{ids:[e.id]}));resolution.disabled||=hasSpecializedEdge&&!edgeTreatmentActive(edgeParams);
 const note=node('p',legacy?'原版材质内部分布：选定分布方式后即可使用整体柔化。':hasSpecializedEdge&&!hasEdgeDistance?'调整模糊半径或扩张 / 收缩后可使用柔化程度和滤波精度。':edgeParams.version===2?'柔化程度控制扩散幅度。正值外扩、负值内收，作用范围继续限制最终结果。':'较低的处理强度会保留部分原始硬边。正值外扩、负值内收。');note.className='surface-note';edge.append(note);
 const qualityNote=node('p','预览与导出使用同一滤波精度。极细选区受采样与 UV 密度限制。');qualityNote.className='surface-note';precision.append(qualityNote);
 const reset=api.button(edge,'重置边缘处理',()=>api.edit(s=>{delete s.effects.find(v=>v.id===e.id).edgeTreatment;},{ids:[e.id]}));reset.disabled||=hasSpecializedEdge&&!e.edgeTreatment;
 if(legacy)for(const c of edge.querySelectorAll('input,select,button'))c.disabled=true;
 const gallery=api.section('distribution-gallery','浏览分布样式',false,modes),grid=node('div'),legend=node('p','浅色为覆盖区域，灰色为未覆盖树皮');legend.className='surface-note';gallery.append(legend);grid.className='distribution-mode-gallery';gallery.append(grid);for(const [key,name]of Object.entries(DISTRIBUTION_MODES)){const b=api.button(grid,name,()=>void change(e.id,key));const image=node('img');image.src='/assets/distribution-'+key+'.png';image.alt=name+' · 同树分布示意';image.onerror=()=>image.remove();image.width=96;image.height=96;b.prepend(image);}
 if(old?.type==='treeweather'){const upgrade=api.button(box,'采用新版自动分布',async()=>{const saved=identity();try{await api.prepare('stable',{strict:true});if(saved===identity())api.apply(upgradeStableDistribution(api.document(),[e.id]),e.id);}catch(error){api.notify(error.message,true);}});upgrade.dataset.upgradeDistribution='';}
 if(!loaded&&api.list){loaded=true;api.list().then(result=>{presets=result.items;lastRemoved=result.lastRemovedId||lastRemoved;api.sync();}).catch(error=>api.notify(error.message,true));}
 const mine=api.section('distribution-mine','我的分布预设',false,modes);api.select(mine,'载入分布',[['','选择…'],...presets.map(p=>[p.id,p.name])],'',id=>{const v=presets.find(p=>p.id===id);if(v)void change(e.id,v.mode,v.params,v.edgeTreatment);});if(state.mode){api.field(mine,'预设名称',presetName,(v)=>presetName=v,{kind:'text'});api.button(mine,'保存当前分布',async()=>{try{await api.save({kind:'tree-distribution-preset',version:e.edgeTreatment?.version===2?3:e.edgeTreatment?2:1,name:presetName,mode:state.mode,params:p,...(e.edgeTreatment?{edgeTreatment:e.edgeTreatment}:{})});presets=(await api.list()).items;api.sync();}catch(error){api.notify(error.message,true);}});}if(presets.length)api.select(mine,'移入回收目录',[['','选择要移出的预设…'],...presets.map(p=>[p.id,p.name])],'',async id=>{if(!id)return;try{await api.remove(id);lastRemoved=id;presets=(await api.list()).items;api.sync();}catch(error){api.notify(error.message,true);}});
 
 const area=d.surface.areas.find(a=>a.id===e.scopeRef),ranges=[['','全树'],...d.surface.areas.filter(a=>!a.ownedBy||a.id===e.scopeRef).map(a=>[a.id,a.name])];api.select(box,'作用范围',ranges,e.scopeRef||'',ref=>api.apply(setDistributionScope(api.document(),e.id,ref),e.id));
 const makeScope=()=>api.section('distribution-scope','设置作用范围',false,box);
 const scopedBounds=quick?.heightInScope?makeScope():null;
 if(area?.kind==='height'){for(const[k,label]of [['min','范围下界'],['max','范围上界']])api.field(scopedBounds||box,label,area.scope[k]*d.actualHeightMeters,(v,commit)=>api.edit(s=>{const a=ownArea(s,s.effects.find(x=>x.id===e.id),area.id),value=v/d.actualHeightMeters;if(k==='min'&&value>=a.scope.max||k==='max'&&value<=a.scope.min)throw Error('范围上下界需要按顺序设置。');a.scope[k]=value;a.presetOwned=false;},{ids:[e.id],commit}),{min:0,max:d.actualHeightMeters,step:.05,unit:'m'});}
 const scope=scopedBounds||makeScope();api.button(scope,'新增高度范围',()=>{const id=crypto.randomUUID();api.edit((s,d)=>{s.areas.push({id,name:e.name+' · 高度范围',kind:'height',sourceSHA256:d.resources.source,strokes:[],scope:{kind:'height',min:0,max:.25,feather:.025},partId:null,ownedBy:e.id,presetOwned:false});s.effects.find(x=>x.id===e.id).scopeRef=id;},{ids:[e.id]});});
 api.button(scope,area?.kind==='surface'&&area.mode==='painted'?'继续涂作用范围':'涂出作用范围',()=>{let id=area?.kind==='surface'&&area.mode==='painted'?area.id:null;if(!id){id=crypto.randomUUID();api.edit((s,d)=>{s.areas.push({id,name:e.name+' · 绘制范围',kind:'surface',sourceSHA256:d.resources.source,mode:'painted',strokes:[],scope:null,partId:null,ownedBy:e.id});s.effects.find(x=>x.id===e.id).scopeRef=id;},{ids:[e.id]});}else api.edit(s=>{id=ownArea(s,s.effects.find(x=>x.id===e.id),id).id;},{ids:[e.id]});api.startPaint({kind:'area',id,effectId:e.id,role:'generation'});});api.button(scope,'选择模型部位',()=>api.parts(e.id));
 if(lastRemoved)api.button(mine,'恢复上次移出',async()=>{try{await api.restore(lastRemoved);lastRemoved=null;presets=(await api.list()).items;api.sync();}catch(error){api.notify(error.message,true);}});
 if(state.mode&&!quick){if(state.mode==='groove')api.select(box,'分布变体',[['0','自然沟槽'],['1','接缝窄带'],['2','宽范围遮蔽']],String(p.variant),v=>void change(e.id,state.mode,{variant:Number(v)}));if(['orientation','flow','endgrain'].includes(state.mode))api.select(box,'附着方向',[['0','向上'],['1','向下'],['2','X 正向'],['3','X 负向'],['4','Z 正向'],['5','Z 负向']],String(p.direction),v=>void change(e.id,state.mode,{direction:Number(v)}));
 const pattern=state.mode!=='uniform'&&(!paint||p.density<1);
 const recognize=['root','groove','ridge','contact'].includes(state.mode)&&!(paint&&state.mode==='root'&&p.cavityPreference===0);
 const keys=state.mode==='uniform'?[]:['density',...(recognize?['recognitionCm']:[]),...(pattern?(state.mode==='streaks'?['widthCm','lengthMeters']:['patchCm']):[]),...(state.mode==='root'?['rootHeightMeters','cavityPreference']:[]),...(['orientation','endgrain'].includes(state.mode)?['angle']:[]),...(pattern?['seed']:[]),...(state.mode==='boundary'?['boundaryCm']:[]),...(state.mode==='flow'?['flowContrast']:[])];
 const property=(target,k)=>{const input=api.field(target,DISTRIBUTION_FIELDS[k].label,p[k],(v,commit)=>{if(k==='recognitionCm'){if(commit)void change(e.id,state.mode,{[k]:v});return;}const next=switchDistribution(api.document(),e.id,state.mode,{[k]:v});api.apply(next,e.id,commit);},{...DISTRIBUTION_FIELDS[k],max:k==='rootHeightMeters'?Math.max(p[k],d.actualHeightMeters):DISTRIBUTION_FIELDS[k].max});input.dataset.distributionField=k;};for(const k of keys)property(box,k);if(pattern){const advanced=api.section('distribution-edge','边缘与破碎',false,box);for(const k of ['edge','breakup'])property(advanced,k);}}
 else if(!compact){if(old?.type==='treeauto'){const legacy=api.section('distribution-existing','现有专用分布参数',true,box);for(const k of ['density','recognitionCm','patchCm','rootHeightMeters','seed']){const f=STABLE_FIELDS[k];api.field(legacy,f.label,old.params[k],(v,commit)=>api.edit(s=>{s.masks.find(m=>m.id===e.maskRef).items.find(r=>r.id===old.id).params[k]=v;},{ids:[e.id],commit}),f);}}const note=node('p','选择一种方式即可替换自动生成部分；材质、用户范围和局部修正继续保留。');note.className='surface-note';box.append(note);}
 if(quick?.advanced?.length){
  const advanced=api.section(quick.id+'-analysis',quick.advancedTitle,false,box);
  renderRuleFields(advanced,e,boundaryFields(quick.advanced),quick);
 }
 if(!compact)actions(box);
 if(locked)for(const control of box.querySelectorAll('input,select,button'))control.disabled=true;
 }
 function renderGroup(parent,groupId){const d=api.document(),ids=layerLeafIds(d.surface,groupId),effects=d.surface.effects.filter(e=>ids.includes(e.id));if(!effects.length||effects.some(e=>e.paint))return;const modes=new Set(effects.map(e=>distributionState(d,e.id).mode||'custom')),note=node('p',modes.size>1?'组内多种分布 · 子层可分别切换':'组内分布：'+(DISTRIBUTION_MODES[[...modes][0]]||'现有专用／自定义'));note.className='surface-note';parent.append(note);const batch=api.section('distribution-batch','批量统一分布（'+effects.length+'层）',false,parent);const choose=api.select(batch,'统一为',[['','选择新方式…'],...Object.entries(DISTRIBUTION_MODES)],'',async mode=>{if(!mode)return;const saved=identity(),authoring=JSON.stringify(api.document()),request=++serial;try{if(ids.some(id=>layerIsLocked(d.surface,id)))throw Error('组内有锁定图层，请先解锁。');let next=api.document();for(const id of ids)next=switchDistribution(next,id,mode);await api.prepare('distribution',{strict:true,candidate:next,forNext:true});if(request!==serial||saved!==identity()||authoring!==JSON.stringify(api.document()))return;api.applyGroup(next,groupId);}catch(error){if(error.name!=='AbortError')api.notify(error.message,true);api.sync();}});choose.disabled||=ids.some(id=>layerIsLocked(d.surface,id));}
 return{render,renderGroup,usePart(effectId,partId){const part=api.document().parts.groups.find(p=>p.id===partId);if(!part?.faces.length)throw Error('请选择有源面的模型部位。');api.edit((s,d)=>{const e=s.effects.find(e=>e.id===effectId);if(!e||layerIsLocked(s,effectId))throw Error('请先解锁图层或父级组。');let area=s.areas.find(a=>a.kind==='part'&&a.partId===partId&&a.ownedBy===effectId);if(!area){area={id:crypto.randomUUID(),name:part.name,kind:'part',sourceSHA256:d.resources.source,strokes:[],scope:null,partId,ownedBy:effectId,presetOwned:false};s.areas.push(area);}e.scopeRef=area.id;},{ids:[effectId]});},cancel(){serial++;}};
}
