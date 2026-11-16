import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EFFECT_LIBRARY_BUILTINS,instantiateLibraryDecal,instantiateLibraryEntry,libraryDecalEntry,libraryEntryDependencies} from '../material/web/effect-library.js';
import {createDocument,validateDocument} from '../material/web/project-state.js';
import {validateDocument as validateServerDocument} from '../material/project-state.js';
import {addManualDecal} from '../material/web/manual-decal-rules.js';

const hit={face:7,bary:[.2,.3,.5]};
function emptyDocument(){
 const document=createDocument({source:'a'.repeat(64),name:'贴花拖放',settings:{}});
 Object.assign(document.surface,{effects:[],layers:[],masks:[],areas:[]});
 return document;
}

test('效果库单张贴花可按点拖放，配方外观保留且不启用散布分析',()=>{
 const entries=[
  libraryDecalEntry('builtin-burl-scatter'),
  libraryDecalEntry('builtin-decal-insect-holes'),
  libraryDecalEntry('builtin-local-endgrain-flat'),
  EFFECT_LIBRARY_BUILTINS.find(entry=>entry.recipeId==='O06-2'),
 ];
 for(const entry of entries){
  assert.equal(libraryDecalEntry(entry.id),entry);
  const document=emptyDocument(),original=structuredClone(entry);
  const draft={...document,surface:instantiateLibraryDecal(document,entry).surface};
  const [effect]=draft.surface.effects;
  const ordinary=instantiateLibraryEntry(document,entry).surface.effects[0];
  assert.deepEqual(effect.params,{...ordinary.params,burlCount:0});
  assert.deepEqual(effect.channels,ordinary.channels);
  assert.deepEqual(effect.blend,ordinary.blend);
  assert.deepEqual(effect.manualDecals,[]);
  const pointId=addManualDecal(draft,effect,hit);
  assert.equal(effect.params.burlCount,1);
  assert.equal(effect.manualDecals[0].id,pointId);
  assert.deepEqual(effect.manualDecals[0].anchor,hit);
  assert.deepEqual(libraryEntryDependencies({surfaceRecipe:{surface:draft.surface}}),[]);
  assert.deepEqual(entry,original);
  assert.equal(document.surface.effects.length,0);
  validateDocument(draft);
  validateServerDocument(draft);
 }
 const unrelated=EFFECT_LIBRARY_BUILTINS.filter(entry=>entry.kind==='combo'||entry.primaryType!=='burl');
 assert(unrelated.every(entry=>libraryDecalEntry(entry.id)===null));
 assert.throws(()=>instantiateLibraryDecal(emptyDocument(),{id:'user-preset'}),/不能直接拖到模型/);
});

test('单点拖放可使用最后一个贴花名额，已满时草稿不改变当前工程',()=>{
 const document=emptyDocument(),base=libraryDecalEntry('builtin-burl-scatter');
 const entry=libraryDecalEntry('builtin-decal-branch-scar');
 document.surface=instantiateLibraryEntry(document,base).surface;
 const [existing]=document.surface.effects;
 existing.params.burlCount=7;
 existing.enabled=false;
 const previous=structuredClone(document);
 assert.throws(()=>instantiateLibraryEntry(document,entry),/最多8个/);

 const {surface,id}=instantiateLibraryDecal(document,entry);
 const draft={...document,surface};
 addManualDecal(draft,surface.effects.find(effect=>effect.id===id),hit);
 assert.deepEqual(document,previous);
 assert.deepEqual(surface.effects[0],existing);
 validateDocument(draft);

 const placed=structuredClone(draft);
 const extra=instantiateLibraryDecal(draft,entry);
 assert.throws(()=>addManualDecal({...draft,surface:extra.surface},extra.surface.effects.find(effect=>effect.id===extra.id),hit),/已满/);
 assert.deepEqual(draft,placed);
});
