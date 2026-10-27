import fs from 'node:fs/promises';
import {TREE_SPECIES,createTreeSpeciesDocument,treeSpeciesStyles} from '../web/tree-species-library.js';
import {PLANT_GROWTH_PROFILES} from '../web/plant-growth-profiles.js';
const delivered=new URL('../初始样本/植物枝型预设V3/',import.meta.url);
const served=new URL('../web/assets/references/植物枝型预设V3/',import.meta.url);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const sources={SAPINDUS:'https://www.nmns.edu.tw/en/exhibitions/galleries/plants/group5/sapindus-mukorossi/index.html',LIGUSTRUM_QUIHOUI:'https://w3.biosci.utexas.edu/prc/K12/pages/Ligustrum%20quihoui.html',METASEQUOIA:'https://landscapeplants.oregonstate.edu/plants/metasequoia-glyptostroboides',CEDRUS:'https://landscapeplants.oregonstate.edu/plants/cedrus-deodara',KOELREUTERIA:'https://plants.ces.ncsu.edu/plants/koelreuteria-paniculata/',FRAXINUS:'https://www.treesandshrubsonline.org/articles/fraxinus/fraxinus-chinensis/',PYRACANTHA:'https://efloras.org/florataxon.aspx?flora_id=2&taxon_id=200011175',NERIUM:'https://plants.ces.ncsu.edu/plants/nerium-oleander/',HIBISCUS:'https://plants.ces.ncsu.edu/plants/hibiscus-syriacus/',LOROPETALUM:'https://plants.ces.ncsu.edu/plants/loropetalum-chinense/',EUONYMUS:'https://plants.ces.ncsu.edu/plants/euonymus-japonicus/'};
function drawing(branches,side){
 const project=p=>side?[p[0],-p[2]]:[p[0]*.82-p[1]*.58,-p[2]+p[0]*.12+p[1]*.17];
 const points=branches.flatMap(b=>b.points.map(project)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,scale=Math.min(280/Math.max(w,.01),185/Math.max(h,.01));
 const mx=(320-w*scale)/2,my=(215-h*scale)/2;
 return `<svg viewBox="0 0 320 215" role="img" aria-label="${side?'正面':'斜视'}枝干预览">${branches.map(b=>`<polyline fill="none" stroke="${['#e8c38e','#bf9e77','#a88f71','#897e6c'][b.order]}" stroke-width="${Math.max(.55,Math.min(5,b.start_radius*scale*1.4))}" stroke-linecap="round" stroke-linejoin="round" points="${b.points.map(project).map(p=>`${((p[0]-x)*scale+mx).toFixed(1)},${((p[1]-y)*scale+my).toFixed(1)}`).join(' ')}"/>`).join('')}</svg>`;
}
const records=[],cards=[],rows=[];
for(const [id,spec] of Object.entries(TREE_SPECIES)){
 if(spec.pending&&spec.batch===2){
  const image=`${spec.folder}_综合单元.png`;
  await fs.copyFile(new URL(`../assets/references/植物综合第二批_30类/${image}`,import.meta.url),new URL(`../web/assets/references/植物综合第二批_30类/${image}`,import.meta.url));
 }
 const profile=PLANT_GROWTH_PROFILES[id],previews=[];
 for(const style of ['MAIN','SIDE','TIP']){
  const doc=createTreeSpeciesDocument(id,style,12037),label=treeSpeciesStyles(spec)[style],file=`${spec.folder}/${spec.name}_${label}_骨架V3.branch.json`;
  const project={...doc,workspaces:{version:2,active:'BRANCH',tree:null,branch:structuredClone(doc),vine:null}};
  for(const base of [delivered,served]){await fs.mkdir(new URL(spec.folder+'/',base),{recursive:true});await fs.writeFile(new URL(file,base),JSON.stringify(project));}
  previews.push(`<div class="preview"><h3>${esc(label)}</h3><div class="oblique">${drawing(doc.authoring.branch_shape.branches,false)}</div><div class="front">${drawing(doc.authoring.branch_shape.branches,true)}</div><a href="${encodeURI(file)}" download>下载骨架工程 · ${doc.authoring.branch_shape.branches.length} 枝段</a></div>`);
  records.push({id,name:spec.name,style,label,file,pending:!!spec.pending,branches:doc.authoring.branch_shape.branches.length});
 }
 const source=sources[id]||spec.source;
 rows.push(`| ${spec.name} | ${spec.pending?'待单元':'已有单元'} | ${profile.summary} | ${source?`[参考](${source})`:'沿用现有植物资料，枝型为美术预设'} |`);
 cards.push(`<article data-category="${spec.category||'TREE'}" data-pending="${!!spec.pending}"><header><h2>${esc(spec.name)}</h2><span>${spec.pending?'待单元 · 枝干已就绪':'已有单元'}</span></header><p>${esc(profile.summary)}</p><div class="previews">${previews.join('')}</div>${source?`<a class="source" href="${esc(source)}" target="_blank" rel="noopener">植物习性参考</a>`:''}</article>`);
}
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>48 类植物 · 枝型预设 V3</title><style>*{box-sizing:border-box}body{margin:0;background:#101914;color:#e0e7db;font:15px/1.65 system-ui,sans-serif}main{max-width:1250px;margin:auto;padding:28px}h1{margin:0;font-size:28px}h2{margin:0;font-size:21px}p{color:#b6c5b9}.bar{display:flex;gap:10px;flex-wrap:wrap;position:sticky;top:0;padding:12px;background:#101914f5;z-index:2}button,input,select{font:inherit;padding:7px 12px;border:1px solid #54685b;border-radius:6px;background:#233a2b;color:#e0e7db}input{flex:1;min-width:160px}article{margin:20px 0;padding:20px;border:1px solid #3c5144;border-radius:12px;background:#18251d}article header{display:flex;justify-content:space-between;gap:12px}article header span{color:#d6c385}article .previews{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.preview{background:#101a14;border-radius:8px;padding:10px;min-width:0}.preview h3{margin:0;font-size:14px}svg{width:100%;display:block}a{color:#d5c895;font-size:13px}.front{display:none}body[data-view=front] .front{display:block}body[data-view=front] .oblique{display:none}.source{display:inline-block;margin-top:12px}[hidden]{display:none!important}@media(max-width:650px){article .previews{grid-template-columns:1fr}main{padding:12px}}</style><body><main><h1>48 类植物 · 枝型预设 V3</h1><p>144 个命名骨架工程，包含 25 类待单元植物。图示来自软件实际生成的枝干曲线；各图独立适配画面，不用于比较绝对尺寸。</p><p>软件“创建 → 植物”会使用新预设并接入已有真实素材。此目录下载的是轻量骨架工程，附占位叶设置，方便提前调枝干；不重复打包贴图。已有手工工程不会被自动替换。</p><p>这些是参考生长习性的美术预设，品种、树龄、修剪和环境会改变真实形态。修剪球和绿篱继续由尺寸参数控制。当前不模拟树皮细节、芽痕、气生根或完整生长年轮。</p><div class="bar"><input id="search" placeholder="搜索植物或枝型特点" aria-label="搜索植物"><select id="category" aria-label="筛选类别"><option value="">全部类别</option><option value="TREE">乔木</option><option value="SHRUB">灌木</option><option value="POTTED">盆栽</option></select><select id="pending" aria-label="筛选素材状态"><option value="">全部素材状态</option><option value="true">待单元</option><option value="false">已有单元</option></select><button id="view">切换到正面</button><span id="count">48 类</span></div>${cards.join('')}</main><script>const q=id=>document.getElementById(id);function filter(){let n=0;for(const e of document.querySelectorAll('article')){e.hidden=!(e.textContent.includes(q('search').value)&&(!q('category').value||e.dataset.category===q('category').value)&&(!q('pending').value||e.dataset.pending===q('pending').value));if(!e.hidden)n++;}q('count').textContent=n+' 类';}['search','category','pending'].forEach(id=>q(id).addEventListener('input',filter));q('view').onclick=()=>{const f=document.body.dataset.view!=='front';document.body.dataset.view=f?'front':'oblique';q('view').textContent=f?'切换到斜视':'切换到正面';};</script></body></html>`;
const doc=`# 植物枝型预设 V3\n\n48 类、144 个主枝/侧枝/细梢（或对应整丛/盆栽）骨架工程。25 类尚无真实单元的植物也已包含。打开同目录 00_枝型目录.html 可浏览。\n\n新建使用新版；旧工程保存的曲线不会被自动重做。树种枝条可在“调整 → 树种结构”重新生成，保留素材且支持撤销。骨架工程使用占位叶设置，真实材质在软件新建植物时接入。\n\n枝型是美术抽象，枝数、角度、比例是设计参数，不是植物学常数；叶序不代表每个腋芽都发育为木质枝。自然整丛与人工修剪球/绿篱分开。\n\n| 植物 | 单元状态 | 枝型策略 | 参考 |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`;
for(const base of [delivered,served]){await fs.writeFile(new URL('00_枝型目录.html',base),html);await fs.writeFile(new URL('枝型说明.md',base),doc);await fs.writeFile(new URL('manifest.json',base),JSON.stringify(records,null,2));}
console.log(`Prepared ${records.length} skeleton projects for ${cards.length} species.`);


