/** Register native painted poses by their feet, preserving one isotropic scale per identity. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { removeTransparentChromaNoise } from './prepare-resident-action-art.mjs';
const source = 'art/source/animals', out = 'web/public/assets/animals';
const species = ['chicken', 'dog', 'cat', 'sheep'];
const names = ['walk-0','walk-1','walk-2','walk-3','walk-back-0','walk-back-1','walk-back-2','walk-back-3',
  'idle-0','idle-1','rest-0','rest-1','forage-0','forage-1','forage-2','forage-3',
  'happy-0','happy-1','happy-2','happy-3','annoyed-0','annoyed-1','annoyed-2','annoyed-3'];

/** Transparent gutters are not exactly uniform in native generated sheets. Find whole silhouettes first. */
async function readSheet(path) {
  const input = await readFile(path), { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cleaned = removeTransparentChromaNoise(data), seen = new Uint8Array(info.width * info.height), components = [];
  for (let pixel = 0; pixel < seen.length; pixel++) {
    if (seen[pixel] || cleaned.data[pixel * 4 + 3] < 32) continue;
    const queue = [pixel]; seen[pixel] = 1;
    let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const p = queue[cursor], x = p % info.width, y = Math.floor(p / info.width);
      x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y);
      for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx=x+dx,ny=y+dy,np=ny*info.width+nx;
        if(nx<0||ny<0||nx>=info.width||ny>=info.height||seen[np]||cleaned.data[np*4+3]<32)continue;
        seen[np]=1;queue.push(np);
      }
    }
    if (queue.length > 400) components.push({ x0,y0,x1,y1,pixels:queue.length });
  }
  const cells = Array(72);
  for (const box of components) {
    const col = Math.floor((box.x0+box.x1)/2 / info.width * 8), row = Math.floor((box.y0+box.y1)/2 / info.height * 9), index=row*8+col;
    if (cells[index]) throw Error(`${path}: merged or duplicate silhouette at cell ${index}`);
    cells[index]=box;
  }
  if (cells.filter(Boolean).length !== 72) throw Error(`${path}: expected 72 complete silhouettes, found ${components.length}; missing ${Array.from({length:72},(_,i)=>i).filter(i=>!cells[i])}`);
  return { input, data:cleaned.data, info, cells, matte:cleaned.report, hash:createHash('sha256').update(input).digest('hex') };
}

await mkdir(out,{recursive:true});
for (const animal of species) {
  const sheet=await readSheet(`${source}/${animal}.png`);
  const repair=animal==='cat'?await readSheet(`${source}/cat-repair.png`):undefined;
  const atlas={frames:{},meta:{image:`${animal}.webp`,size:{w:1024,h:1152},scale:'1'}}, composites=[], records=[];
  for(let variant=0;variant<3;variant++) {
    const reference=sheet.cells[variant*24],scale=Math.min(1,76/(reference.y1-reference.y0+1));
    for(let pose=0;pose<24;pose++) {
      const index=variant*24+pose, selected=repair&&variant===1&&pose>=20?repair:sheet, b=selected.cells[index];
      // The repair sheet is used only for the four calico reactions; original approved cells are untouched.
      if(b.x0<1||b.y0<1||b.x1>=selected.info.width-1||b.y1>=selected.info.height-1)throw Error(`${animal}/${index}: native silhouette touches canvas edge`);
      const pad=2,left=Math.max(0,b.x0-pad),top=Math.max(0,b.y0-pad),width=Math.min(selected.info.width-left,b.x1-b.x0+1+pad*2),height=Math.min(selected.info.height-top,b.y1-b.y0+1+pad*2);
      let footLeft=selected.info.width,footRight=0;
      for(let y=b.y1-5;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++)if(selected.data[(y*selected.info.width+x)*4+3]>=96){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);}
      const footX=(footLeft+footRight)/2, w=Math.round(width*scale),h=Math.round(height*scale),x=Math.round(64-(footX-left)*scale),y=Math.round(110-(b.y1-top)*scale);
      if(x<2||y<2||x+w>126||y+h>126)throw Error(`${animal}/${index}: registered pose overflows 128px cell (${x},${y},${w},${h})`);
      const buffer=await sharp(selected.data,{raw:selected.info}).extract({left,top,width,height}).resize(w,h).png().toBuffer();
      composites.push({input:buffer,left:index%8*128+x,top:Math.floor(index/8)*128+y});
      atlas.frames[`${variant}-${names[pose]}`]={frame:{x:index%8*128,y:Math.floor(index/8)*128,w:128,h:128},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:128,h:128},sourceSize:{w:128,h:128}};
      records.push({variant,pose:names[pose],source: selected===repair?'cat-repair.png':`${animal}.png`,bounds:b,footX,scale,registration:{x,y,w,h}});
    }
  }
  await sharp({create:{width:1024,height:1152,channels:4,background:'#00000000'}}).composite(composites).webp({lossless:true,exact:true}).toFile(`${out}/${animal}.webp`);
  await writeFile(`${out}/${animal}.json`,JSON.stringify(atlas,null,2)+'\n');
  await writeFile(`${source}/${animal}-export.json`,JSON.stringify({sourceHash:sheet.hash,repairHash:repair?.hash,matte:sheet.matte,frames:records},null,2)+'\n');
  console.log(`${animal}: 72 registered painted poses`);
}
