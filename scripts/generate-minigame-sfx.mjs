#!/usr/bin/env node
/** Original deterministic mini-game foley; no third-party clips or samples. */
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRandom, encodeMonoPcmWav, worldAudioRate } from './world-audio-synthesis.mjs';
import { projectRoot } from './item-art-plan.mjs';

export const minigameSfxNames=['stamp','flap','coin','bell','chime','smudge','lantern-light','parcel-drop','catch','miss','chain-break','page'];
export function synthesizeMiniGameSfx(name, rate=worldAudioRate){
  const index=minigameSfxNames.indexOf(name);if(index<0)throw Error(`Unknown mini-game sound: ${name}`);
  const duration=[.22,.16,.55,1.1,.8,.35,.85,.3,.35,.45,.6,.45][index],random=createRandom(7100+index);
  const samples=new Float32Array(Math.round(rate*duration));
  let filtered=0;
  for(let i=0;i<samples.length;i++){
    const t=i/rate,noise=random()*2-1;filtered=filtered*.84+noise*.16;
    const tone=(hz,decay=8)=>Math.sin(t*hz*Math.PI*2)*Math.exp(-t*decay)*Math.min(t*180,1);
    let value=0;
    switch(name){
      case 'stamp':value=.4*tone(92,25)+noise*.24*Math.exp(-t*48)+filtered*.2*Math.exp(-Math.abs(t-.06)*90);break;
      case 'flap':value=filtered*.65*(Math.exp(-t*65)+Math.exp(-Math.abs(t-.065)*90))+.18*tone(205,30);break;
      case 'coin':value=.3*tone(1500,12)+.22*tone(2330,15)+.15*tone(3300,19)+noise*.12*Math.exp(-t*100);break;
      case 'bell':value=.34*tone(880,3)+.16*tone(1763,4)+.08*tone(2371,6);break;
      case 'chime':value=.3*tone(660,6)+.23*tone(990,5)+.1*tone(1320,4);break;
      case 'smudge':value=filtered*.5*Math.sin(Math.PI*t/duration)**2+noise*.12*Math.exp(-t*6);break;
      case 'lantern-light':value=.2*tone(523.25,5)+.2*tone(783.99,4)+.08*tone(1046.5,3)+filtered*.15*Math.exp(-t*14);break;
      case 'parcel-drop':value=.65*tone(72,24)+filtered*.3*Math.exp(-t*27);break;
      case 'catch':value=.3*tone(440+t*800,12)+.13*tone(880,12);break;
      case 'miss':value=.22*tone(240-t*150,7)+.12*tone(120,8);break;
      case 'chain-break':value=.3*tone(620-t*650,6)+noise*.2*Math.exp(-t*14)+.12*tone(1100,17);break;
      case 'page':value=filtered*.5*Math.sin(Math.PI*t/duration)**2+noise*.04;break;
    }
    samples[i]=value*Math.min(1,(duration-t)*100);
  }
  return samples;
}
export async function exportMiniGameSfx(root=projectRoot){
  const output=resolve(root,'web/public/audio/ui');await mkdir(output,{recursive:true});
  for(const name of minigameSfxNames){
    const wav=resolve(output,`${name}.wav`);await writeFile(wav,encodeMonoPcmWav(synthesizeMiniGameSfx(name)));
    const result=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-y','-i',wav,'-c:a','libopus','-b:a','64k',resolve(output,`${name}.ogg`)]);
    if(result.status!==0)throw Error(result.stderr.toString());await unlink(wav);
  }
  await writeFile(resolve(output,'provenance.json'),`${JSON.stringify({author:'The Lantern Atlas project',source:'scripts/generate-minigame-sfx.mjs',license:'Original synthesized audio; no external samples',sampleRate:worldAudioRate,seeds:minigameSfxNames.map((_,i)=>7100+i),encoding:'Ogg Opus 64 kbps',clips:minigameSfxNames},null,2)}\n`);
  console.log(`Exported ${minigameSfxNames.length} distinct mini-game foley clips.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await exportMiniGameSfx();
