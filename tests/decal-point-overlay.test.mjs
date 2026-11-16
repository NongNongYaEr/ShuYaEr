import assert from 'node:assert/strict';
import test from 'node:test';
import {decalPointLines,drawDecalPointOverlay,setDecalPointOverlay} from '../material/web/decal-point-overlay.js';

const model={
 pos:new Float32Array([0,0,0, 2,0,0, 0,2,0]),
 indices:new Uint32Array([0,1,2]),
 min:[0,0,0],height:2,sourceSHA256:'decal-overlay-test',
};
const point={
 id:'test-point',enabled:true,anchor:{face:0,bary:[.5,.25,.25]},
 widthMeters:.2,heightMeters:.4,depthMeters:.05,rotation:90,
};
const config={points:[point],source:model,actualHeightMeters:2};
const close=(a,b)=>Math.abs(a-b)<1e-6;
const vertices=positions=>Array.from({length:positions.length/3},(_,i)=>Array.from(positions.subarray(i*3,i*3+3)));

test('selected projection is a rotated box with the actual width, height and both depth planes',()=>{
 const ordinary=decalPointLines(model,config);
 assert.equal(ordinary.positions.length,12);
 assert.deepEqual(ordinary.visible,[point]);
 assert.ok(ordinary.groups.every(group=>group.throughColor===null));

 const selected=decalPointLines(model,{...config,selectedId:point.id});
 assert.equal(selected.positions.length,(4+24)*3);
 assert.deepEqual(selected.visible,[point]);
 const box=vertices(selected.positions).slice(4);
 for (const [x,y,z] of box) {
  assert.ok(close(Math.abs(x-.25),.1));
  assert.ok(close(Math.abs(y-.25),.05));
  assert.ok(close(Math.abs(z),.025));
 }
 const pairs=box.filter((vertex,index)=>index%2===0&&Math.abs(vertex[2]-box[index+1][2])>.049);
 assert.equal(pairs.length,4);

 const hovered=decalPointLines(model,{...config,hoveredId:point.id});
 assert.equal(hovered.positions.length,selected.positions.length);
 assert.ok(hovered.groups.every(group=>group.throughColor===null));
});

test('depth adjustment emphasizes four struts and the anchor normal, including occluded box edges',()=>{
 const preview={...point,depthMeters:.1};
 const overlay=decalPointLines(model,{...config,selectedId:point.id,preview,depthOnly:true});
 assert.deepEqual(overlay.visible,[]);
 assert.equal(overlay.positions.length,(4+24+2)*3);
 const struts=overlay.groups.find(group=>group.count===10);
 assert.ok(struts?.throughColor);
 assert.ok(struts.throughColor[3]<struts.color[3]);
 const rays=vertices(overlay.positions).slice(struts.first,struts.first+struts.count);
 for (let i=0;i<rays.length;i+=2) {
  const [start,end]=rays.slice(i,i+2);
  assert.ok(close(start[0],end[0])&&close(start[1],end[1]));
  assert.ok(close(Math.abs(start[2]-end[2]),preview.depthMeters*2/config.actualHeightMeters));
 }
 const [start,end]=rays.slice(-2);
 assert.ok(close(start[0],.25)&&close(start[1],.25));
 assert.ok(close(end[0],.25)&&close(end[1],.25));
});

test('depth mode invalidates the shared guide buffer and restores depth state after both passes',()=>{
 let depth=true,uploads=0,buffersDeleted=0,arraysDeleted=0;
 const draws=[];
 const gl={
  DEPTH_TEST:'depth',LINES:1,
  createVertexArray:()=>({}),createBuffer:()=>({}),
  bindVertexArray(){},bindBuffer(){},enableVertexAttribArray(){},vertexAttribPointer(){},
  bufferData(){uploads++;},
  deleteBuffer(){buffersDeleted++;},deleteVertexArray(){arraysDeleted++;},
  useProgram(){},uniformMatrix4fv(){},uniform1i(){},uniform4fv(){},
  depthMask(){},depthFunc(){},blendFunc(){},
  enable(flag){if(flag===this.DEPTH_TEST)depth=true;},
  disable(flag){if(flag===this.DEPTH_TEST)depth=false;},
  drawArrays(mode){assert.equal(mode,this.LINES);draws.push(depth);},
 };
 const renderer={gl,model,guideLocations:{}};
 const selected={...config,selectedId:point.id};
 setDecalPointOverlay(renderer,selected);
 setDecalPointOverlay(renderer,{...selected,depthOnly:true});
 setDecalPointOverlay(renderer,{...selected,depthOnly:true});
 assert.equal(uploads,2);
 drawDecalPointOverlay(renderer);
 assert.ok(draws.includes(false));
 assert.ok(draws.at(-1));
 assert.equal(depth,true);
 setDecalPointOverlay(renderer,null);
 assert.equal(buffersDeleted,1);
 assert.equal(arraysDeleted,1);
});
