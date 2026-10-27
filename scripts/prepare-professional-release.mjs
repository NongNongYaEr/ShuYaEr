// Reproducible, directory-based RC. Never copies .runtime, personal projects or
// the development source tree. No network or developer toolchain is required.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {copyReleaseInput} from './release-files.mjs';
import {auditProfessionalRelease} from './professional-release-audit.mjs';
import {verifyNativeProvenance} from './native-runtime-provenance.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>process.argv[process.argv.indexOf(name)+1];
const destination=process.argv[2]&&path.resolve(process.argv[2]);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const digest=async file=>{const h=createHash('sha256');for await(const bytes of fs.createReadStream(file))h.update(bytes);return h.digest('hex');};
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);};
const json=(file,data)=>write(file,JSON.stringify(data,null,2)+'\n');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Release symlink: '+e.name);const file=path.join(dir,e.name);return e.isDirectory()?walk(file):[file];});
if(!destination||destination===source)throw Error('Specify a fresh release directory');
if(process.argv.includes('--audit-only')){const report=await auditProfessionalRelease(destination);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}else if(process.argv.includes('--verify-only')){
 const manifest=read(path.join(destination,'release-manifest.json')),errors=manifest.passed?[]:['Candidate audit did not pass'];
 for(const file of manifest.files){const target=path.resolve(destination,file.path);if(!target.startsWith(destination+path.sep)||!fs.existsSync(target)||fs.statSync(target).size!==file.bytes||await digest(target)!==file.sha256)errors.push(file.path);}
 const payload=walk(destination).map(f=>path.relative(destination,f).replaceAll('\\','/')).filter(f=>!f.startsWith('.runtime/')&&!f.startsWith('导出/'));
 const expected=new Set(['release-manifest.json',...manifest.files.map(f=>f.path)]);
 errors.push(...payload.filter(f=>!expected.has(f)).map(f=>'Unlisted: '+f));
 console.log(JSON.stringify({passed:!errors.length,files:manifest.files.length,counts:manifest.counts,errors}));if(errors.length)process.exitCode=1;
}else{
 if(fs.existsSync(destination))throw Error('Release directory already exists; use a new version directory');
 if(!process.argv.includes('--desktop-root'))throw Error('--desktop-root with the verified candidate is required');
 const desktop=path.resolve(arg('--desktop-root')),release=read(path.join(source,'release-config.json')),native=read(path.join(desktop,'runtime/native/manifest.json'));
 verifyNativeProvenance(source,path.join(desktop,'runtime/native'));
 if(native.product_version!==release.version||native.entry!==release.entry||await digest(path.join(desktop,release.entry))!==native.entry_sha256)throw Error('Desktop candidate/version mismatch');
 for(const item of native.files)if(await digest(path.join(desktop,'runtime/native',item.name))!==item.sha256)throw Error('Native dependency mismatch: '+item.name);
 const copy=(from,relative)=>copyReleaseInput(from,destination,relative);
 const scripts=['unit-preparation-server.ps1','plant-unit-thumbnail-server.ps1','plant-pack-server.ps1','plant-pack-cli.mjs','plant-pack-library.mjs','plant-pack-container.mjs','branch-prefab-server.ps1','creative-library-server.ps1','project-files-server.ps1','project-library-server.ps1','project-session-server.ps1','project-template-current.ps1','trunk-section-preset-server.ps1','trunk-preset-server.ps1','trunk-preset-cli.mjs','pve-export-server.ps1','index-project-library.mjs','inspect-asset-references.mjs','export-pve-complete-units.mjs','export-pve-vine.mjs','export_branchforge_resolved_assembly.mjs','export-static-vegetation.mjs','pve-atlas.mjs','pve-atlas.ps1','pve-merged-atlas.mjs','pve-merged-atlas.ps1','pve-geometry-quality.mjs','pve-package.mjs','pve-final-package.mjs','pve-final-geometry.mjs','pve-unit-reuse.mjs','pve-bark-materials.mjs','pve-bark-setup.py','static-vegetation-package.mjs','static-texture-tint.ps1'];
 const rootFiles=['启动树鸭儿.bat','启动程序化树枝生成器.bat','Start_Branch_Generator.bat','server.ps1','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','WEBVIEW2-LICENSE.txt','WEBVIEW2-NOTICE.txt','branch-cli.mjs','pve-leaf-sources-cli.mjs','pve-skeleton-cli.mjs','pve-unit-glb-cli.mjs','pve-whole-tree-cli.mjs','vendor-loader.mjs','release-config.json'];
 for(const file of [...rootFiles,...scripts.map(f=>'scripts/'+f),'runtime/node.exe','runtime/NODE-LICENSE.txt','runtime/NOTICE.txt','web','assets/branch-asset-library'])copy(path.join(source,file),file);
 for(const file of ['叶花果大小调整反馈_0.2.45交付验收.md','叶花果校准竖立预览_0.2.44交付验收.md','叶花果校准参照与真实大小_0.2.43交付验收.md','资源三维视窗统一操控_0.2.42交付验收.md','叶花果整理独立入口_0.2.41交付验收.md','叶花果整包拆分与校准_0.2.40交付验收.md','单元枝完整检视_0.2.39交付验收.md','叶花果工作台布局与保存_0.2.38交付验收.md','资源中心单一关闭入口_0.2.37交付验收.md','分类标题插画左置_0.2.36交付验收.md','资源中心头像与醒目入口_0.2.35交付验收.md','资源分类标题设计_0.2.34交付验收.md','资源浏览主界面重排_0.2.33交付验收.md','资源图标与树鸭儿引导_0.2.32交付验收.md','资源卡片与检视排布_0.2.31交付验收.md','资源界面视觉细化_0.2.30交付验收.md','叶花果检视与全单元宫格_0.2.29交付验收.md','叶花果套装缩略图_0.2.28交付验收.md','资源中心整体设计_0.2.27交付验收.md','资源中心整体界面与交互规范.md','资源中心弹窗与导航_0.2.26交付验收.md','DX12运行库回退修复_0.2.25.md','资源依赖勾选_0.2.24交付验收.md','资源中心与预制快取栏使用说明.md','资源中心_0.2.23交付验收.md','植物资源包使用说明.md','植物资源包_0.2.22交付验收.md','植物资源包导入导出与本机管理规划.md','预制枝干项目与内容库.md','预制枝干资产体系与使用流程规划.md','预制枝干交互与面板布局规划.md'])copy(path.join(source,'交付说明',file),'使用说明/'+file);
 copy(path.join(desktop,release.entry),release.entry);copy(path.join(desktop,'runtime/native'),'runtime/native');
 const units=fs.readdirSync(path.join(source,'assets/plant-unit-library')).filter(f=>f.endsWith('.meta.json')).map(file=>({file,meta:read(path.join(source,'assets/plant-unit-library',file))})).filter(i=>i.meta.name.endsWith(' · 校准单元'));
 for(const {file}of units)for(const suffix of ['.meta.json','.plantunits.json']){const relative='assets/plant-unit-library/'+file.replace('.meta.json',suffix);copy(path.join(source,relative),relative);}
 const templates=fs.readdirSync(path.join(source,'assets/tree-template-library')).filter(f=>f.endsWith('.meta.json')).map(file=>({file,meta:read(path.join(source,'assets/tree-template-library',file))})).filter(i=>i.meta.batch==='ALL_PLANT_SAMPLE_V2'&&!i.meta.userSaved);
 for(const {file,meta}of templates){const preview='assets/tree-template-library/'+meta.id+'.png';copy(path.join(source,meta.path),meta.path);copy(path.join(source,meta.previewPath),preview);const publicMeta={...meta,previewPath:preview,sourcePath:meta.path,userSaved:false};delete publicMeta.originalSource;json(path.join(destination,'assets/tree-template-library',file),publicMeta);}
 json(path.join(destination,'assets/project-library/catalog.json'),{version:2,items:[],errors:[],scannedAt:null});
 const catalogFile=path.join(destination,'web/assets/plant-unit-catalog.json'),catalog=read(catalogFile);for(const item of catalog)item.source='软件内置叶花果资源';json(catalogFile,catalog);
 json(path.join(destination,'package.json'),{name:'tree-duck-professional',version:release.version,private:true,type:'module'});
 json(path.join(destination,'release.json'),{...release,builtAt:new Date().toISOString(),ueContractChanged:false,nativeManifest:'runtime/native/manifest.json',scope:'DX12 main viewport; auxiliary overlay, previews, thumbnails and multiview still use WebGL'});
 write(path.join(destination,'先读我_开始使用.txt'),`树鸭儿 ${release.version} 专业版候选 · Windows x64\n\n双击“树鸭儿.exe”。请保留整个文件夹，放在可写位置；系统需有 WebView2 与支持 DirectX 12 的显卡。内置 Node 和 DX12 运行依赖，无需开发缓存。\n\n主视口实体、线框、骨架和风权重使用 DX12。DLSS 质量可选，默认原始分辨率。视口出错会显示原因，工程保留，可重试 DX12 或保存工程。辅助控制点覆盖层、树皮小预览、缩略图和四视图尚含 WebGL；这部分仍在迁移。\n\n164 款正式单元枝、28 类整株样板、28 套校准叶花果随包附带。整树只编辑完整单元枝实例。工程格式仍为 4，UE/PVE 约定保持。首次运行在本目录生成 .runtime 缓存和配置，不读取开发目录的配置。重要工程请另存。\n\n0.2.45 大小输入实时显示模型变化与调整前范围，展示前后厘米、倍率和百分比；明确区分未生效输入、参照待应用、单元待确认、草稿保存和套装入库。
0.2.44 校准预览默认竖立，底点贴近水平参考地面、生长方向朝上、正面朝向观察者；方向轴与尺寸线同步展示，旧草稿和素材保存坐标保持兼容。
0.2.43 校准预览显示底点原点、XYZ 方向、长宽厚与厘米标尺；支持输入实际生长长度或两点已知长度等比定标，草稿保留参照，正式套装保持原标准。
0.2.42 资源三维视窗与主视口统一为中键旋转、Shift＋中键平移、滚轮沿光标缩放；整理台保持 Z 轴向上，左键用于框选与点位，按需预览完成阻尼收尾。
0.2.41 资源中心左侧「制作工具 → 叶花果整理」可直接打开整包 GLB 整理台，退出保留原浏览与单元枝草稿；保存后进入叶花果工作台继续检查。
0.2.40 新增叶花果整包 GLB 整理台，支持框选提取、底点／朝向／正面／尺寸校准、连续处理和共享套装保存；整理草稿与原始 GLB 副本可跨端口重启恢复。

0.2.39 单元枝可双击、Enter 或从详情打开完整模型检视，支持旋转缩放、材质／白模／线框与实际贴图查看；加入装配和编辑副本分别明确操作，固定依赖按原版本检视。

0.2.38 叶花果工作台采用左侧套装与单元、中间大模型、右侧属性／材质／导入布局；保存套装与加入装配分开，返回资源中心保留浏览，未保存修改可保存／放弃／继续编辑。

0.2.37 移除重复的返回创作按钮，保留唯一关闭叉号、Esc 和遮罩退出，窄窗口标题栏同步精简。\n\n0.2.36 分类标题改为左侧插画、中间说明、右侧主要入口，移除重复徽章并清理旧的右侧插画定位。\n\n0.2.35 资源中心左上角使用树鸭儿小插画，各分类制作入口突出图标、动作说明和箭头，并显示实际选区的禁用原因。\n\n0.2.34 五类资源标题分别配置树鸭儿插画、说明、使用要点与底色，保持紧凑版式和既有操作入口。\n\n0.2.33 重排日常资源浏览主界面，分类标题区显示树鸭儿引导，类型按钮组、四列大图、搜索栏和详情层级统一调整。\n\n0.2.32 统一五类资源植物图标与导入导出方向，空状态和资源包检查加入树鸭儿 IP 透明引导插画，保留真实模型缩略图。\n\n0.2.31 继续细化资源卡片元信息、详情固定主操作和叶花果检视参数排布，修复单位列表文字挤压。\n\n0.2.30 统一资源中心、各类资源详情、导入导出向导、命名分类表单和叶花果检视／工作台的视觉层级；资源位置显示数量，卡片选中反馈、操作图标、字号与窄窗口布局进一步细化。\n\n0.2.29 叶花果支持双击或 Enter 打开素材检视：逐个查看模型、尺寸、UV、材质与贴图，套装预览改为展示全部单位的均匀宫格。关闭检视保留资源位置与工程状态。\n\n0.2.28 补齐叶花果套装的真实模型缩略图，内置 28 套随软件附带；旧自定义套装按实际内容生成并缓存，保存和正常资源包导出同时保留预览。\n\n0.2.27 重新设计资源中心与内部子界面：类型数量、缩略图大小、分组详情、批量操作、统一表单及资源包三步向导。窄窗口使用详情抽屉，导入失败可重新选包。\n\n0.2.26 资源中心改为居中大弹窗，右上角可返回创作或关闭；导入、导出固定在弹窗顶部，分类恢复图标导航。\n\n0.2.25 修复 0.2.23／0.2.24 误带旧 DX12 运行库的问题。请使用本完整文件夹，保存并退出所有旧窗口后重新打开。原生构建记录位于 runtime/native/build-provenance.json。

这是本机验收候选包；跨机器、不同显卡和安装签名尚待验证。第三方许可在根目录、web/vendor、runtime/native。\n`);
 const report=await auditProfessionalRelease(destination,rootFiles);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}
