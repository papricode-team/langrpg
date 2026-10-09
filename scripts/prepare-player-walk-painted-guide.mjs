#!/usr/bin/env node
/** Detailed painted pose guide for ImageGen. Never consumed by runtime. */
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {boardFrame,extractLegs} from './prepare-player-walk-legs.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'art/source/player-edits');
const manifest=JSON.parse(await readFile(resolve(root,'web/public/assets/player-layers/manifest.json'),'utf8'));
for(const [name,references]of [['front',new Map([[6,2]])],['back',new Map([[1,5],[2,6]])]]){
 const row=['front','right','back','left'].indexOf(name);
 const image=await sharp(resolve(dir,`walk-${name}-candidate-2.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const lower=[];
 for(let pose=0;pose<8;pose++){
  const reference=references.get(pose)??pose,f=manifest.frames[row*9+reference+1];
  const pieces=extractLegs(f,boardFrame(image,reference));
  let combined=await sharp(pieces.cloth,{raw:{width:128,height:192,channels:4}}).composite([{input:await sharp(pieces.boots,{raw:{width:128,height:192,channels:4}}).png().toBuffer()}]).png().toBuffer();
  if(references.has(pose))combined=await sharp(combined).flop().png().toBuffer();
  lower.push({input:await sharp(combined).resize(320,480).png().toBuffer(),left:pose%4*384+32,top:Math.floor(pose/4)*512+16});
 }
 await sharp(resolve(dir,`walk-${name}-edit-target.png`)).composite(lower).png().toFile(resolve(dir,`walk-${name}-painted-pose-guide.png`));
}
