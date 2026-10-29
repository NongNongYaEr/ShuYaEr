import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../web/vendor/three.module.min.js';
import {createTrunkGuideIndex} from '../web/trunk-guide-index.js';
import {closestTrunkGuide} from '../web/imported-trunk-data.js';

test('guide BVH retains the exact linear nearest segment, endpoint and seam tie',()=>{
 let seed=92345;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const guides=Array.from({length:80},(_,i)=>({id:'G'+i,points:Array.from({length:12},(_,j)=>[i*.12+random()*.06,Math.sin(j*.7+i)*.2,j*.3])}));
 guides.push({id:'DUPLICATE',points:guides[0].points.map(p=>p.slice())});
 const indexed=createTrunkGuideIndex(guides),samples=[new T.Vector3(...guides[0].points[3]),new T.Vector3(...guides[79].points.at(-1)),...Array.from({length:1000},()=>new T.Vector3(random()*12-1,random()*3-1.5,random()*5-1))];
 for(const p of samples){const expected=closestTrunkGuide(p,guides),actual=indexed(p);assert.equal(actual.id,expected.id);assert.equal(actual.index,expected.index);assert(Math.abs(actual.u-expected.u)<1e-12);assert(Math.abs(actual.t-expected.t)<1e-12);assert(actual.point.distanceTo(expected.point)<1e-12);}
 assert.equal(indexed(samples[0]).id,'G0');
});
