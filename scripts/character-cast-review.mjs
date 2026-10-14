/** Compact contact boards; native full-animation proofs remain beside each bake. */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=JSON.parse(await readFile('art/source/character-kit/cast/catalogue.json','utf8'));
const version=JSON.parse(await readFile('art/source/character-kit/cast/component-catalogue.json','utf8')).assetVersion;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const boards=[];
for(let start=0;start<source.entries.length;start+=8){
  const entries=source.entries.slice(start,start+8),parts=[],actors=[];let ready=true;
  for(const [i,entry] of entries.entries()){
    const report=JSON.parse(await readFile(`web/public/assets/character-cast/${entry.id}.json`,'utf8'));
    if(report.assetVersion!==version){ready=false;break;}
    actors.push({id:entry.id,proofSha256:report.proofSha256,atlasSha256:report.atlasSha256});
    for(const [j,frame] of [0,18].entries()){
      const slot=i*2+j,left=slot%4*256,top=Math.floor(slot/4)*406;
      parts.push({input:await sharp(`art/proofs/character-cast/${entry.id}.webp`).extract({left:frame%9*512,top:Math.floor(frame/9)*768,width:512,height:768}).resize(256,384).png().toBuffer(),left,top:top+22});
      parts.push({input:Buffer.from(`<svg width="256" height="22"><text x="8" y="16" font-family="Arial" font-size="11" fill="#203b32">${entry.id} · ${j?'back':'front'}</text></svg>`),left,top});
    }
  }
  if(!ready)continue;
  const path=`art/proofs/character-cast/hd-review-${String(start/8).padStart(2,'0')}.png`;
  await sharp({create:{width:1024,height:Math.ceil(entries.length/2)*406,channels:4,background:'#ece8df'}}).composite(parts).png().toFile(path);
  boards.push({path,sha256:hash(await readFile(path)),actors});
}
await writeFile('art/proofs/character-cast/hd-review.json',JSON.stringify({assetVersion:version,boards},null,2)+'\n');
console.log(`${boards.length} contact boards ready; ${boards.reduce((sum,board)=>sum+board.actors.length,0)} NPCs`);
