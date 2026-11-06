import {createMeshOptimizationJobs} from './core/mesh-optimization-service.mjs';
import {createFlowFieldCacheStore} from './core/flow-field-cache-store.mjs';
import {createDistributionLibrary} from './core/distribution-library.mjs';
import {createEffectLibrary} from './core/effect-library.mjs';
import {readMaterialLibrary} from './core/material-library.mjs';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {exportTextures,parseBakePayload} from './core/texture-export.mjs';
import {createUvJobs} from './core/uv-service.mjs';import {createProjectStore} from './core/project-store.mjs';import {parseGLB} from './model.js';import {restoreWorkingMesh} from './working-mesh.js';import {decodeUvResult} from './mesh-codec.js';
import {createExportJobs} from './core/export-jobs.mjs';
import {writeBatchReport} from './core/batch-report.mjs';
import {listenDesktop} from './core/browser-port.mjs';
import {ProjectWriteOrder} from './project-persistence.js';
import {saveIntegrationCheckpoint} from './core/integration-checkpoints.mjs';
const serviceVersion=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url))).version.split('.').slice(0,2).join('.');
export function createMaterialServer({root=path.dirname(fileURLToPath(import.meta.url)),ownerToken='',webRoot=path.join(root,'web')}={}){
  if(!fs.existsSync(webRoot))webRoot=root;
  const flowCache=createFlowFieldCacheStore({root,webRoot});
  const distributionLibrary=createDistributionLibrary({root}),effectLibrary=createEffectLibrary({root}),store=createProjectStore({root}),exports=createExportJobs({root}),uv=createUvJobs({root,executable:fs.existsSync(path.join(root,'runtime/native/TreeUvCore.exe'))?path.join(root,'runtime/native/TreeUvCore.exe'):path.join(root,'desktop/runtime/native/TreeUvCore.exe')});
  const optimize=createMeshOptimizationJobs({root,executable:fs.existsSync(path.join(root,'runtime/native/TreeMeshOptimize.exe'))?path.join(root,'runtime/native/TreeMeshOptimize.exe'):path.join(root,'.runtime/mesh-optimizer-build/TreeMeshOptimize.exe')});
  const writes=new ProjectWriteOrder(),closedSessions=new Set(),session=req=>{const id=req.headers['x-tree-material-session']||'';if(id&&!/^[a-f0-9-]{36}$/.test(id))throw Error('模块会话无效。');return id;},activeSession=req=>{const id=session(req);if(closedSessions.has(id))throw Error('模块已卸载，不接受迟到任务。');return id;};
  const sample=path.join(root,'sample','tree.glb');
  const send=(res,code,type,data)=>{res.writeHead(code,{'Content-Type':type,'Content-Length':Buffer.byteLength(data),'Cache-Control':'no-store'});res.end(data);};
  const json=(res,data,code=200)=>send(res,code,'application/json; charset=utf-8',JSON.stringify(data));
  const bytes=(req,limit=210_000_000)=>new Promise((resolve,reject)=>{let size=0,parts=[];req.on('data',b=>{size+=b.length;if(size>limit){reject(Error('请求过大。'));req.destroy();}else parts.push(b);});req.on('end',()=>resolve(Buffer.concat(parts)));req.on('error',reject);});
  const file=(res,p)=>{if(!fs.existsSync(p)||!fs.statSync(p).isFile())return json(res,{error:'文件不存在'},404);const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.json':'application/json','.zip':'application/zip'}[path.extname(p).toLowerCase()]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Content-Length':fs.statSync(p).size,'Cache-Control':'no-store'});fs.createReadStream(p).pipe(res);};
  const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),route=decodeURIComponent(url.pathname);
    if(req.headers.host!=='127.0.0.1:'+server.address()?.port)return json(res,{error:'Unrecognized local service host'},403);
    if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)return json(res,{error:'Cross-origin request rejected'},403);
    const handoff=route.match(/^\/api\/integration-input\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/);
    if(handoff){const project=url.searchParams.get('kind')==='project',p=path.join(root,'.runtime/integration-input',handoff[1]+(project?'.treeproj':'.glb'));if(req.method==='GET'){if(fs.existsSync(p)&&fs.statSync(p).size>(project?200000000:150000000))throw Error('树干传递超出容量');return file(res,p);}if(req.method==='DELETE'){fs.rmSync(p,{force:true});return json(res,{ok:true});}return json(res,{error:'Method not supported'},405);}
    if(req.method==='POST'&&route==='/api/integration-checkpoints'){activeSession(req);const data=JSON.parse(await bytes(req,16000000));return json(res,saveIntegrationCheckpoint({root,store,document:data.document,model:data.model}));}
    if(req.method==='POST'&&route==='/api/sessions/cancel'){const id=session(req);if(!id)throw Error('缺少模块会话。');closedSessions.add(id);writes.close(id);uv.cancelOwner(id);exports.cancelOwner(id);optimize.cancelOwner(id);return json(res,{ok:true});}
    if(req.method==='POST'&&route==='/api/batch-reports'){const body=await bytes(req);activeSession(req);return json(res,writeBatchReport(JSON.parse(body),{root}));}
    if(req.method==='GET'&&route==='/api/health')return json(res,{ok:true,product:'tree-material-lab',version:serviceVersion,desktop:true,sampleAvailable:fs.existsSync(sample)});
    if(req.method==='GET'&&route==='/api/flow-cache/info'){activeSession(req);return json(res,flowCache.info());}
    const cacheRoute=route.match(/^\/api\/flow-cache\/([a-f0-9]{64})$/);
    if(cacheRoute){const source=cacheRoute[1],key=url.searchParams.get('key'),algorithm=url.searchParams.get('algorithm');if(req.method==='GET'){activeSession(req);return send(res,200,'application/octet-stream',flowCache.get(source,key,algorithm));}if(req.method==='POST'){const body=await bytes(req,32*1024*1024);activeSession(req);return json(res,flowCache.put(source,key,algorithm,body));}}
    if(req.method==='POST'&&route==='/api/shutdown'){if(!ownerToken||req.headers['x-tree-material-owner']!==ownerToken)return json(res,{error:'Forbidden'},403);json(res,{ok:true});setTimeout(()=>server.close(),10);return;}
    if(req.method==='GET'&&route==='/api/sample')return file(res,sample);
    if(req.method==='GET'&&route==='/api/distributions')return json(res,distributionLibrary.list());
    if(req.method==='POST'&&route==='/api/distributions'){const body=await bytes(req);activeSession(req);if(body.length>16000)throw Error('分布预设过大。');return json(res,distributionLibrary.save(JSON.parse(body)));}
    if(req.method==='POST'&&/^\/api\/distributions\/[a-f0-9-]{36}\/delete$/.test(route)){activeSession(req);return json(res,distributionLibrary.remove(route.split('/')[3]));}
    if(req.method==='POST'&&/^\/api\/distributions\/[a-f0-9-]{36}\/restore$/.test(route)){activeSession(req);return json(res,distributionLibrary.restore(route.split('/')[3]));}
    if(req.method==='GET'&&route==='/api/effects')return json(res,effectLibrary.list());
    if(req.method==='POST'&&route==='/api/effects'){const body=await bytes(req);activeSession(req);if(body.length>2000000)throw Error('效果预设过大。');return json(res,effectLibrary.save(JSON.parse(body)));}
    if(req.method==='GET'&&/^\/api\/effects\/[a-f0-9-]{36}$/.test(route))return json(res,effectLibrary.read(route.split('/').at(-1)));
    if(req.method==='POST'&&/^\/api\/effects\/[a-f0-9-]{36}\/delete$/.test(route)){activeSession(req);return json(res,effectLibrary.remove(route.split('/')[3]));}
    if(req.method==='POST'&&/^\/api\/effects\/[a-f0-9-]{36}\/restore$/.test(route)){activeSession(req);return json(res,effectLibrary.restore(route.split('/')[3]));}
    if(req.method==='GET'&&route==='/api/materials')return json(res,{items:readMaterialLibrary(path.join(webRoot,'assets'))});
    if(req.method==='POST'&&route==='/api/material'){const b=await bytes(req);activeSession(req);if(b.length>50_000_000||b.length<33||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||b.readUInt32BE(16)>8192||b.readUInt32BE(20)>8192)throw Error('请使用长边8192以内的PNG素材。');const name='bark_'+createHash('sha256').update(b).digest('hex').slice(0,12)+'.png',dest=path.join(webRoot,'assets',name);if(!fs.existsSync(dest))fs.writeFileSync(dest,b,{flag:'wx'});return json(res,{name:'导入树皮 '+name.slice(5,11),url:'/assets/'+name});}
    if(req.method==='POST'&&route==='/api/blobs'){const body=await bytes(req);activeSession(req);return json(res,store.put(body));}
    if(req.method==='GET'&&/^\/api\/blobs\/[a-f0-9]{64}$/.test(route))return send(res,200,'application/octet-stream',store.get(route.split('/').at(-1)));
    if(req.method==='GET'&&route==='/api/projects')return json(res,{items:store.list()});
    if(req.method==='GET'&&route==='/api/projects/recovery'){try{return json(res,{record:store.recovery()});}catch(e){return json(res,{record:null,error:e.message});}}
    if(req.method==='POST'&&route==='/api/projects/import'){const body=await bytes(req);activeSession(req);return json(res,store.importBundle(body));}
    if(req.method==='POST'&&route==='/api/projects'){const data=JSON.parse(await bytes(req)),owner=activeSession(req);if(writes.isStale(owner,data.document?.id,data.sequence))return json(res,{stale:true,ignored:true});const record=store.save(data.document,{autosave:data.autosave===true,checkpoint:data.checkpoint===true});writes.remember(owner,data.document.id,data.sequence);return json(res,record);}
    const projectRoute=route.match(/^\/api\/projects\/([a-f0-9-]{36})(\/(?:bundle(?:-info)?|versions))?$/);
    if(req.method==='GET'&&projectRoute){const revision=url.searchParams.get('revision')||null;if(projectRoute[2]==='/versions')return json(res,{items:store.versions(projectRoute[1])});if(projectRoute[2]==='/bundle-info')return json(res,store.bundleInfo(projectRoute[1],revision));if(projectRoute[2]==='/bundle')return send(res,200,'application/octet-stream',store.bundle(projectRoute[1],revision));const record=revision?store.load(projectRoute[1],{revision}):url.searchParams.get('recovery')==='true'?store.recovery(projectRoute[1]):store.load(projectRoute[1]);if(!record)throw Error('该工程没有可用恢复记录。');return json(res,record);}
    if(req.method==='POST'&&route==='/api/mesh/jobs'){const body=await bytes(req),owner=activeSession(req),options=JSON.parse(url.searchParams.get('options')||'{}');return json(res,optimize.start(body,{...options,owner}));}
    const meshRoute=route.match(/^\/api\/mesh\/jobs\/([a-f0-9-]{36})(\/(result|cancel|release))?$/);
    if(meshRoute){const id=meshRoute[1],owner=activeSession(req);if(req.method==='GET'&&!meshRoute[2])return json(res,optimize.info(id,owner));if(req.method==='GET'&&meshRoute[3]==='result')return send(res,200,'application/octet-stream',optimize.result(id,owner));if(req.method==='POST'&&meshRoute[3]==='cancel')return json(res,optimize.cancel(id,owner));if(req.method==='POST'&&meshRoute[3]==='release')return json(res,optimize.release(id,owner));}
    if(req.method==='POST'&&route==='/api/uv/jobs'){const body=await bytes(req);return json(res,uv.start(body,{owner:activeSession(req),mode:url.searchParams.get('mode')||'repack',resolution:Number(url.searchParams.get('resolution')||2048),padding:Number(url.searchParams.get('padding')||12)}));}
    if(req.method==='POST'&&route==='/api/export/jobs'){const body=await bytes(req);return json(res,exports.start(body,{owner:activeSession(req)}));}
    const exportRoute=route.match(/^\/api\/export\/jobs\/([a-f0-9-]{36})(\/cancel)?$/);if(exportRoute){if(req.method==='GET'&&!exportRoute[2])return json(res,exports.info(exportRoute[1]));if(req.method==='POST'&&exportRoute[2])return json(res,exports.cancel(exportRoute[1]));}
    const uvRoute=route.match(/^\/api\/uv\/jobs\/([a-f0-9-]{36})(\/(result|cancel))?$/);
    if(uvRoute){if(req.method==='GET'&&!uvRoute[2])return json(res,uv.info(uvRoute[1]));if(req.method==='GET'&&uvRoute[3]==='result')return send(res,200,'application/octet-stream',uv.result(uvRoute[1]));if(req.method==='POST'&&uvRoute[3]==='cancel')return json(res,uv.cancel(uvRoute[1]));}
    if(req.method==='POST'&&route==='/api/export'){
      const payload=await bytes(req);activeSession(req);const {meta}=parseBakePayload(payload);let mesh=null;
      if(meta.resources?.source&&meta.resources?.working){const b=store.get(meta.resources.source),source=await parseGLB(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),meta.modelName);mesh=await restoreWorkingMesh(source,decodeUvResult(store.get(meta.resources.working)),{mode:meta.uvMode,revision:meta.uvRevision});if(mesh.sourceSHA256!==meta.sourceSHA256||mesh.uvSHA256!==meta.uvSHA256)throw Error('烘焙版本与工程模型不一致，请重新烘焙。');}
      return json(res,exportTextures(payload,{root,mesh}));
    }
    if(req.method!=='GET')return json(res,{error:'Not found'},404);
    if(route.includes('\\')||route.split('/').includes('..'))return json(res,{error:'Forbidden'},403);
    const base=route.startsWith('/exports/')?root:webRoot,p=path.resolve(base,'.'+(route==='/'?'/index.html':route));if(!p.startsWith(path.resolve(base)+path.sep))return json(res,{error:'Forbidden'},403);return file(res,p);
  }catch(e){if(!res.headersSent&&!res.destroyed)json(res,{error:e.message},400);else res.destroy();}});
  server.on('close',()=>{uv.dispose();exports.dispose();optimize.dispose();});return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),value=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]},port=Number(value('--port')||8767),server=createMaterialServer({ownerToken:value('--owner-token')||''});listenDesktop(server,{port,onAddress:address=>console.log('Tree Material Lab Desktop: '+address)});}
