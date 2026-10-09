import test from 'node:test';
import assert from 'node:assert/strict';
import { packBoardCells } from './pack-player-walk-board.mjs';

test('packing copies selected complete cells exactly, including transparent RGB',()=>{
  const make=offset=>{
    const image={info:{width:1536,height:1024},data:Buffer.alloc(1536*1024*4)};
    for(let cell=0;cell<8;cell++)for(let y=0;y<512;y++)for(let x=0;x<384;x++)image.data.set([cell+offset,x%256,y%256,cell?253:0],((Math.floor(cell/4)*512+y)*1536+cell%4*384+x)*4);
    return image;
  };
  const a=make(0),b=make(50),selections=[{image:a,cell:0},{image:b,cell:1},{image:b,cell:2},{image:a,cell:3},...Array.from({length:4},(_,index)=>({image:b,cell:index+4}))],out=packBoardCells(selections);
  for(const [destination,{image,cell}]of selections.entries())for(let y=0;y<512;y++){
    const source=((Math.floor(cell/4)*512+y)*1536+cell%4*384)*4,target=((Math.floor(destination/4)*512+y)*1536+destination%4*384)*4;
    assert.deepEqual(out.subarray(target,target+384*4),image.data.subarray(source,source+384*4));
  }
});

test('packing rejects wrong grid dimensions and missing or invalid cell selections',()=>{
  assert.throws(()=>packBoardCells([]),/exactly eight/);
  assert.throws(()=>packBoardCells(Array.from({length:8},()=>({image:{info:{width:1536,height:1000}},cell:0}))),/cannot be resized/);
  assert.throws(()=>packBoardCells(Array.from({length:8},()=>({image:{info:{width:1536,height:1024}},cell:8}))),/integer from 0 to 7/);
});
