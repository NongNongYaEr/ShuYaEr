import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerformanceRecorder,summarizeDurations} from '../web/performance-recorder.js';

test('diagnostics default to off and preserve return values and thrown errors',()=>{
  let clock=0,created=0;class Observer{constructor(){created++;}static supportedEntryTypes=['longtask'];}
  const recorder=createPerformanceRecorder({now:()=>clock,Observer});
  assert.equal(recorder.enabled,false);assert.equal(recorder.begin('disabled'),null);
  const value={exact:true};assert.equal(recorder.measure('disabled',()=>value),value);assert.throws(()=>recorder.measure('disabled',()=>{throw Error('original');}),/original/);
  recorder.frame(10);recorder.record('ignored',100);assert.equal(created,0);assert.deepEqual(recorder.snapshot().metrics,{});
});
test('bounded chronological samples expose observed count and nearest-rank percentiles without inventing GPU timings',()=>{
  const recorder=createPerformanceRecorder({capacity:8,now:()=>0,Observer:null});recorder.start();for(let i=1;i<=12;i++)recorder.record('work',i);
  const snapshot=recorder.snapshot({samples:true}),stats=snapshot.metrics.work;
  assert.deepEqual(stats.values_ms,[5,6,7,8,9,10,11,12]);assert.equal(stats.observed_samples,12);assert.equal(stats.p50_ms,8);assert.equal(stats.p95_ms,12);assert.equal(snapshot.gpu_time.status,'not_measured');
  snapshot.metrics.work.values_ms[0]=999;assert.equal(recorder.snapshot({samples:true}).metrics.work.values_ms[0],5);
  assert.deepEqual(summarizeDurations([NaN,-1,Infinity]),{samples:0,p50_ms:null,p95_ms:null,max_ms:null,total_ms:0});
});
test('frame gaps retain stalls, hidden frames rebase, and synchronous exceptions still record a span',()=>{
  let clock=0;const recorder=createPerformanceRecorder({now:()=>clock,Observer:null});recorder.start('drag');
  recorder.frame(0);recorder.frame(16);recorder.frame(516);recorder.frame(1016,false);recorder.frame(2016);recorder.frame(2032);
  assert.deepEqual(recorder.snapshot({samples:true}).metrics['frame.interval'].values_ms,[16,500,16]);
  assert.throws(()=>recorder.measure('throwing',()=>{clock=7;throw Error('same');}),/same/);assert.equal(recorder.snapshot().metrics.throwing.max_ms,7);
});
test('stopped and replaced sessions reject old asynchronous completions, and spans can end only once',()=>{
  let clock=0;const recorder=createPerformanceRecorder({now:()=>clock,Observer:null});recorder.start('old');const stale=recorder.begin('old');recorder.stop();recorder.start('new');clock=10;stale.end({scope:'stale'});assert.deepEqual(recorder.snapshot().metrics,{});
  const current=recorder.begin('commit');clock=15;current.end({scope:'FULL',payload:{large:true}});clock=20;current.end();const snap=recorder.stop();assert.equal(snap.metrics.commit.observed_samples,1);assert.equal(snap.metrics.commit.max_ms,5);assert.deepEqual(snap.events[0].metadata,{scope:'FULL'});assert.equal(snap.duration_ms,20);
});
test('long-task observation excludes preceding sessions, flushes pending entries, and disconnects on stop',()=>{
  let clock=100,instance;class Observer{static supportedEntryTypes=['longtask'];constructor(callback){this.callback=callback;this.entries=[];instance=this;}observe(){this.observed=true;}takeRecords(){return this.entries.splice(0);}disconnect(){this.disconnected=true;}}
  const recorder=createPerformanceRecorder({now:()=>clock,Observer});recorder.start();instance.callback({getEntries:()=>[{startTime:99,duration:80},{startTime:100,duration:60}]});instance.entries.push({startTime:101,duration:70});clock=200;const snapshot=recorder.stop();assert.equal(instance.disconnected,true);assert.equal(snapshot.metrics['main.longtask'].observed_samples,2);assert.equal(snapshot.metrics['main.longtask'].max_ms,70);
});
