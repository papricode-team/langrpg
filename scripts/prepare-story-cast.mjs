import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const source = 'art/source/story-cast/inspector-elise-directions.png';
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== 1536 || info.height !== 1024) throw new Error('Expected a 4 by 2 sheet of 384 by 512 cells');
const frames = [];
for (let row = 0; row < 2; row++) {
  const boxes = [];
  for (let column = 0; column < 4; column++) {
    let left = 384, right = 0, top = 512, bottom = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 384; x++) {
      if (data[((y + row * 512) * info.width + x + column * 384) * 4 + 3] < 24) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (bottom <= top || right <= left) throw new Error(`Missing cell ${row},${column}`);
    boxes.push({ left: left + column * 384, top: top + row * 512, width: right - left + 1, height: bottom - top + 1 });
  }
  const scale = Math.min(320 / Math.max(...boxes.map(b => b.height)), 230 / Math.max(...boxes.map(b => b.width)));
  for (const [column, box] of boxes.entries()) {
    const w = Math.round(box.width * scale), h = Math.round(box.height * scale);
    const sprite = await sharp(source).extract(box).resize(w, h).png().toBuffer();
    frames.push({ input: sprite, left: column * 256 + Math.round((256 - w) / 2), top: row * 384 + 346 - h });
  }
}
await mkdir('web/public/assets/story-cast', { recursive: true });
await sharp('art/source/story-cast/inn-room.png').webp({ quality: 92 }).toFile('web/public/assets/interior-inn-room.webp');
await sharp('art/source/story-cast/greenhouse-train.png').webp({quality:92}).toFile('web/public/assets/story-cast/greenhouse-train.webp');
await sharp({ create: { width: 1024, height: 768, channels: 4, background: '#00000000' } }).composite(frames).webp({ lossless: true }).toFile('web/public/assets/story-cast/directions.webp');
for (const [row, id] of ['inspector', 'elise'].entries()) {
  await sharp(source).extract({ left: 65, top: row * 512 + 6, width: 260, height: 250 }).resize(256, 256, { fit: 'contain', background: '#00000000' }).webp({ quality: 92 }).toFile(`web/public/assets/story-cast/${id}-portrait.webp`);
}
await writeFile('web/public/assets/story-cast/manifest.json', JSON.stringify({ source, tool: 'Built-in image_gen', cell: [256,384], rows: ['inspector','elise'], directions: ['south','east','north','west'], registration: 'One uniform scale per character; soles at y=346; generated alpha preserved.', license: 'Generated for The Lantern Atlas', prompt: 'art/source/story-cast/prompt.txt' }, null, 2) + '\n');

const mainSource='art/source/story-cast/main-cast-directions.png';
const main=await sharp(mainSource).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(main.info.width!==1536||main.info.height!==1024)throw new Error('Expected main cast 7 columns × 4 directions');
const mainFrames=[];
for(let role=0;role<7;role++){
  const boxes=[];
  const left=Math.floor(role*1536/7),right=Math.floor((role+1)*1536/7);
  for(let direction=0;direction<4;direction++){
    let minX=right,minY=(direction+1)*256,maxX=left,maxY=direction*256;
    for(let y=direction*256;y<(direction+1)*256;y++)for(let x=left;x<right;x++){
      if(main.data[(y*1536+x)*4+3]<24)continue;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(maxX<=minX||maxY<=minY)throw new Error(`Missing main cast ${role},${direction}`);
    boxes.push({left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1});
  }
  const scale=Math.min(320/Math.max(...boxes.map(b=>b.height)),230/Math.max(...boxes.map(b=>b.width)));
  for(const [direction,box] of boxes.entries()){
    const width=Math.round(box.width*scale),height=Math.round(box.height*scale);
    mainFrames.push({input:await sharp(mainSource).extract(box).resize(width,height).png().toBuffer(),left:direction*256+Math.round((256-width)/2),top:role*384+346-height});
  }
}
await sharp({create:{width:1024,height:2688,channels:4,background:'#00000000'}}).composite(mainFrames).webp({lossless:true}).toFile('web/public/assets/story-cast/main-directions.webp');
await writeFile('web/public/assets/story-cast/main-manifest.json',JSON.stringify({source:mainSource,tool:'Built-in image_gen',cell:[256,384],rows:['marta','otto','lina','emil','ada','fritz','greta'],directions:['south','east','north','west'],registration:'Uniform scale per character; soles at y=346; generated transparency preserved.',prompt:'art/source/story-cast/main-cast-prompt.txt',license:'Generated for The Lantern Atlas'},null,2)+'\n');
