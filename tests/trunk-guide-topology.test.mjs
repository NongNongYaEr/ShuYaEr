import test from 'node:test';
import assert from 'node:assert/strict';
import {pointOnTrunkGuide,validateTrunkGuides} from '../web/imported-trunk-data.js';
import {guideEditPoints,subdivideTrunkSegments,interiorSegmentPoints,segmentDeletionPoints,planTrunkPointDeletion,dissolveTrunkPoints,removeTrunkBranches,reattachTrunkBranch} from '../web/trunk-guide-topology.js';

const guide=(id,parent,attach,points)=>({id,parent,attach,points,start_radius:.2,end_radius:.1});
const root=guide('root',null,0,[[0,0,0],[0,0,2],[0,0,3]]);
const a=guide('a','root',.5,[[0,0,1.5],[1,0,2],[2,0,2]]);
const b=guide('b','a',.5,[[.9,0,2],[1,1,3]]);
const c=guide('c','root',.8,[[0,0,2.4],[-1,0,3]]);
const asset={guides:[root,a,b,c],binding:{primitive_guides:{one:['a','b'],two:['a'],three:['c']}},primitives:[]};
const point=(guide,index)=>({guide,index});

test('subdivision adds equal intervals, keeps child attachment and selects only new points',()=>{
 const next=subdivideTrunkSegments(asset,[point('root',0),point('c',0)],2);
 assert.deepEqual(next.model.guides[0].points,[[0,0,0],[0,0,2/3],[0,0,4/3],[0,0,2],[0,0,3]]);
 assert.deepEqual(next.points,[point('root',1),point('root',2),point('c',1),point('c',2)]);
 assert.equal(next.model.guides[1].attach,a.attach);
 assert.equal(next.model.primitives,asset.primitives);
 assert.equal(asset.guides[0].points.length,3);
 assert.deepEqual(guideEditPoints(asset,'segment',[point('root',0),point('root',1)]),[point('root',0),point('root',1),point('root',2)]);
});

test('dissolving selected adjoining segments preserves endpoints and existing joints',()=>{
 const middle=interiorSegmentPoints(asset,[point('root',0),point('root',1)]);
 assert.deepEqual(middle,[point('root',1)]);
 const next=dissolveTrunkPoints(asset,middle);
 assert.deepEqual(next.guides[0].points,[[0,0,0],[0,0,3]]);
 assert.equal(pointOnTrunkGuide(next.guides[0].points,next.guides[1].attach).position.z,1.5);
 const bent=dissolveTrunkPoints(asset,[point('a',1)]);
 assert.equal(bent.guides[2].parent,'a');
 assert.deepEqual(bent.guides[2].points,b.points);
 const original=pointOnTrunkGuide(a.points,b.attach).position;
 assert(Math.abs(bent.guides[2].attach-(2*original.x+.5*(original.z-1.5))/4.25)<1e-9);
 assert.throws(()=>dissolveTrunkPoints(asset,[point('root',0)]),/保护/);
 assert.throws(()=>dissolveTrunkPoints(asset,[point('b',1)]),/至少保留两个/);
});

test('terminal segment and point deletions fall through to branch review at two points',()=>{
 assert.deepEqual(segmentDeletionPoints(asset,[point('a',1)]),[point('a',2)]);
 assert.deepEqual(segmentDeletionPoints(asset,[point('a',0)]),[]);
 const shortened=dissolveTrunkPoints(asset,[point('a',2)]);
 assert.deepEqual(planTrunkPointDeletion(shortened,[point('a',1)]),{points:[],branches:['a'],protectedCount:0});
 assert.deepEqual(planTrunkPointDeletion(asset,[point('c',0),point('root',0),point('root',1),point('c',1)]),{points:[point('root',1)],branches:['c'],protectedCount:1});
 assert.deepEqual(planTrunkPointDeletion(asset,root.points.map((_,i)=>point('root',i))),{points:[point('root',1)],branches:[],protectedCount:2});
 assert.deepEqual(planTrunkPointDeletion(asset,[point('c',0)]),{points:[],branches:[],protectedCount:1});
});

test('a child attachment follows its original parent edge at a crossing',()=>{
 const folded=guide('folded','root',.5,[[0,0,1],[2,0,1],[2,2,1],[0,2,1],[.5,0,1]]);
 const child=guide('child','folded',.15,[[.5,0,1],[.5,0,2]]);
 const old=pointOnTrunkGuide(folded.points,child.attach).position;
 const result=dissolveTrunkPoints({...asset,guides:[root,folded,child]},[point('folded',1)]);
 const moved=pointOnTrunkGuide(result.guides[1].points,result.guides[2].attach);
 assert.equal(moved.index,0);
 assert(moved.position.distanceTo(old)>0.2);
 assert.deepEqual(result.guides[2].points,child.points);
});

test('branch deletion cleans bindings and can preserve descendants under a chosen parent',()=>{
 const removed=removeTrunkBranches(asset,['a']);
 assert.deepEqual(removed.guides.map(g=>g.id),['root','c']);
 assert.deepEqual(removed.binding.primitive_guides,{three:['c']});
 const kept=removeTrunkBranches(asset,['a'],{keepChildren:true,parentId:'c'});
 assert.deepEqual(kept.guides.map(g=>g.id),['root','c','b']);
 assert.equal(kept.guides[2].parent,'c');
 assert.deepEqual(kept.guides[2].points,b.points);
 assert.deepEqual(kept.binding.primitive_guides,{one:['b'],three:['c']});
 assert.throws(()=>removeTrunkBranches(asset,['a'],{keepChildren:true,parentId:'b'}),/父枝/);
 assert.throws(()=>removeTrunkBranches(asset,['root']),/主控制枝/);
});

test('explicit reattachment sets segment position, reorders parents and rejects cycles',()=>{
 const next=reattachTrunkBranch(asset,'a',{guide:'c',index:0,t:.25});
 validateTrunkGuides(next.guides);
 assert.deepEqual(next.guides.map(g=>g.id),['root','c','a','b']);
 assert.equal(next.guides[2].attach,.25);
 assert.equal(next.guides[2].points,a.points);
 assert.throws(()=>reattachTrunkBranch(asset,'a',{guide:'b',index:0}),/父枝/);
});
