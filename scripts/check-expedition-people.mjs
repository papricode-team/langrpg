#!/usr/bin/env node
/** Check every shipped person against its original painted source and shared ground pivot. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { expeditionArt } from './expedition-art-plan.mjs';
import { peopleGrid, personGeometry, registerPeopleSequence } from './expedition-people-registration.mjs';
import { reviewedPeopleSeams } from './expedition-people-seam-reviews.mjs';

const root=resolve(import.meta.dirname,'..'),pages=[['people',4,0],['people-1',6,4],['people-2',6,10]],range=values=>Math.max(...values)-Math.min(...values);
let frames=0,pixels=0,identities=0,maximumBeforeDrift=0,maximumAfterDrift=0,maximumAfterGroundDrift=0,reviewedContacts=0,maximumBodyHeightRange=0;
for(const {id} of expeditionArt)for(const [kind,rows,offset] of pages){
 const key=`${id}-${kind}`,source=await sharp(resolve(root,`art/source/expeditions/${key}.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const grid=peopleGrid({data:source.data,width:source.info.width,height:source.info.height},4,rows,reviewedPeopleSeams[key]);
 const atlas=JSON.parse(await readFile(resolve(root,`web/public/assets/${key}.json`),'utf8'));
 const shipped=await sharp(resolve(root,`web/public/assets/${key}.webp`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.ok(shipped.info.width<=2048&&shipped.info.height<=2048,`${key}: texture budget`);
 let originalVisible=0,extractedVisible=0;
 for(let p=3;p<source.data.length;p+=4)if(source.data[p]>24)originalVisible++;
 for(const cell of grid.cells){
  for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++){
   const p=(y*cell.width+x)*4;if(cell.data[p+3]<=24)continue;
   const original=((y+cell.source.top)*source.info.width+x+cell.source.left)*4;
   assert.ok(cell.data.subarray(p,p+4).equals(source.data.subarray(original,original+4)),`${key}: source RGBA changed during isolation`);extractedVisible++;
  }
 }
 assert.equal(extractedVisible,originalVisible,`${key}: a painted pixel was lost or assigned to two people`);
 reviewedContacts+=grid.seams.filter(seam=>seam.opaquePixels).length;
 for(let row=0;row<rows;row++){
  const input=grid.cells.filter(cell=>cell.row===row),registered=registerPeopleSequence(input),bodyPositions=[],groundPositions=[];
  const before=input.map(cell=>personGeometry(cell).torsoX+cell.source.left-cell.col*Math.floor(source.info.width/4));
  maximumBeforeDrift=Math.max(maximumBeforeDrift,range(before));
  maximumBodyHeightRange=Math.max(maximumBodyHeightRange,range(input.map(cell=>personGeometry(cell).bodyHeight)));
  assert.equal(new Set(registered.map(cell=>`${cell.width},${cell.height}`)).size,1,`${key}: common sequence size`);
  for(const cell of registered){
   const name=`person-${offset+row}-${cell.col}`,entry=atlas.frames[name],f=entry.frame,r=entry.registration;
   assert.ok(entry.pivot&&entry.pivot.x===.5&&entry.pivot.y>0&&entry.pivot.y<=1,`${key}/${name}: registered pivot`);
   const expected=await sharp(cell.data,{raw:{width:cell.width,height:cell.height,channels:4}}).resize(f.w,f.h).raw().toBuffer();
   const actual=Buffer.alloc(f.w*f.h*4);
   for(let y=0;y<f.h;y++)shipped.data.copy(actual,y*f.w*4,((f.y+y)*shipped.info.width+f.x)*4,((f.y+y)*shipped.info.width+f.x+f.w)*4);
   for(let p=3;p<actual.length;p+=4)assert.equal(actual[p],expected[p],`${key}/${name}: source alpha changed in packed atlas`);
   const geometry=personGeometry({data:actual,width:f.w,height:f.h});
   assert.ok(geometry.bodyBounds.left>0&&geometry.bodyBounds.right<f.w-1&&geometry.bodyBounds.top>0&&geometry.bodyBounds.bottom<f.h-1,`${key}/${name}: registered canvas clipped body`);
   bodyPositions.push(geometry.torsoX-entry.pivot.x*f.w);groundPositions.push(geometry.soleY-entry.pivot.y*f.h);
   const {crop}=cell.registration.sourceGeometry,{x:dx,y:dy}=cell.registration.translation;
   for(let y=crop.top;y<=crop.bottom;y++){
    const copied=cell.data.subarray(((y+dy)*cell.width+crop.left+dx)*4,((y+dy)*cell.width+crop.right+dx+1)*4);
    const original=input[cell.col].data.subarray((y*input[cell.col].width+crop.left)*4,(y*input[cell.col].width+crop.right+1)*4);
    assert.ok(copied.equals(original),`${key}/${name}: registration repainted or clipped its source crop`);
   }
   assert.equal(r.sourceGeometry.soleY,cell.registration.sourceGeometry.soleY);
   frames++;pixels+=cell.registration.cropPixelsPreserved;
  }
  const bodyDrift=range(bodyPositions),groundDrift=range(groundPositions);
  assert.ok(bodyDrift<=2,`${key}/person-${offset+row}: torso drift ${bodyDrift}`);
  assert.ok(groundDrift<=1,`${key}/person-${offset+row}: ground drift ${groundDrift}`);
  maximumAfterDrift=Math.max(maximumAfterDrift,bodyDrift);maximumAfterGroundDrift=Math.max(maximumAfterGroundDrift,groundDrift);identities++;
 }
}
console.log(JSON.stringify({sheets:expeditionArt.length*pages.length,identities,frames,sourceCropPixelsPreserved:pixels,maximumSourceTorsoDrift:maximumBeforeDrift,maximumPackedTorsoDrift:maximumAfterDrift,maximumPackedSoleDrift:maximumAfterGroundDrift,maximumAuthoredBodyHeightRange:maximumBodyHeightRange,reviewedNarrowSourceContacts:reviewedContacts},null,2));
