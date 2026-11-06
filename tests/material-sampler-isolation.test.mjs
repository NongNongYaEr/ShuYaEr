import {test} from 'node:test';import assert from 'node:assert/strict';
import {Renderer} from '../material/web/renderer.js';
import {createDocument} from '../material/web/project-state.js';
test('13槽协议：实时及烘焙保留苔藓/贴花Atlas，检查用ORM和发光，分布预览保留自身纹理',()=>{
 const r=Object.create(Renderer.prototype),units=new Map(),uniforms=new Map();let active=0;
 r.gl={TEXTURE0:0,TEXTURE7:7,TEXTURE_2D:3553,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,useProgram(){},bindVertexArray(){},texParameteri(){},activeTexture(v){active=v;},bindTexture(target,t){units.set(active,t);}};
 r.settings={...createDocument({source:'a'.repeat(64),name:'sampler-test',settings:{}}).settings,tint:'#ffffff',mossColor:'#456b32',paintColor:'#eeebdc'};r.model={sourceSHA256:'a'.repeat(64),uvSHA256:'b'.repeat(64)};r.uniform=(name,type,value)=>uniforms.set(name,value);
 for(const name of ['bark','original','heightMap','roughMap','normalMap','coatingAtlas'])r[name]={name};
 for(const bake of [false,true]){r.setup(bake,-1);assert.strictEqual(units.get(10),r.coatingAtlas);assert.equal(uniforms.get('uCoatEnabled'),1);assert.strictEqual(units.get(1),r.original);}
 r.bakedPreviewSet={metadata:{sourceSHA256:r.model.sourceSHA256,uvSHA256:r.model.uvSHA256,emissionStrength:3},textures:{bakedColor:{name:'baked-color'},bakedNormal:{name:'baked-normal'},bakedORM:{name:'baked-orm'},bakedEmission:{name:'emission'}}};r.bakedPreviewActive=true;
 r.setup(false,-1);assert.strictEqual(units.get(10),r.bakedPreviewSet.textures.bakedORM);assert.strictEqual(units.get(1),r.bakedPreviewSet.textures.bakedEmission);assert.equal(uniforms.get('uCoatEnabled'),0);assert.equal(uniforms.get('uHasBakedEmission'),1);
 r.setup(true,1);assert.strictEqual(units.get(10),r.coatingAtlas);assert.strictEqual(units.get(1),r.original);assert.equal(uniforms.get('uHasBakedEmission'),0);
 r.surfacePreviewMap={name:'mask-preview'};r.setup(false,12);assert.strictEqual(units.get(10),r.surfacePreviewMap);
});
