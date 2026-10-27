import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the implementation actually shipped in the renderer bundle.
const source=fs.readFileSync(new URL('../web/vendor/three.module.min.js',import.meta.url),'utf8');
const start=source.indexOf('function Xn(e,t){'),end=source.indexOf('function Kn(e,t,n){',start);
assert(start>=0&&end>start);const create=vm.runInNewContext('('+source.slice(start,end)+')');
function fixture(){
 let next=0;const live=new Set(),deleted=[];
 const gl={MAX_VERTEX_ATTRIBS:1,getParameter:()=>8,createVertexArray:()=>{const id=++next;live.add(id);return id;},bindVertexArray(){},deleteVertexArray:id=>{assert(live.delete(id),'a VAO must be deleted exactly once');deleted.push(id);}};
 const api=create(gl,{}),geometry=id=>({id,attributes:{}}),program=id=>({id,getAttributes:()=>({})}),object=id=>({id,isInstancedMesh:true});
 const setup=(o,g,p=program(1),wireframe=false)=>api.setup(o,{wireframe,defaultAttributeValues:{}},p,g,null);
 return {api,live,deleted,geometry,program,object,setup};
}

test('retiring one batch preserves another owner sharing the same geometry and program',()=>{
 const f=fixture(),a=f.object(1),b=f.object(2),g=f.geometry(1);f.setup(a,g);f.setup(b,g);f.setup(a,g,f.program(1),true);assert.equal(f.live.size,3);
 f.api.releaseStatesOfObject(a);assert.equal(f.live.size,1);f.setup(b,g);assert.equal(f.live.size,1);
 f.api.releaseStatesOfGeometry(g);assert.equal(f.live.size,0);f.api.releaseStatesOfObject(b);assert.equal(f.deleted.length,3);
});

test('geometry, program and renderer disposal leave no stale VAOs or double deletion',()=>{
 const f=fixture(),o=f.object(7),a=f.geometry(1),b=f.geometry(2),p=f.program(3);f.setup(o,a,p);f.setup(o,b,p);f.api.releaseStatesOfProgram(p);assert.equal(f.live.size,0);
 f.setup(o,a,p);f.api.releaseStatesOfGeometry(a);assert.equal(f.live.size,0);f.setup(o,b,p);f.api.releaseStatesOfObject(o);assert.equal(f.live.size,0);
 f.setup(o,a,p);f.setup(o,b,p);f.api.dispose();assert.equal(f.live.size,0);f.api.releaseStatesOfObject(o);f.api.releaseStatesOfGeometry(a);assert.equal(f.deleted.length,6);
});

test('ordinary meshes keep the original shared binding key and can recreate it after release',()=>{
 const f=fixture(),a={id:10},b={id:11},g=f.geometry(1);f.setup(a,g);f.setup(b,g);assert.equal(f.live.size,1);f.api.releaseStatesOfObject(a);assert.equal(f.live.size,0);f.setup(b,g);assert.equal(f.live.size,1);f.api.dispose();assert.equal(f.live.size,0);
});

test('many independently owned batches can retire while shared source geometry remains alive',()=>{
 const f=fixture(),g=Array.from({length:100},(_,n)=>f.geometry(n)),objects=Array.from({length:1000},(_,n)=>f.object(n+1));
 for(let n=0;n<objects.length;n++){f.setup(objects[n],g[n%g.length]);f.setup(objects[n],g[(n+1)%g.length],f.program(2));}
 for(const o of objects)f.api.releaseStatesOfObject(o);assert.equal(f.live.size,0);assert.equal(f.deleted.length,2000);
 for(const geometry of g)f.api.releaseStatesOfGeometry(geometry);f.api.dispose();assert.equal(f.deleted.length,2000);
});
