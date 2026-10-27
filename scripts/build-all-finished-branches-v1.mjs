import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {TREE_SPECIES,createTreeSpeciesDocument} from '../web/tree-species-library.js';
import {normalizePlantUnitPack,documentWithUnitAssembly,geometryExtent} from '../web/plant-unit-data.js';
import {normalizeAuthoring} from '../web/authoring-state.js';
import {buildBranchAsset,disposeBranchAsset,deserializeGeometry} from '../web/branch-kernel.js';
import {branchRadiusAt} from '../web/branch-shaping.js';

const root=path.resolve('.'),out=path.join(root,'次枝资产/全植物次枝成品V1');
const requested=new Set(process.argv.slice(2));
const catalog=JSON.parse(fs.readFileSync('web/assets/plant-unit-catalog.json'));
const recipes=fs.readdirSync(path.join(out,'配方')).filter(f=>f.endsWith('.json')).flatMap(f=>JSON.parse(fs.readFileSync(path.join(out,'配方',f))));
const hash=x=>createHash('sha256').update(x).digest('hex');
const safe=s=>s.replace(/[^A-Za-z0-9_-]/g,'_');
function rawUnits(raw){return (raw.leaf_meshes||raw.units||[]).map((u,i)=>({...u,id:u.id||`UNIT_${i}`}));}
function curvedBranch(id,parent,attach,start,end,radius){const points=Array.from({length:13},(_,i)=>{const t=i/12;return start.map((v,k)=>v+(end[k]-v)*t+(k===1?.012*Math.sin(t*Math.PI):0));});return {id,parent,attach,order:parent?1:0,points,knots:structuredClone(points),length:Math.hypot(...end.map((v,k)=>v-start[k])),start_radius:Math.max(.0012,radius),end_radius:Math.max(.0012,radius)*.35,radius_profile:[1,1,.96].map(v=>v*Math.min(1,radius/.0012)),sections:[]};}
function makeShape(c,style,seed){
 const isHerb=c.kind==='HERB',fallback=c.id==='BOUGAINVILLEA'?'JASMINE':c.id==='IVY'?'POTHOS':'CAMELLIA';
 let doc=createTreeSpeciesDocument(TREE_SPECIES[c.id]?c.id:fallback,style,seed,TREE_SPECIES[c.id]?.category==='POTTED'||isHerb||c.id==='IVY'?{}:{structure:{branch_count:style==='SIDE'?c.branchCount:2,shoot_count:style==='SIDE'?c.shootCount:0,angle:c.angle,variation:.76}});
 const length=style==='SIDE'?c.sideLength:c.tipLength,radius=style==='SIDE'?c.baseRadius:c.tipBaseRadius;
 if(['POTHOS','IVY','FIDDLE_FIG'].includes(c.id)){
   const erect=c.id==='FIDDLE_FIG',points=Array.from({length:25},(_,i)=>{const t=i/24;return erect?[length*.13*t,length*.045*Math.sin(t*Math.PI),length*t]:[length*t,length*.12*Math.sin(t*Math.PI),-length*.35*t*t];});
   doc.authoring.branch_shape={branches:[{id:'R1',parent:'',attach:0,order:0,points,knots:structuredClone(points),length,start_radius:radius,end_radius:radius*.35,radius_profile:[1,1,.96],sections:[]}],connector:{position:[0,0,0],direction:erect?[.13,0,1]:[1,0,0],locked:true}};
 }
 if(isHerb){
   const b=curvedBranch('R1','',0,[0,0,0],[0,0,.012],.006);b.end_radius=.0055;doc.authoring.branch_shape={branches:[b],connector:{position:[0,0,0],direction:[0,0,1],locked:true}};
 }else{
   const shape=doc.authoring.branch_shape,b=shape.branches[0],origin=[...b.points[0]],factor=length/b.length,thickness=radius/(b.start_radius*b.radius_profile[0]);
   for(const branch of shape.branches){for(const list of [branch.points,branch.knots])for(const p of list)for(let k=0;k<3;k++)p[k]=(p[k]-origin[k])*factor;branch.length*=factor;branch.start_radius*=thickness;branch.end_radius*=thickness;}
   shape.connector.position=[0,0,0];
   if(!['POTHOS','IVY','FIDDLE_FIG'].includes(c.id)){
     const children=shape.branches.filter(x=>x.parent===b.id),last=Math.max(0,...children.map(x=>x.attach)),end=Math.min(1,last+.065);
     if(children.length&&end<.97){
       const old=b.points,x=end*(old.length-1),j=Math.floor(x),tip=old[j].map((v,k)=>v+(old[j+1][k]-v)*(x-j));
       b.points=[...old.slice(0,j+1),tip];b.knots=structuredClone(b.points);b.length*=end;
       b.end_radius=b.start_radius+(b.end_radius-b.start_radius)*end;
       for(const child of children)child.attach/=end;
     }
   }
 }
 doc.authoring.recipe.tags=doc.authoring.recipe.tags.filter(t=>!TREE_SPECIES[t]);doc.authoring.recipe.tags.push(c.id);
 Object.assign(doc.settings,{length,base_radius:radius,tip_radius:radius*.28,wind_strength:0,radial_segments:8,max_triangles:450000,max_leaves:650,leaf_scale_variation:.1,leaf_twist:18,leaf_min_spacing:.008,bark_color:isHerb?'#60774a':'#675440'});
 if(TREE_SPECIES[c.id]?.arrangement==='OPPOSITE')doc.settings.collision_avoidance=false;
 if(['POTHOS','IVY','FIDDLE_FIG','BOUGAINVILLEA'].includes(c.id)){doc.settings.leaf_arrangement='ALTERNATE';doc.settings.phyllotaxis_angle=c.id==='POTHOS'||c.id==='IVY'?180:137.5;}
 return doc;
}
function herbPlacements(doc,c,style){
 const count=c.id==='SCENE_FLOWER'?(style==='SIDE'?3:1):c.id==='SCENE_GRASS'?(style==='SIDE'?7:4):(style==='SIDE'?5:3);
 const shape=doc.authoring.branch_shape,rootBranch=shape.branches[0];
 doc.settings.leaf_density=c.id==='SCENE_FLOWER'?0:1;doc.settings.collision_avoidance=false;doc.settings.leaf_min_spacing=0;doc.settings.leaf_outward=.08;doc.settings.leaf_droop=0;doc.settings.leaf_twist=12;doc.settings.bark_color='#71904c';doc.authoring.attachment_layers.forEach(l=>l.enabled=false);
 doc.authoring.leaf_edits.added=[];
 for(let i=0;i<count;i++){
  const angle=i*2.39996,spread=c.id==='SCENE_FLOWER'?.035:c.id==='SCENE_GRASS'?.007:.015,start=[0,0,.00864];
  const end=[Math.cos(angle)*spread,Math.sin(angle)*spread,c.id==='SCENE_FLOWER'?.10+(i%3)*.025:.024+(i%3)*.004];
  const b=curvedBranch('H'+i,rootBranch.id,.72,start,end,c.id==='SCENE_GRASS'?.0025:.0033);b.end_radius=b.start_radius*.82;shape.branches.push(b);
  if(c.id!=='SCENE_FLOWER')doc.authoring.leaf_edits.added.push({id:'HERB_LEAF_'+i,parent:b.id,t:1,azimuth:(angle*180/Math.PI)%360,scale:.88+(i%3)*.1,source:i%doc.leaf_meshes.length});
 }
 if(c.id==='SCENE_FLOWER'){Object.assign(doc.authoring.tree_organs,{max_count:count,amount:1,order_min:1,terminal_branches_only:true,habit:'TERMINAL'});}
}
function ginkgoPlacements(doc,style){
 // Ginkgo short shoots carry several leaves; its long axis is not a leaf sleeve.
 doc.settings.collision_avoidance=false;doc.settings.leaf_min_spacing=0;doc.authoring.attachment_layers.forEach(l=>l.enabled=false);doc.authoring.leaf_edits.added=[];
 const branches=doc.authoring.branch_shape.branches,shorts=branches.filter(b=>b.parent&&(!branches.some(x=>x.parent===b.id)));
 for(const [j,b] of shorts.entries())for(let i=0;i<(style==='SIDE'?3:4);i++)doc.authoring.leaf_edits.added.push({id:`SPUR_${j}_${i}`,parent:b.id,t:.8+i*.045,azimuth:(j*83+i*97)%360,scale:.92+(i%2)*.1,source:(j+i)%doc.leaf_meshes.length});
}
for(const [index,c] of recipes.entries()){
 if(requested.size&&!requested.has(c.id))continue;
 const entry=catalog.find(e=>e.species===c.id)||catalog.find(e=>e.file===path.basename(c.assetFile||''));if(!entry)throw Error('No source pack: '+c.id);
 const raw=JSON.parse(fs.readFileSync(path.join('web/assets/plants',entry.file))),source=c.blenderSource||(c.sourceFile?.endsWith('.blend')?c.sourceFile:entry.source);
 if(!fs.existsSync(source))throw Error('Missing original source '+source);
 const dir=path.join(out,c.name);fs.mkdirSync(dir,{recursive:true});
 const sourceLeaves=rawUnits(raw),allLeaves=sourceLeaves.filter(u=>!(c.excludeLeafIds||[]).includes(u.id));
 const adults=allLeaves.filter(u=>c.matureLeafIds?.length?c.matureLeafIds.includes(u.id):!c.youngLeafIds?.includes(u.id));
 if(!adults.length&&c.id!=='SCENE_FLOWER')throw Error('No mature leaves '+c.id);
 const originalsYoung=allLeaves.filter(u=>c.youngLeafIds?.includes(u.id));
 const young=originalsYoung.length?originalsYoung:adults.slice(0,Math.min(3,adults.length));
 const units=[];
 if(c.id!=='SCENE_FLOWER'){
   for(const [i,u] of adults.entries())units.push({...u,id:safe(u.id)+'_MATURE',name:u.name+' · 成熟',role:'LEAF',size_m:c.leafSize*(.96+(i%3)*.04),colorTint:c.matureTint||'#ffffff',source_file:source});
   for(const [i,u] of young.entries())units.push({...u,id:safe(u.id)+'_YOUNG',name:u.name+' · 新梢',role:'LEAF',size_m:c.youngSize*(.96+(i%3)*.04),colorTint:c.youngTint||(originalsYoung.length?'#ffffff':'#e7f4b9'),source_file:source});
 }
 let organSources=raw.organ_meshes||[];
 if(raw.flower)organSources=[...organSources,{...raw.flower,id:'FLOWER',role:'FLOWER'}];
 if(c.id==='SCENE_FLOWER')organSources=sourceLeaves.map(u=>({...u,role:'FLOWER'}));
 for(const u of organSources){const spec=c.organs?.find(o=>o.id===u.id);if(!spec)continue;units.push({...u,size_m:spec.size_m,source_file:source});}
 const pack=normalizePlantUnitPack({id:safe(c.id)+'_FINISHED_V1',name:c.name+' · 校准单元',species:c.id,source,material:raw.leaf_material||raw.material,units});
 if(!pack.material.color||!pack.units.every(u=>u.geometry.uv?.length))throw Error('Missing atlas/UV '+c.id);
 fs.writeFileSync(path.join(dir,c.name+'_校准单元.plantunits.json'),JSON.stringify(pack));
 const report={species:c.id,name:c.name,kind:c.kind||TREE_SPECIES[c.id]?.category||'TREE',source,source_sha256:hash(fs.readFileSync(source)),assetFile:entry.file,atlas_sha256:hash(Buffer.from(pack.material.color.split(',')[1],'base64')),references:c.sources,notes:c.notes,calibration:pack.units.map(u=>({id:u.id,role:u.role,completeUnitCm:u.size_m*100,extent:geometryExtent(u.geometry).longest})),samples:[]};
 for(const style of ['SIDE','TIP'])for(const role of (c.id==='SCENE_FLOWER'?['MATURE']:['MATURE','MIXED','YOUNG'])){
   let doc=makeShape(c,style,250925+index*19+(style==='TIP'?7:0));
   const selected=pack.units.filter(u=>u.role==='LEAF'&&(role==='MATURE'?u.id.endsWith('_MATURE'):role==='MIXED'?true:u.id.endsWith('_YOUNG')||u.id===pack.units.find(x=>x.id.endsWith('_MATURE'))?.id));
   const organs=pack.units.filter(u=>u.role!=='LEAF');
   // Complementary mature/mixed/young cards cover the supplied organs; a new
   // shoot normally uses a bud where one exists, rather than dense fruit.
   const organ=role==='YOUNG'?organs.find(u=>u.role==='BUD')||organs.at(-1):role==='MATURE'?organs.find(u=>u.role==='FRUIT')||organs[0]:organs.find(u=>u.role==='FLOWER')||organs[0];
   if(organ&&c.organMax!==0)selected.push(organ);
   doc=documentWithUnitAssembly(doc,pack,{entries:selected.map(u=>({unit_id:u.id,size_m:u.size_m,weight:role==='MIXED'&&u.id.endsWith('_YOUNG')?.22:role==='YOUNG'&&u.id.endsWith('_MATURE')?.35:1})),density:style==='SIDE'?c.densitySide:c.densityTip,start:c.id==='PITTOSPORUM'?.5:.18,end:.97,order_min:style==='TIP'||c.kind==='VINE'||c.id==='FIDDLE_FIG'?0:1,organ_amount:1,habit:c.organHabit||'AXILLARY'});
   for(const u of doc.leaf_meshes){u.id=u.id.slice(pack.id.length+1);u.ageStage=u.id.endsWith('_YOUNG')?'YOUNG':'MATURE';}
   for(const u of doc.authoring.tree_organs.units)u.id=u.id.slice(pack.id.length+1);
   doc.settings.leaf_age_layering=role==='MIXED'?1:0;
   Object.assign(doc.authoring.tree_organs,{max_count:Math.max(1,c.organMax||1),terminal_branches_only:c.organHabit==='TERMINAL',order_min:0});
   if(style==='TIP'&&['CAMELLIA','GARDENIA','CRABAPPLE','FICUS_MICROCARPA'].includes(c.id))doc.authoring.tree_organs.max_count=1;
   if(c.id==='GINKGO')ginkgoPlacements(doc,style);
   if(c.kind==='HERB')herbPlacements(doc,c,style);
   if(c.id==='FIDDLE_FIG'){
     doc.settings.collision_avoidance=false;doc.authoring.attachment_layers.forEach(l=>l.enabled=false);doc.authoring.leaf_edits.added=[];
     const positions=style==='SIDE'?[.38,.67,.94]:[.5,.94];
     positions.forEach((t,i)=>doc.authoring.leaf_edits.added.push({id:'FIDDLE_LEAF_'+i,parent:'R1',t,azimuth:i*137.5,scale:1,source:i%doc.leaf_meshes.length}));
   }
   const form=c.kind==='HERB'?(style==='SIDE'?'疏簇单元':'小簇单元'):c.kind==='VINE'?(style==='SIDE'?'短藤段':'短梢藤段'):(style==='SIDE'?'紧凑侧枝':'短弯细梢');
   const roleLabel=role==='MATURE'?'深绿':role==='MIXED'?'混合':c.id==='PHOTINIA'?'红嫩叶':c.id==='LIGUSTRUM'?'金黄嫩叶':'嫩绿';
   const name=c.id==='SCENE_FLOWER'?`${c.name}_${form}_成品V1`:`${c.name}_${form}_${roleLabel}_成品V1`;
   doc.settings.object_name=name;doc.authoring.workbench={name};doc.authoring.recipe.name=name;doc.authoring.recipe.tags.push('ALL_FINISHED_V1',role);
   doc.authoring=normalizeAuthoring(doc.authoring,doc.settings.seed);
   const sources=doc.leaf_meshes.map(u=>({...u,geometry:deserializeGeometry(u.geometry)}));let built=buildBranchAsset(doc.settings,null,sources,0,doc.authoring);
   if(c.kind!=='HERB'&&c.id!=='GINKGO')for(const b of built.masterBranches.filter(b=>!b.children.length)){
     if(built.placements.some(p=>p.branchStableId===b.stableId))continue;
     const pair=doc.settings.leaf_arrangement==='OPPOSITE';
     let source=doc.leaf_meshes.findIndex(u=>u.ageStage===(role==='MATURE'?'MATURE':'YOUNG'));if(source<0)source=0;
     for(let i=0;i<(pair?2:1);i++)doc.authoring.leaf_edits.added.push({id:`END_LEAF_${b.stableId}_${i}`,parent:b.stableId,t:.87,azimuth:i*180,scale:1,source});
   }
   for(const b of built.masterBranches.filter(b=>b.parentId>=0)){
     const parent=built.masterBranches.find(p=>p.id===b.parentId),ratio=branchRadiusAt(b,built.settings,0)/branchRadiusAt(parent,built.settings,b.parentT);
     if(ratio>.78){const scale=.68/ratio,rawBranch=doc.authoring.branch_shape.branches.find(x=>x.id===b.stableId);rawBranch.radius_profile=rawBranch.radius_profile.map(v=>v*scale);b.radiusProfile=b.radiusProfile.map(v=>v*scale);}
   }
   disposeBranchAsset(built);built=buildBranchAsset(doc.settings,null,sources,0,doc.authoring);
   const ratios=built.masterBranches.filter(b=>b.parentId>=0).map(b=>branchRadiusAt(b,built.settings,0)/branchRadiusAt(built.masterBranches.find(p=>p.id===b.parentId),built.settings,b.parentT));
   if(ratios.some(r=>r>=1)||built.report.invalid_vertices||built.report.degenerate_faces)throw Error('Geometry check '+name);
   if(c.id!=='SCENE_FLOWER'&&!built.placements.length)throw Error('No leaves '+name);
   const result={file:name+'.branch.json',name,style,role,branches:built.masterBranches.length,leaves:built.placements.length,organs:built.treeOrgans.length,triangles:built.report.triangles,maxChildRatio:Math.max(0,...ratios),report:built.report};
   report.samples.push(result);disposeBranchAsset(built);sources.forEach(u=>u.geometry.dispose());
   doc.workspaces={version:2,active:'BRANCH',tree:null,branch:null,vine:null};fs.writeFileSync(path.join(dir,result.file),JSON.stringify(doc));
 }
 fs.writeFileSync(path.join(dir,'制作数据.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({species:c.id,samples:report.samples.map(s=>({name:s.name,leaves:s.leaves,organs:s.organs}))}));
}
fs.writeFileSync(path.join(out,'缺少真实单元_待补素材.json'),JSON.stringify(Object.entries(TREE_SPECIES).filter(([,s])=>s.pending).map(([id,s])=>({id,name:s.name,category:s.category,reason:'未找到对应原始 Blender 叶花果文件，不能用占位素材验收为成品'})),null,2));
