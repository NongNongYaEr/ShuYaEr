import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const NATIVE_SOURCE_FILES=['native/render/EditorViewport.cpp','native/render/EditorStreamline.h','native/render/EditorViewport.hlsl','native/vendor/nlohmann/json.hpp'];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function protocolMarkers(directory){const bytes=fs.readFileSync(path.join(directory,'BranchForgeViewport.dll'));for(const key of ['material_table_protocol','retained_scene_protocol'])if(!bytes.includes(Buffer.from(key)))throw Error('DX12 DLL 缺少当前协议，检测到旧运行库');}
export function createNativeProvenance(root,directory,{compiler='',windowsSdk=''}={}){
  protocolMarkers(directory);
  const sources=NATIVE_SOURCE_FILES.map(file=>({path:file,sha256:hash(path.join(root,file))}));
  const result={version:1,viewport_abi:1,protocols:{material_table:1,retained_scene:1},builtAt:new Date().toISOString(),compiler,windowsSdk,
    sources,dll_sha256:hash(path.join(directory,'BranchForgeViewport.dll')),shader_sha256:hash(path.join(directory,'EditorViewport.hlsl'))};
  if(result.shader_sha256!==sources.find(s=>s.path.endsWith('EditorViewport.hlsl')).sha256)throw Error('Native shader does not match source');
  fs.writeFileSync(path.join(directory,'build-provenance.json'),JSON.stringify(result,null,2)+'\n');return result;
}
export function verifyNativeProvenance(root,directory){
  const file=path.join(directory,'build-provenance.json');
  if(!fs.existsSync(file))throw Error('DX12 运行库缺少源码构建记录，禁止使用旧缓存；请先运行 build-native-viewport.ps1');
  const data=read(file);
  if(data.version!==1||data.viewport_abi!==1||data.protocols?.material_table!==1||data.protocols?.retained_scene!==1||!Array.isArray(data.sources)||data.sources.length!==NATIVE_SOURCE_FILES.length)throw Error('DX12 构建记录无效');
  const sources=new Map(data.sources.map(s=>[s.path,s.sha256]));
  for(const source of NATIVE_SOURCE_FILES){if(!/^[a-f0-9]{64}$/.test(sources.get(source)||''))throw Error('DX12 构建源码清单不完整');if(root&&hash(path.join(root,source))!==sources.get(source))throw Error('DX12 构建已落后于当前源码：'+source);}
  if(hash(path.join(directory,'BranchForgeViewport.dll'))!==data.dll_sha256)throw Error('DX12 DLL 与源码构建记录不匹配，禁止替换入口');
  if(hash(path.join(directory,'EditorViewport.hlsl'))!==data.shader_sha256||data.shader_sha256!==sources.get('native/render/EditorViewport.hlsl'))throw Error('DX12 着色器与构建记录不匹配');
  protocolMarkers(directory);
  return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[action,folder,compiler,windowsSdk]=process.argv.slice(2);
  try{if(!folder)throw Error('Native build directory is required');const directory=path.resolve(folder);const result=action==='create'?createNativeProvenance(root,directory,{compiler,windowsSdk}):action==='verify'?verifyNativeProvenance(root,directory):null;if(!result)throw Error('Unknown provenance operation');console.log(JSON.stringify({passed:true,dll_sha256:result.dll_sha256}));}catch(error){console.error(error.message);process.exitCode=1;}
}
