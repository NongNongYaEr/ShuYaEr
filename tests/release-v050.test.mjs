import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {publicSourcePathAllowed,runtimeMaterialPathAllowed} from '../scripts/v050-distribution-inputs.mjs';
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
test('桌面开发构建与清单匹配，材质 DLL 和着色器保持 ABI 1 与 13 槽',()=>{
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
  const release=read('release-config.json'),desktop=read('runtime/native/manifest.json');
  assert.equal(desktop.product_version,release.version);
  assert.equal(desktop.entry,release.entry);
  assert.equal(sha(release.entry),desktop.entry_sha256);
  const proof=read('material/native/material-native-verification.json');
  assert(proof.passed);
  assert.equal(proof.abi,1);
  assert.equal(proof.slots,13);
  const runtime='material/runtime/native-material/';
  assert.equal(sha(runtime+'TreeMaterialDX12.dll'),proof.sha256);
  assert.equal(sha(runtime+'shader-layout.json'),proof.shaderLayoutSHA256);
  const layout=read(runtime+'shader-layout.json');
  for(const stage of [...Object.values(layout.stages),...Object.values(layout.sceneVariants||{})]){
    if(stage.binary&&stage.binarySHA256)assert.equal(sha(runtime+stage.binary),stage.binarySHA256);
  }
});
test('用户指定二球悬铃木原始单元枝和登记记录均按V040归档字节保留',()=>{const base=JSON.parse(fs.readFileSync('v040-baseline.json')),prefix='assets/branch-asset-library/7abc681b16decc47970d938f191d9335cecd4027e630fcb74e6998a4cff9c0e0';for(const suffix of ['.meta.json','.branchasset.json']){const file=prefix+suffix;assert.equal(sha(file),base.files.find(f=>f.path===file).sha256);}const m=JSON.parse(fs.readFileSync(prefix+'.meta.json'));assert.equal(m.id,'FINISHED_PLATANUS_SIDE_MATURE_V1');});
test('公开源码排除运行二进制，保留原生源码和许可；服务没有开发者私有模型回退',()=>{for(const p of ['native/a.dll','material/native/a.cso','native/a.obj','runtime/node.exe','native/x.lib'])assert.equal(publicSourcePathAllowed(p),false);for(const p of ['native/a.cpp','material/native/a.hlsl','native/LICENSE.txt'])assert.equal(publicSourcePathAllowed(p),true);assert(!fs.readFileSync('material/server.mjs','utf8').includes("'新建文件夹'"));});

test('运行资源保留当前图集和可编辑基材，制作中间图只进04',()=>{assert(runtimeMaterialPathAllowed('material/web/assets/coatings/coating-atlas-v3-c.png'));assert(runtimeMaterialPathAllowed('material/web/assets/bark-new-banyan-rope-v1-normal-gl.png'));assert(runtimeMaterialPathAllowed('material/web/assets/sculpt-bark/sources/wide-bark.png'));assert(!runtimeMaterialPathAllowed('material/web/assets/coatings/coating-atlas-v1.png'));assert(!runtimeMaterialPathAllowed('material/web/assets/surface-decals/algae-green-normal-dx.png'));});

test('隐藏发布验收写入的GLB与服务请求使用同一有效UUID',()=>{const s=fs.readFileSync('native/V050ReleaseProbe.cs','utf8'),ids=s.match(/11111111-1111-4111-8111-1+/g);assert(ids.length>=2);assert(ids.every(id=>id==='11111111-1111-4111-8111-111111111111'));});
