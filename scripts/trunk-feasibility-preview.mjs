import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(workspace,'web'),samples=path.join(workspace,'.runtime/trunk-feasibility');
const port=Number(process.argv[2]||19905);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
    const raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const isSample=raw.startsWith('/samples/'),root=isSample?samples:web;
    const relative=isSample?raw.slice(9):raw==='/'?'trunk-feasibility.html':raw.slice(1);
    const target=path.resolve(root,relative),prefix=root+path.sep;
    if(!target.startsWith(prefix)||!fs.statSync(target).isFile())throw Error('missing');
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Trunk feasibility preview: http://127.0.0.1:${port}\n`));
