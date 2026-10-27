import test from 'node:test';
import assert from 'node:assert/strict';
import {trunkPointTransformInputKey as key,parseTrunkPointTransformInput as parse} from '../web/trunk-point-transform-input.js';
test('R/S numeric text accepts signed angles, decimal factors and editing without changing gesture scope',()=>{
 let state={action:'ROTATE',text:''};for(const c of '-15.5')state={...state,...key({key:c},state)};assert.deepEqual(parse(state.text,state.action),{valid:true,value:-15.5});state={...state,...key({key:'Backspace'},state)};assert.equal(state.text,'-15.');assert.equal(parse(state.text,state.action).value,-15);assert.equal(key({key:'Delete'},state).text,'');assert.deepEqual(parse('1.1','SCALE'),{valid:true,value:1.1});assert.equal(key({key:','},{action:'SCALE',text:'1'}).text,'1.');
});
test('move numbers default to section X and explicit axes toggle without global transforms',()=>{
 assert.deepEqual(key({key:'1'},{action:'MOVE',text:''}),{text:'1',axis:'X'});assert.deepEqual(key({key:'y'},{action:'MOVE',text:'10',axis:'X'}),{text:'10',axis:'Y',axisChanged:true});assert.equal(key({key:'y'},{action:'MOVE',text:'',axis:'Y'}).axis,null);assert.equal(key({key:'y'},{action:'MOVE',text:'10',axis:'Y'}).axis,'Y','typed distance always has a named axis');assert.equal(key({key:'x'},{action:'ROTATE',text:''}),null);
});
test('incomplete, nonfinite, excessive, zero or negative scale text cannot confirm',()=>{
 for(const s of ['-','.','1..2','Infinity','NaN','1e3','1;2'])assert.equal(parse(s,'ROTATE').valid,false,s);for(const s of ['0','-1','1001'])assert.equal(parse(s,'SCALE').valid,false,s);assert.equal(parse('361','ROTATE').valid,false);assert.equal(parse('100001','MOVE').valid,false);assert.deepEqual(parse('','MOVE'),{valid:true,value:null});assert.equal(parse('0','ROTATE').value,0);assert.equal(parse('.1','SCALE').value,.1);
});
test('IME, handled events, modifiers, shortcuts and overlong text stay outside numeric input',()=>{
 for(const blocker of ['defaultPrevented','isComposing','ctrlKey','metaKey','altKey'])assert.equal(key({key:'1',[blocker]:true},{action:'ROTATE',text:''}),null);for(const s of ['Escape','Enter','g','r','s','Tab','ArrowLeft'])assert.equal(key({key:s},{action:'ROTATE',text:''}),null);assert.equal(key({key:'1'},{action:'ROTATE',text:'1'.repeat(24)}),null);
});
