import sharp from 'sharp';import fs from 'node:fs/promises';
const dir='art/source/character-kit/hd';const reg=JSON.parse(await fs.readFile(`${dir}/references/body-regular/registration.json`));
for(let page=0;page<2;page++){
const pieces=[],crops=[];const indices=page===0?Array.from({length:24},(_,i)=>i):Array.from({length:12},(_,i)=>i+24);
for(const [i,frame] of indices.entries()){const f=reg.frames[frame],t=f.transform;const x=Math.max(0,Math.min(384,Math.round(((f.headBounds.left+f.headBounds.right)/2-t.offset.x)/t.scale)-128)),y=Math.max(0,Math.round((f.crown.y-t.offset.y)/t.scale)-64);const source={left:t.sourceCell.left+x,top:t.sourceCell.top+y,width:256,height:256};pieces.push({input:await sharp(`${dir}/body-regular.png`).extract(source).png().toBuffer(),left:i%4*256,top:Math.floor(i/4)*256});crops.push({frame,source,page:{left:i%4*256,top:Math.floor(i/4)*256,width:256,height:256}});}
const size=[1024,page===0?1536:768];await sharp({create:{width:size[0],height:size[1],channels:4,background:'#ffffff'}}).composite(pieces).png().toFile(`${dir}/references/headwear-cap-page-${page+1}.png`);
await fs.writeFile(`${dir}/references/headwear-cap-crops-${page+1}.json`,JSON.stringify({source:`${dir}/body-regular.png`,size,crops},null,2)+'\n');}
