/** Original deterministic train foley; no samples or external recordings. */
import {writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {encodeMonoPcmWav,createRandom} from './world-audio-synthesis.mjs';
const rate=24000,dir='web/public/audio/ui',random=createRandom(716);mkdirSync(dir,{recursive:true});
const sounds={wheels:8,whistle:1.5,door:.65,brakes:2,cup:.3,punch:.18};
for(const [name,duration]of Object.entries(sounds)){
 const samples=new Float32Array(Math.ceil(rate*duration));
 for(let i=0;i<samples.length;i++){
  const t=i/rate,noise=random()*2-1,edge=Math.min(1,t*40,(duration-t)*40);
  samples[i]=name==='wheels'?(.08*noise+.2*Math.sin(t*90*Math.PI*2))*Math.exp(-(t%.4)*22):name==='whistle'?edge*.15*(Math.sin(t*660*Math.PI*2)+.3*Math.sin(t*880*Math.PI*2)):name==='brakes'?edge*.14*(noise*.3+Math.sin(t*(1100-t*100)*Math.PI*2)):name==='punch'?Math.exp(-t*65)*(.3*noise+.13*Math.sin(t*320*Math.PI*2)):name==='door'?Math.exp(-t*9)*(.2*noise+.2*Math.sin(t*100*Math.PI*2)):Math.exp(-t*35)*(.15*Math.sin(t*1800*Math.PI*2)+.08*noise);
 }
 const wav=`${dir}/train-${name}.wav`;writeFileSync(wav,encodeMonoPcmWav(samples,rate));
 const result=spawnSync('ffmpeg',['-v','error','-y','-i',wav,'-c:a','libopus','-b:a','32k',`${dir}/train-${name}.ogg`]);if(result.status)throw Error(result.stderr.toString());unlinkSync(wav);
}
writeFileSync(`${dir}/train-provenance.json`,JSON.stringify({author:'glotworld project',source:'scripts/generate-train-audio.mjs',license:'Original deterministic synthesis, no external samples',sampleRate:rate,seed:716,clips:Object.keys(sounds)},null,2)+'\n');
