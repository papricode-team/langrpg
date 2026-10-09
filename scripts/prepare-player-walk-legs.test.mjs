import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_LAYOUT, boardFrame, extractLegs, protectWaist, translateWholeFrame, validateBoard } from './prepare-player-walk-legs.mjs';

const frame={waist:{x:64,y:90},ground:{x:64,y:172.8},headBounds:{left:54,right:74}};
const paint=(data,x,y,rgba)=>data.set(rgba,(y*128+x)*4);
const rectangle=(data,left,top,right,bottom,rgba)=>{for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)paint(data,x,y,rgba);};
const pixel=(data,x,y)=>Array.from(data.subarray((y*128+x)*4,(y*128+x)*4+4));

test('boards reject mismatched dimensions and noncanonical grids instead of stretching',()=>{
  assert.throws(()=>validateBoard({info:{width:1536,height:1000}}),/cannot be resized/);
  const image={info:{width:1536,height:1024}};
  assert.throws(()=>validateBoard(image,{...BOARD_LAYOUT,columns:8,rows:1}),/eight 4×2 cells/);
  assert.throws(()=>validateBoard(image,{...BOARD_LAYOUT,inner:{...BOARD_LAYOUT.inner,left:31}}),/shared 320×480/);
  assert.throws(()=>boardFrame(image,8),/eight cells/);
  assert.throws(()=>boardFrame(image,-1),/eight cells/);
  assert.throws(()=>boardFrame(image,1.5),/eight cells/);
});

test('all eight board cells use the same complete-frame crop and cannot sample neighboring labels',()=>{
  const image={info:{width:1536,height:1024},data:Buffer.alloc(1536*1024*4)};
  for(let pose=0;pose<8;pose++){
    const left=pose%4*384,top=Math.floor(pose/4)*512;
    for(let y=0;y<512;y++)for(let x=0;x<384;x++)image.data.set([250,20,20,255],((top+y)*1536+left+x)*4);
    for(let y=16;y<496;y++)for(let x=32;x<352;x++)image.data.set([pose*20,40,90,200],((top+y)*1536+left+x)*4);
  }
  for(let pose=0;pose<8;pose++){
    const sampled=boardFrame(image,pose);
    for(const [x,y]of [[0,0],[64,96],[127,191]])assert.deepEqual(pixel(sampled,x,y),[pose*20,40,90,200]);
  }
});

test('trouser extraction retains attached muted cuff shading and original alpha while rejecting boot noise and upper colors',()=>{
  const source=Buffer.alloc(128*192*4);
  rectangle(source,56,89,70,142,[104,79,92,250]);
  rectangle(source,61,89,68,94,[39,25,20,251]);
  rectangle(source,56,140,70,147,[70,69,70,245]);
  rectangle(source,55,147,73,173,[76,58,44,249]);
  rectangle(source,90,160,95,166,[76,58,44,249]);
  rectangle(source,20,110,30,150,[40,85,70,255]);
  rectangle(source,76,105,84,123,[199,145,106,252]);
  rectangle(source,40,102,45,110,[215,200,170,255]);
  const result=extractLegs(frame,source);
  assert.deepEqual(pixel(result.cloth,60,144),[70,69,70,245]);
  assert.deepEqual(pixel(result.cloth,60,100),[104,79,92,250]);
  assert.deepEqual(pixel(result.cloth,64,91),[39,25,20,251]);
  assert.deepEqual(pixel(result.boots,60,169),[76,58,44,249]);
  assert.equal(pixel(result.boots,92,162)[3],0);
  for(const [x,y]of [[25,120],[80,110],[42,105]])assert.equal(pixel(result.cloth,x,y)[3]+pixel(result.boots,x,y)[3],0);
  assert.equal(result.report.connectedWaist,true);
  assert.equal(result.report.groundWarning,false);
  assert.deepEqual(result.report.silhouette,{left:55,right:72,top:89,bottom:172});
});

test('an empty board cell fails material validation instead of borrowing pixels from another pose',()=>{
  const result=extractLegs(frame,Buffer.alloc(128*192*4));
  assert.equal(result.report.clothPixels,0);
  assert.equal(result.report.bootPixels,0);
  assert.equal(result.report.connectedWaist,false);
  assert.equal(result.report.silhouette,null);
});

test('a boot occluding the other leg retains its disconnected trouser cuff and planted boot',()=>{
  const source=Buffer.alloc(128*192*4);
  rectangle(source,58,89,69,147,[105,79,95,250]);
  rectangle(source,57,147,71,158,[75,56,43,249]);
  rectangle(source,59,158,69,163,[105,79,95,250]);
  rectangle(source,56,163,75,173,[75,56,43,249]);
  // An opaque speck one empty pixel away is not an antialias edge.
  paint(source,76,168,[75,56,43,249]);
  const result=extractLegs(frame,source);
  assert.deepEqual(pixel(result.cloth,63,160),[105,79,95,250]);
  assert.deepEqual(pixel(result.boots,63,170),[75,56,43,249]);
  assert.equal(pixel(result.boots,76,168)[3],0);
  assert.equal(result.report.groundY,172);
  assert.equal(result.report.connectedWaist,true);
});

