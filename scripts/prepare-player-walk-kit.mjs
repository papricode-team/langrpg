#!/usr/bin/env node
/** Editing inputs only: remove old walk legs, keep the original upper bodies. */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'art/source/player-edits');
const master=await sharp(resolve(root,'art/source/player-customizations/motion.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const manifest=JSON.parse(await readFile(resolve(root,'web/public/assets/player-layers/manifest.json'),'utf8'));
const empty=Buffer.from(master.data),guides=[];
// Transparent backing RGB must not look like the old legs to an edit model.
for(let p=0;p<empty.length;p+=4)if(empty[p+3]<16)empty.fill(0,p,p+4);
const poses=[
 [[10,22,0],[-10,-18,-3]],[[5,13,0],[-5,-15,-8]],
 [[-1,3,0],[8,-2,-13]],[[-8,-8,0],[13,11,-6]],
 [[-10,-18,-3],[10,22,0]],[[-5,-15,-8],[5,13,0]],
 [[8,-2,-13],[-1,3,0]],[[13,11,-6],[-8,-8,0]],
];
const names=['L contact','L down','R passing','R advancing','R contact','R down','L passing','L advancing'];
for(const f of manifest.frames){
 if(!f.column)continue;
 const {sourceCell:c,scale,offset}=f.transform;
 const native=(x,y)=>[c.left+(x-offset.x)/scale,c.top+(y-offset.y)/scale];
 const top=Math.max(c.top,Math.floor(native(0,f.waist.y-4)[1]));
 for(let y=top;y<c.top+c.height;y++)for(let x=c.left;x<c.left+c.width;x++){
  const p=(y*master.info.width+x)*4,[r,g,b,a]=master.data.subarray(p,p+4);
  if(!a)continue;
  const maximum=Math.max(r,g,b),minimum=Math.min(r,g,b),chroma=maximum-minimum;
  const coat=g>r*1.05&&b>r*.95&&chroma>4;
  const skin=maximum>95&&r>g*1.10&&r>b*1.25&&y<native(0,f.waist.y+35)[1];
  const shirt=maximum>135&&g>r*.79&&b>r*.52&&y<native(0,f.waist.y+4)[1];
  if(!coat&&!skin&&!shirt)empty.fill(0,p,p+4);
 }
 const hip=f.waist.y+12,knee=(hip+f.ground.y)/2,side=f.direction%2,forward=f.direction===3?-1:1;
 const lines=poses[f.column-1].map(([kx,ax,ay],leg)=>{
  const lateral=leg?5:-5;
  const hx=64+(side?0:lateral),hy=hip;
  const nx=64+(side?kx*forward:lateral),ny=knee+(side?0:ay*.25);
  const fx=64+(side?ax*forward:lateral),fy=f.ground.y+(side?ay:(ax<0?-8:ay));
  const points=[native(hx,hy),native(nx,ny),native(fx,fy)].map(p=>p.join(',')).join(' ');
  return `<polyline points="${points}" fill="none" stroke="${leg?'#18bcea':'#fa6154'}" stroke-width="5" stroke-linecap="round"/>`;
 });
 const label=native(64,f.ground.y+8);
 guides.push(...lines,`<text x="${label[0]}" y="${Math.min(c.top+c.height-2,label[1])}" fill="#ffffff" text-anchor="middle" font-size="10" font-family="Arial">${names[f.column-1]}</text>`);
}
const raw={raw:{width:master.info.width,height:master.info.height,channels:4}};
await sharp(empty,raw).png().toFile(resolve(dir,'walk-legs-edit-target.png'));
const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${master.info.width}" height="${master.info.height}">${guides.join('')}</svg>`);
await sharp(empty,raw).composite([{input:overlay}]).png().toFile(resolve(dir,'walk-legs-pose-guide.png'));
console.log('Saved upper-body edit target and leg pose guide. Guides are never runtime art.');
