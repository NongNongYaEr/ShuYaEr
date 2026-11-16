import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleMaskThumbnail} from '../material/web/surface-studio-ui.js';

const size=80,channel=2;
const offset=(x,y,c=channel)=>(y*size+x)*4+c;

test('a sparse mask missed by point sampling displays its original values in the correct thumbnail cells',()=>{
 const map=new Uint8Array(size*size*4);
 map[offset(1,1)]=56;
 map[offset(0,1)]=89;
 map[offset(79,79)]=17;
 const thumbnail=sampleMaskThumbnail(map,size,channel);
 assert.equal(thumbnail[39*40],89);
 assert.equal(thumbnail[39],17);
 assert.equal(thumbnail.filter(Boolean).length,2);
});

test('a nonempty point sample keeps the existing fast path and grayscale levels',()=>{
 const map=new Uint8Array(size*size*4);
 map[offset(0,0)]=5;
 map[offset(1,1)]=200;
 const thumbnail=sampleMaskThumbnail(map,size,channel);
 assert.equal(thumbnail[39*40],5);
 assert.equal(thumbnail.filter(Boolean).length,1);
});

test('fallback cells align with point-sample origins at noninteger scales',()=>{
 const width=82,map=new Uint8Array(width*width*4);
 map[(3*width+2)*4+channel]=87;
 const thumbnail=sampleMaskThumbnail(map,width,channel);
 assert.equal(thumbnail[38*40+1],87);
 assert.equal(thumbnail.filter(Boolean).length,1);
});

test('an empty mask stays black even when other channels have coverage',()=>{
 const map=new Uint8Array(size*size*4);
 map[offset(1,1,1)]=255;
 map[offset(0,0,3)]=255;
 assert.deepEqual(sampleMaskThumbnail(map,size,channel),new Uint8Array(40*40));
});
