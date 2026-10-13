import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {normalizeAvatar,characterCatalogue as cat} from '../web/src/character-recipe.mjs';
import {playerPortraitPixels} from '../web/src/player-portrait-compositor.mjs';
const art=JSON.parse(await readFile('web/src/data/player-portraits.json'));
const cache=new Map();
const load=async url=>{const path='web/public'+url.split('?')[0];if(!cache.has(path)){const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});cache.set(path,{data,width:info.width,height:info.height});}return cache.get(path);};
const base={v:2,skin:'#d8a077',hair:'#48372e',parts:{face:'oval',hair:'waves',outer:'travel'},colors:{'outer.primary':'#326a65'}};
export const portraitReviewCases=[];
for(const part of cat.components){if(art.components[part.id].outsideCrop)continue;let parts={...base.parts};if(['top','outer','neck','bag','body'].includes(part.slot))parts.hair=null;if(part.slot==='top')parts.outer=null;if(part.slot==='body')parts.face='soft';parts[part.slot]=part.optionId;portraitReviewCases.push({id:part.id,recipe:normalizeAvatar({...base,build:part.build,parts}),expression:'neutral'});}
for(const expression of ['smile','worried'])portraitReviewCases.push({id:expression,recipe:normalizeAvatar({...base,build:'regular',parts:{...base.parts,face:'soft'}}),expression});
for(const [i,color]of ['#6b3c29','#f4cfaf','#b37752'].entries())portraitReviewCases.push({id:`skin-palette-${i}`,recipe:normalizeAvatar({...base,build:'regular',skin:color,hair:i?'#cfb06a':'#221812',parts:{face:'round',hair:'curls',top:'blouse',outer:null,markings:'freckles'}}),expression:'neutral'});
const out='art/proofs/player-portraits';await mkdir(out,{recursive:true});const summary=[];
for(let start=0;start<portraitReviewCases.length;start+=12){const composites=[];
 for(const [i,fixture]of portraitReviewCases.slice(start,start+12).entries()){
  const pixels=await playerPortraitPixels(fixture.recipe,fixture.expression,load);
  const png=await sharp(Buffer.from(pixels.data),{raw:{width:256,height:256,channels:4}}).png().toBuffer();
  await writeFile(`${out}/${fixture.id}.png`,png);
  const left=i%4*300,top=Math.floor(i/4)*370;
  composites.push({input:png,left,top});
  for(const [index,size]of [80,56,46,25].entries())composites.push({input:await sharp(png).resize(size,size).png().toBuffer(),left:left+[0,90,156,212][index],top:top+268});
  const label=Buffer.from(`<svg width="300" height="22"><text x="2" y="16" font-size="14" font-family="sans-serif" fill="#203c30">${fixture.id}</text></svg>`);
  composites.push({input:label,left,top:top+348});
  summary.push({id:fixture.id,recipe:fixture.recipe,expression:fixture.expression});
 }
 await sharp({create:{width:1200,height:1110,channels:4,background:'#eee8d9'}}).composite(composites).png().toFile(`${out}/page-${start/12}.png`);
}
await writeFile(`${out}/fixtures.json`,JSON.stringify(summary,null,2)+'\n');console.log(`Reviewed fixtures prepared: ${summary.length}`);
