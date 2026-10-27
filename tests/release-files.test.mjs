import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {copyReleaseInput} from '../scripts/release-files.mjs';

test('a verified candidate under .runtime is copied byte-for-byte while nested caches stay out of the release',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'branchforge-release-'));
 try{
  const input=path.join(root,'.runtime/candidate/runtime'),out=path.join(root,'package');
  fs.mkdirSync(path.join(input,'native'),{recursive:true});fs.mkdirSync(path.join(input,'.runtime'),{recursive:true});
  fs.writeFileSync(path.join(input,'native/viewport.dll'),Buffer.from([0,255,4,2]));fs.writeFileSync(path.join(input,'.runtime/user-draft.json'),'private');
  copyReleaseInput(input,out,'runtime');
  assert.deepEqual(fs.readFileSync(path.join(out,'runtime/native/viewport.dll')),Buffer.from([0,255,4,2]));assert.equal(fs.existsSync(path.join(out,'runtime/.runtime')),false);
  const exe=path.join(root,'.runtime/candidate/editor.exe');fs.writeFileSync(exe,'candidate');copyReleaseInput(exe,out,'editor.exe');assert.equal(fs.readFileSync(path.join(out,'editor.exe'),'utf8'),'candidate');
  assert.throws(()=>copyReleaseInput(exe,out,'../outside.exe'),/Escaping/);assert.equal(fs.existsSync(path.join(root,'outside.exe')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