test('raised passing boots and warm dark knee shadows stay complete at their painted coordinates',()=>{
  const source=Buffer.alloc(128*192*4);
  rectangle(source,52,89,61,149,[108,84,101,252]);
  rectangle(source,65,89,75,126,[108,84,101,252]);
  rectangle(source,66,113,74,123,[50,35,40,251]);
  rectangle(source,66,118,71,121,[40,32,32,247]);
  rectangle(source,64,126,77,143,[86,53,32,250]);
  rectangle(source,66,132,75,139,[22,9,3,249]);
  rectangle(source,51,149,64,173,[86,53,32,250]);
  const result=extractLegs(frame,source);
  assert.deepEqual(pixel(result.cloth,68,116),[50,35,40,251]);
  assert.deepEqual(pixel(result.cloth,68,119),[40,32,32,247]);
  assert.deepEqual(pixel(result.boots,70,127),[86,53,32,250]);
  assert.deepEqual(pixel(result.boots,70,135),[22,9,3,249]);
  assert.equal(result.report.groundY,172);
});

test('protected waist keeps opaque original pixels, composites edges, and leaves generated lower legs unchanged',()=>{
  const generatedCloth=Buffer.alloc(128*192*4),generatedBoots=Buffer.alloc(generatedCloth.length),originalCloth=Buffer.alloc(generatedCloth.length),originalBoots=Buffer.alloc(generatedCloth.length);
  rectangle(generatedCloth,50,80,80,160,[245,245,245,250]);
  rectangle(generatedBoots,49,150,84,173,[72,43,29,248]);
  rectangle(originalCloth,52,82,77,160,[140,140,140,255]);
  rectangle(originalBoots,61,87,68,94,[27,25,23,255]);
  paint(originalCloth,77,90,[140,140,140,128]);
  paint(originalCloth,40,89,[31,46,50,0]);
  const result=protectWaist({...frame,waist:{x:64,y:90.3}},generatedCloth,generatedBoots,originalCloth,originalBoots),{top,bottom,transitionRows}=result.metadata;
  for(let y=top;y<=bottom;y++)for(let x=0;x<128;x++)for(const [original,generated,protectedLayer]of [[originalCloth,generatedCloth,result.cloth],[originalBoots,generatedBoots,result.boots]]){
    const p=(y*128+x)*4;
    if(original[p+3]===255)assert.deepEqual(protectedLayer.subarray(p,p+4),original.subarray(p,p+4));
    else if(!original[p+3])assert.deepEqual(protectedLayer.subarray(p,p+4),generated.subarray(p,p+4));
  }
  assert.ok(pixel(result.cloth,77,90)[3]>=pixel(generatedCloth,77,90)[3]);
  assert.ok(pixel(result.cloth,77,90)[0]>140&&pixel(result.cloth,77,90)[0]<245);
  assert.deepEqual(result.cloth.subarray((bottom+transitionRows)*128*4),generatedCloth.subarray((bottom+transitionRows)*128*4));
  assert.deepEqual(result.boots.subarray((bottom+transitionRows)*128*4),generatedBoots.subarray((bottom+transitionRows)*128*4));
  assert.deepEqual(pixel(generatedCloth,64,90),[245,245,245,250]);
  assert.equal(transitionRows,4);
  assert.equal(result.metadata.originalOpaqueRGBAExact,true);
  assert.equal(result.metadata.antialiasedEdgesSourceOver,true);
  assert.equal(result.metadata.candidateOutsideOriginalCoveragePreserved,true);
});

test('a narrower original thigh cannot cut square alpha notches into a wider generated swing',()=>{
  const generated=Buffer.alloc(128*192*4),original=Buffer.alloc(generated.length),empty=Buffer.alloc(generated.length);
  rectangle(generated,45,80,83,130,[190,190,190,250]);
  rectangle(original,57,80,69,130,[130,130,130,255]);
  const result=protectWaist(frame,generated,empty,original,empty);
  for(let y=result.metadata.top;y<=result.metadata.bottom+result.metadata.transitionRows+1;y++)for(const x of [46,52,75,82])assert.deepEqual(pixel(result.cloth,x,y),pixel(generated,x,y));
  for(let y=result.metadata.top;y<=result.metadata.bottom+result.metadata.transitionRows;y++)for(let x=45;x<83;x++)assert.ok(pixel(result.cloth,x,y)[3]>=250,'overlay never fades existing swing coverage');
});

test('ground registration translates the complete painted frame with exact colors and alpha',()=>{
  const source=Buffer.alloc(128*192*4);
  paint(source,64,30,[201,148,106,253]);
  paint(source,58,81,[41,80,75,249]);
  paint(source,53,137,[85,64,84,251]);
  paint(source,67,169,[67,40,24,248]);
  const registered=translateWholeFrame(source,4);
  for(const [x,y]of [[64,30],[58,81],[53,137],[67,169]])assert.deepEqual(pixel(registered,x,y+4),pixel(source,x,y));
  assert.deepEqual(pixel(registered,67,173),[67,40,24,248]);
  assert.equal(pixel(registered,64,30)[3],0);
  assert.throws(()=>translateWholeFrame(source,.5),/integer vertical offset/);
  paint(source,64,0,[120,120,120,255]);
  assert.throws(()=>translateWholeFrame(source,-1),/clip the painted silhouette/);
});
