import test from 'node:test';
import assert from 'node:assert/strict';
import { peopleGrid, personGeometry, registerPeopleSequence } from './expedition-people-registration.mjs';

function figure(width,height,x,y){
 const data=Buffer.alloc(width*height*4);
 for(let dy=0;dy<32;dy++)for(let dx=0;dx<14;dx++)data.set([40+dx,60+dy,90,253],((y+dy)*width+x+dx)*4);
 return {data,width,height};
}

test('whole figures keep exact RGBA while torso and soles share one centered pivot',()=>{
 const input=[figure(100,80,12,7),figure(100,80,59,18),figure(100,80,32,11),figure(100,80,73,4)];
 const result=registerPeopleSequence(input);
 assert.equal(new Set(result.map(frame=>`${frame.width},${frame.height}`)).size,1);
 assert.equal(new Set(result.map(frame=>personGeometry(frame).torsoX)).size,1);
 assert.equal(new Set(result.map(frame=>personGeometry(frame).soleY)).size,1);
 for(let frame=0;frame<4;frame++){
  const {translation:{x:dx,y:dy},sourceGeometry:{crop}}=result[frame].registration;
  for(let y=crop.top;y<=crop.bottom;y++)for(let x=crop.left;x<=crop.right;x++)assert.deepEqual(result[frame].data.subarray(((y+dy)*result[frame].width+x+dx)*4,((y+dy)*result[frame].width+x+dx)*4+4),input[frame].data.subarray((y*100+x)*4,(y*100+x)*4+4));
 }
});

test('grid dividers adapt to uneven columns and each column’s row gap',()=>{
 const width=240,height=160,data=Buffer.alloc(width*height*4),expected=[];
 for(let col=0;col<4;col++)for(let row=0;row<2;row++){
  const x=39+col*49,y=row?88+col*3:5+col*2,image=figure(width,height,x,y);
  expected.push({col,row,x,y});
  for(let p=0;p<data.length;p+=4)if(image.data[p+3])image.data.copy(data,p,p,p+4);
 }
 const grid=peopleGrid({data,width,height},4,2);
 assert.ok(grid.seams.every(seam=>seam.opaquePixels===0));
 for(const cell of grid.cells){
  const geometry=personGeometry(cell),source=expected.find(item=>item.col===cell.col&&item.row===cell.row);
  assert.equal(geometry.bodyBounds.top+cell.source.top,source.y);
  assert.equal(geometry.bodyBounds.bottom+cell.source.top,source.y+31);
  assert.equal(geometry.silhouettePixels,14*32);
 }
});

test('detached opaque flecks do not shift body landmarks',()=>{
 const image=figure(100,80,42,12),before=personGeometry(image);
 image.data.set([255,0,0,255],(2*100+3)*4);
 const after=personGeometry(image);
 assert.equal(after.torsoX,before.torsoX);
 assert.equal(after.soleY,before.soleY);
 assert.equal(after.bodyHeight,before.bodyHeight);
 assert.equal(after.crop.left,1);
});

test('an irregular transparent separator preserves boots and hair whose boxes overlap',()=>{
 const width=80,height=160,data=Buffer.alloc(width*height*4),paint=(left,top,w,h,color)=>{
  for(let y=top;y<top+h;y++)for(let x=left;x<left+w;x++)data.set([...color,253],(y*width+x)*4);
 };
 paint(35,10,12,60,[20,30,40]);paint(40,68,15,18,[20,30,40]);
 paint(15,80,14,20,[80,90,100]);paint(22,98,14,50,[80,90,100]);
 const grid=peopleGrid({data,width,height},1,2);
 assert.equal(grid.seams[0].opaquePixels,0);
 assert.ok(grid.seams[0].maximum>grid.seams[0].minimum);
 const totals=[0,0];
 for(const cell of grid.cells)for(let p=0;p<cell.data.length;p+=4)if(cell.data[p+3]){
  assert.equal(cell.data[p],cell.row?80:20,'A neighboring person must never leak into this frame.');totals[cell.row]++;
 }
 assert.deepEqual(totals,[12*60+15*18-7*2,14*20+14*50-7*2]);
 let totalSource=0;for(let p=3;p<data.length;p+=4)if(data[p])totalSource++;
 assert.equal(totals[0]+totals[1],totalSource,'Every source pixel is copied exactly once.');
});

test('an unexpected opaque row or column separator rejects the source',()=>{
 const row=figure(50,160,15,0);
 for(let y=0;y<160;y++)for(let x=15;x<29;x++)row.data.set([90,100,110,253],(y*50+x)*4);
 assert.throws(()=>peopleGrid(row,1,2),/Unreviewed painted row contact/);
 const column=figure(160,50,0,15);
 for(let y=15;y<29;y++)for(let x=0;x<160;x++)column.data.set([90,100,110,253],(y*160+x)*4);
 assert.throws(()=>peopleGrid(column,2,1),/Painted column contact/);
});
