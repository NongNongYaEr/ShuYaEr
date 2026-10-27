import test from 'node:test';
import assert from 'node:assert/strict';
import {plantUnitThumbnailCells,representativePlantUnits} from '../web/plant-unit-thumbnails.js';

test('pack previews include every unit rather than selecting a few roles',()=>{
  const units=Array.from({length:10},(_,i)=>({id:'UNIT_'+i,role:i<6?'LEAF':i<8?'FLOWER':'FRUIT'}));
  assert.deepEqual(representativePlantUnits({units}),units);
  assert.deepEqual(representativePlantUnits({units:[]}),[]);
});
test('all cells have equal area and remain within the thumbnail without overlap',()=>{
  for(const count of [1,2,3,5,6,9,10,16,64]){
    const cells=plantUnitThumbnailCells(count);assert.equal(cells.length,count);
    for(const [i,[x,y,width,height]] of cells.entries()){
      assert.equal(width,cells[0][2]);assert.equal(height,cells[0][3]);assert(x>=0&&y>=0&&x+width<=512.00001&&y+height<=384.00001);
      for(const [a,b,w,h] of cells.slice(0,i))assert(x+width<=a+.00001||a+w<=x+.00001||y+height<=b+.00001||b+h<=y+.00001);
    }
  }
  assert.equal(plantUnitThumbnailCells(9)[0][2],512/3);
  assert.equal(plantUnitThumbnailCells(9)[0][3],128);
});
