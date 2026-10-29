import test from 'node:test';import assert from 'node:assert/strict';import {createViewportContext} from '../web/viewport-context.js';
test('workbench presentation restores the exact main context and an old close cannot affect the next workbench',()=>{
 const make=()=>({scene:{},camera:{},renderer:{},canvas:{}}),main=make(),a=make(),b=make(),installed=[],state=createViewportContext(main,v=>installed.push(v)),closeA=state.enter(a);assert.equal(state.current,a);assert.throws(()=>state.enter(b),/关闭/);closeA();assert.equal(state.current,main);const closeB=state.enter(b);closeA();assert.equal(state.current,b);closeB();assert.deepEqual(installed,[a,main,b,main]);
});
test('an incomplete or failed workbench cannot replace the current viewport',()=>{
 const main={scene:{},camera:{},renderer:{},canvas:{}},state=createViewportContext(main,v=>{if(v!==main)throw Error('renderer failed');});assert.throws(()=>state.enter({}));assert.equal(state.current,main);assert.throws(()=>state.enter({...main}),/renderer failed/);assert.equal(state.current,main);
});
