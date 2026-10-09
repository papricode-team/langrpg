#!/usr/bin/env node
/** Larger eight-frame editing board for one direction, never runtime art. */
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {canonical} from './prepare-player-head-edits.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'art/source/player-edits');
const direction=Number(process.argv[2]??1),name=['front','right','back','left'][direction];
if(!name)throw Error('Direction must be0..3.');
const manifest=JSON.parse(await readFile(resolve(root,'web/public/assets/player-layers/manifest.json'),'utf8'));
const image=await sharp(resolve(dir,'walk-legs-edit-target.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const target=[],guides=[],S=2.5,CW=384,CH=512;
const poses=[[[9,18,0],[-9,-16,-2]],[[4,11,0],[-4,-11,-8]],[[-1,1,0],[7,-1,-13]],[[-6,-7,-1],[11,9,-5]],[[-9,-16,-2],[9,18,0]],[[-4,-11,-8],[4,11,0]],[[7,-1,-13],[-1,1,0]],[[11,9,-5],[-6,-7,-1]]];
const names=['Near CONTACT','Near DOWN','Far PASSING','Far ADVANCING','Far CONTACT','Far DOWN','Near PASSING','Near ADVANCING'];
for(let phase=0;phase<8;phase++){
 const f=manifest.frames[direction*9+phase+1],pixels=canonical(image,f),left=phase%4*CW+32,top=Math.floor(phase/4)*CH+16;
 target.push({input:await sharp(pixels,{raw:{width:128,height:192,channels:4}}).resize(320,480).png().toBuffer(),left,top});
 const point=(x,y)=>[left+x*S,top+y*S],hip=f.waist.y+9,knee=(hip+f.ground.y-12)/2,forward=direction===3?-1:1,side=direction%2;
 const paths=poses[phase].map(([kx,ax,lift],leg)=>{
  const lane=(leg?5:-5)*(direction===2?-1:1);
  const p=[point(64+(side?0:lane),hip),point(64+(side?kx*forward:lane),knee+(side?0:lift*.2)),point(64+(side?ax*forward:lane),f.ground.y-12+(side?lift:lift+Math.min(0,ax)*.2))];
  const [fx,fy]=p[2],color=leg?'#29b8e8':'#e85454';
  const near=direction===3?leg===1:leg===0;
  const line=`<polyline points="${p.map(v=>v.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${(near?9:8)*S}" stroke-linejoin="round"/>`;
  const boot=side?`<path d="M${fx-4*S},${fy-2*S} L${fx+4*S},${fy-2*S} L${fx+forward*5*S},${fy+7*S} L${fx+forward*13*S},${fy+9*S} L${fx+forward*13*S},${fy+12*S} L${fx-4*forward*S},${fy+12*S} Z" fill="${color}"/>`:`<rect x="${fx-5*S}" y="${fy-2*S}" width="${10*S}" height="${14*S}" rx="${2*S}" fill="${color}"/>`;
  return line+boot;
 });
 const labels=direction===1?names:['RIGHT contact','RIGHT down','LEFT passing','LEFT advancing','LEFT contact','LEFT down','RIGHT passing','RIGHT advancing'];
 guides.push(...(direction===3?[paths[0],paths[1]]:[paths[1],paths[0]]),`<text x="${phase%4*CW+CW/2}" y="${Math.floor(phase/4)*CH+CH-4}" text-anchor="middle" font-family="Arial" font-size="18" fill="white">${phase+1}: ${labels[phase]}</text>`);
}
const canvas=sharp({create:{width:1536,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}});
const raw=await canvas.composite(target).png().toBuffer();
await sharp(raw).png().toFile(resolve(dir,`walk-${name}-edit-target.png`));
await sharp(raw).composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">${guides.join('')}</svg>`)}]).png().toFile(resolve(dir,`walk-${name}-pose-guide.png`));
console.log(`Saved larger ${name} edit board and silhouette guide.`);
