#!/usr/bin/env node
/** Isolated walking-layer export from fixed whole-frame board crops. Back poses
 * receive one integer full-frame ground registration before material extraction.
 * Original waist pixels protect the upper join; one identified detached skin
 * fragment is removed. Every exception is recorded, and live files stay intact.
 */
import sharp from 'sharp';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertDimensions, canonical, cleanDetachedSkin } from './prepare-player-head-edits.mjs';

const root=resolve(import.meta.dirname,'..'),live=resolve(root,'web/public/assets/player-layers');
const W=128,H=192,COLS=9,ROWS=4;
export const BOARD_LAYOUT={width:1536,height:1024,columns:4,rows:2,cellWidth:384,cellHeight:512,inner:{left:32,top:16,width:320,height:480},scale:.4};
const load=async path=>sharp(await readFile(path)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
export function validateBoard(image,layout=BOARD_LAYOUT) {
  assertDimensions(image,{width:1536,height:1024},'Walk board');
  if(layout.columns!==4||layout.rows!==2||layout.cellWidth!==384||layout.cellHeight!==512||layout.inner.left!==32||layout.inner.top!==16||layout.inner.width!==320||layout.inner.height!==480||layout.scale!==.4)throw new Error('Walk board requires exactly eight 4×2 cells and the shared 320×480 inner template.');
}
export function boardFrame(image,pose) {
  validateBoard(image);
  if(!Number.isInteger(pose)||pose<0||pose>=8)throw new Error('Walk board pose index must identify one of its eight cells.');
  const {inner,cellWidth,cellHeight,scale}=BOARD_LAYOUT;
  return canonical(image,{transform:{scale,offset:{x:0,y:0},sourceCell:{left:pose%4*cellWidth+inner.left,top:Math.floor(pose/4)*cellHeight+inner.top,width:inner.width,height:inner.height}}});
}
export function translateWholeFrame(data,dy) {
  if(data.length!==W*H*4||!Number.isInteger(dy)||Math.abs(dy)>=H)throw new Error('Whole-frame registration requires a 128×192 RGBA frame and an integer vertical offset.');
  const out=Buffer.alloc(data.length);
  for(let y=0;y<H;y++){
    const target=y+dy;
    if(target>=0&&target<H)data.copy(out,target*W*4,y*W*4,(y+1)*W*4);
    else for(let x=0;x<W;x++)if(data[(y*W+x)*4+3]>=64)throw new Error('Whole-frame registration would clip the painted silhouette.');
  }
  return out;
}
function color(r,g,b) {
  const max=Math.max(r,g,b),min=Math.min(r,g,b),chroma=max-min,saturation=chroma/Math.max(1,max);
  const hue=chroma?((max===r?(g-b)/chroma:max===g?2+(b-r)/chroma:4+(r-g)/chroma)*60+360)%360:0;
  return {
    violet:hue>=230&&hue<=350&&chroma>=4&&saturation>=.05&&b>g*1.03&&b>=r*.65,
    guide:hue>=340&&saturation>.25&&b>g*.90 || hue<=10&&saturation>.25&&b>g*.90 || hue>=195&&hue<245&&saturation>.18&&b>r*1.2,
    neutral:saturation<.45&&max<140&&r<=b*1.50&&g<=b*1.04&&r>=g*.90,
    boot:r>=g*.95&&r>=b*.99&&max<185,
  };
}
function components(mask) {
  const visited=new Uint8Array(mask.length),out=[];
  for(let index=0;index<mask.length;index++){
    if(!mask[index]||visited[index])continue;
    const points=[],pending=[index];visited[index]=1;
    while(pending.length){const p=pending.pop(),x=p%W,y=Math.floor(p/W);points.push(p);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,n=ny*W+nx;if(nx<0||nx>=W||ny<0||ny>=H||visited[n]||!mask[n])continue;visited[n]=1;pending.push(n);}}
    out.push(points);
  }
  return out;
}
export function extractLegs(frame,data) {
  const size=W*H,cut=Math.max(0,Math.ceil(frame.waist.y-8)),bootCut=Math.floor(frame.ground.y-56);
  const clothPossible=new Uint8Array(size),bootPossible=new Uint8Array(size),violet=new Uint8Array(size),owners=new Uint8Array(size);
  const headWidth=frame.headBounds.right-frame.headBounds.left;
  for(let y=cut;y<H;y++)for(let x=0;x<W;x++){
    const index=y*W+x,p=index*4;if(data[p+3]<64)continue;const pigment=color(data[p],data[p+1],data[p+2]);
    const keyed=pigment.violet||pigment.guide,neutral=pigment.neutral&&(y<bootCut||data[p+2]>=data[p]&&data[p+2]>=data[p+1]);
    const waistShadow=y<=frame.waist.y+12&&Math.abs(x-frame.waist.x)<headWidth*.3&&Math.max(data[p],data[p+1],data[p+2])<95&&data[p]>=data[p+1]*.93&&data[p+1]>=data[p+2]*.9&&data[p]>=data[p+2]*.95;
    if(keyed||neutral||waistShadow)clothPossible[index]=1;
    if(keyed)violet[index]=1;
    if(y>=bootCut&&pigment.boot&&!keyed)bootPossible[index]=1;
  }
  let waistComponents=0,discardedClothPixels=0,discardedBootPixels=0;
  const lowerPossible=Uint8Array.from(clothPossible,(value,index)=>value||bootPossible[index]);
  // A passing boot can occlude the other leg's cuff. Validate attachment through
  // the complete painted lower silhouette, then partition its colors in place.
  // Requiring every same-material fragment to reach the waist loses that cuff
  // and the planted boot beneath it, even though the artwork is connected.
  for(const points of components(lowerPossible)){
    const keyed=points.filter(p=>violet[p]).length;
    const waist=points.some(p=>Math.floor(p/W)<=frame.waist.y+6&&Math.abs(p%W-frame.waist.x)<headWidth*.9);
    if(points.length<20||keyed<4||!waist){for(const p of points){if(clothPossible[p])discardedClothPixels++;if(bootPossible[p])discardedBootPixels++;}continue;}
    waistComponents++;
    const pending=[];
    for(const p of points){const at=p*4,pigment=color(data[at],data[at+1],data[at+2]);
      if(violet[p]||clothPossible[p]&&data[at+2]>=data[at]&&data[at+2]>=data[at+1])owners[p]=1;
      else if(bootPossible[p]&&!pigment.neutral)owners[p]=2;
      else if(Math.floor(p/W)<bootCut)owners[p]=1;
      if(owners[p])pending.push(p);
    }
    // Neutral cuff and boot shadows inherit their closest connected painted
    // material seed, without changing alpha, geometry, or source coordinates.
    for(let cursor=0;cursor<pending.length;cursor++){
      const p=pending[cursor],x=p%W,y=Math.floor(p/W);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,n=ny*W+nx;
        if(nx<0||nx>=W||ny<0||ny>=H||!lowerPossible[n]||owners[n])continue;
        owners[n]=owners[p];pending.push(n);
      }
    }
  }
  const bootComponents=components(Uint8Array.from(owners,owner=>owner===2)).length;
  // Recover only the immediate antialiased edge, avoiding alpha1 backing noise
  // that can otherwise connect an entire sheet to a painted component.
  for(let step=0;step<2;step++){
    const next=owners.slice();
    for(let y=cut;y<H;y++)for(let x=0;x<W;x++){
      const index=y*W+x,p=index*4;if(owners[index]||!data[p+3]||data[p+3]>=64)continue;const pigment=color(data[p],data[p+1],data[p+2]);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=W||ny<cut||ny>=H)continue;const owner=owners[ny*W+nx];if(owner===1&&(pigment.violet||pigment.guide||pigment.neutral&&(y<bootCut||data[p+2]>=data[p]))||owner===2&&y>=bootCut&&pigment.boot){next[index]=owner;}}
    }
    owners.set(next);
  }
  const cloth=Buffer.alloc(data.length),boots=Buffer.alloc(data.length);let clothPixels=0,bootPixels=0,waistPixels=0,groundY=-Infinity;
  for(let index=0;index<size;index++)if(owners[index]){
    const p=index*4,y=Math.floor(index/W);data.copy(owners[index]===1?cloth:boots,p,p,p+4);
    if(data[p+3]<64)continue;
    if(owners[index]===1){clothPixels++;if(Math.abs(y-frame.waist.y)<=4&&Math.abs(index%W-frame.waist.x)<headWidth*.9)waistPixels++;}
    else{bootPixels++;if(data[p+3]>=96)groundY=Math.max(groundY,y);}
  }
  const groundDelta=Number.isFinite(groundY)?groundY-frame.ground.y:null;
  const points=Array.from(owners,(owner,index)=>owner&&data[index*4+3]>=64?index:-1).filter(index=>index>=0);
  const silhouette=points.length?{left:Math.min(...points.map(p=>p%W)),right:Math.max(...points.map(p=>p%W)),top:Math.min(...points.map(p=>Math.floor(p/W))),bottom:Math.max(...points.map(p=>Math.floor(p/W)))}:null;
  return {cloth,boots,report:{clothPixels,bootPixels,waistPixels,waistComponents,bootComponents,connectedWaist:waistComponents>0&&waistPixels>0,groundY:Number.isFinite(groundY)?groundY:null,expectedGround:frame.ground.y,groundDelta,groundWarning:groundDelta===null||Math.abs(groundDelta)>3,discardedClothPixels,discardedBootPixels,silhouette}};
}
function cell(image,index,width=W,height=H) {
  const data=Buffer.alloc(width*height*4),left=index%COLS*width,top=Math.floor(index/COLS)*height;
  for(let y=0;y<height;y++)image.data.copy(data,y*width*4,((top+y)*image.info.width+left)*4,((top+y)*image.info.width+left+width)*4);
  return data;
}
function atlas(frames,width=W,height=H) {
  const data=Buffer.alloc(width*COLS*height*ROWS*4);
  frames.forEach((frame,index)=>{const left=index%COLS*width,top=Math.floor(index/COLS)*height;for(let y=0;y<height;y++)frame.copy(data,((top+y)*width*COLS+left)*4,y*width*4,(y+1)*width*4);});return data;
}
const lum=(data,p)=>data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722;
async function proof(output,cloth,boots,manifest) {
  const layers=[['bottom-detail',null],['bottom-fabric','#44464d'],['body-skin','#d6a07d'],['head-detail',null],['jacket-detail',null],['jacket-fabric','#326a65'],['hair-waves','#48372e']];
  const originals=new Map(await Promise.all(layers.filter(([id])=>!id.startsWith('bottom-')).map(async([id])=>[id,await load(resolve(id==='body-skin'?output:live,`${id}-preview.webp`))])));
  const frames=[];
  for(let index=0;index<COLS*ROWS;index++){
    const combined=Buffer.alloc(W*H*4);
    for(const [id,tint]of layers){const pixels=id==='bottom-detail'?boots[index]:id==='bottom-fabric'?cloth[index]:cell(originals.get(id),index),rgb=tint?[1,3,5].map(at=>parseInt(tint.slice(at,at+2),16)):[255,255,255];
      for(let p=0;p<pixels.length;p+=4){const a=pixels[p+3]/255,b=combined[p+3]/255,total=a+b*(1-a);if(!total)continue;for(let c=0;c<3;c++)combined[p+c]=Math.round((pixels[p+c]*rgb[c]/255*a+combined[p+c]*b*(1-a))/total);combined[p+3]=Math.round(total*255);}}
    frames.push(combined);
  }
  const packed=atlas(frames),raw={raw:{width:W*COLS,height:H*ROWS,channels:4}};
  await sharp(packed,raw).png().toFile(resolve(output,'composite-preview.png'));
  const overlays=[],cw=144,ch=226,title=34,width=cw*COLS,height=title+ch*ROWS;
  overlays.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${title}"><text x="10" y="22" font-family="Arial" font-size="15" fill="#342e28">Candidate legs with protected original waist and upper layers · identified skin fragment removed</text></svg>`),left:0,top:0});
  for(let index=0;index<frames.length;index++){const left=index%COLS*cw,top=title+Math.floor(index/COLS)*ch;overlays.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="28"><text x="8" y="18" font-family="Arial" font-size="12" fill="#342e28">${['Front','Right','Back','Left'][Math.floor(index/COLS)]} ${index%COLS?'walk '+index%COLS:'original idle'}</text></svg>`),left,top},{input:await sharp(frames[index],{raw:{width:W,height:H,channels:4}}).png().toBuffer(),left:left+8,top:top+28});}
  await sharp({create:{width,height,channels:4,background:'#f8f1e7'}}).composite(overlays).png().toFile(resolve(output,'composite-labelled.png'));
  for(const direction of [0,1,2,3]){
    const waistOverlays=[],cellWidth=256,cellHeight=220;
    for(let pose=0;pose<8;pose++){
      const index=direction*COLS+pose+1,top=Math.max(0,Math.floor(manifest.frames[index].waist.y)-12),left=pose%4*cellWidth,row=Math.floor(pose/4)*cellHeight;
      const crop=await sharp(frames[index],{raw:{width:W,height:H,channels:4}}).extract({left:32,top,width:64,height:48}).resize(256,192,{kernel:'nearest'}).png().toBuffer();
      const title=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="28"><text x="8" y="18" font-family="Arial" font-size="14" fill="#342e28">${DIRECTIONS[direction]} walk ${pose+1} · waist ×4</text></svg>`);
      waistOverlays.push({input:title,left,top:row},{input:crop,left,top:row+28});
    }
    await sharp({create:{width:1024,height:440,channels:4,background:'#f8f1e7'}}).composite(waistOverlays).png().toFile(resolve(output,`waist-${DIRECTIONS[direction]}-labelled.png`));
    const groundOverlays=[],groundCellWidth=384,groundCellHeight=268;
    for(let pose=0;pose<8;pose++){
      const index=direction*COLS+pose+1,left=pose%4*groundCellWidth,row=Math.floor(pose/4)*groundCellHeight;
      const crop=await sharp(frames[index],{raw:{width:W,height:H,channels:4}}).extract({left:0,top:112,width:W,height:80}).resize(384,240,{kernel:'nearest'}).png().toBuffer();
      const guide=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="384" height="240"><line x1="0" x2="384" y1="${(manifest.frames[index].ground.y-112)*3}" y2="${(manifest.frames[index].ground.y-112)*3}" stroke="#b73b32" stroke-opacity=".7" stroke-width="1"/></svg>`);
      const title=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="384" height="28"><text x="8" y="18" font-family="Arial" font-size="14" fill="#342e28">${DIRECTIONS[direction]} walk ${pose+1} · ground 172.8 ×3</text></svg>`);
      groundOverlays.push({input:title,left,top:row},{input:crop,left,top:row+28},{input:guide,left,top:row+28});
    }
    await sharp({create:{width:1536,height:536,channels:4,background:'#f8f1e7'}}).composite(groundOverlays).png().toFile(resolve(output,`ground-${DIRECTIONS[direction]}-labelled.png`));
  }
  const pages=[],pageHeight=220;
  const labels=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="28">${DIRECTIONS.map((name,direction)=>`<text x="${direction*W+8}" y="18" font-family="Arial" font-size="14" fill="#342e28">${name}</text>`).join('')}</svg>`);
  for(let pose=0;pose<8;pose++){
    const overlays=[{input:labels,left:0,top:0}];
    for(let direction=0;direction<4;direction++)overlays.push({input:await sharp(frames[direction*COLS+pose+1],{raw:{width:W,height:H,channels:4}}).png().toBuffer(),left:direction*W,top:28});
    pages.push(await sharp({create:{width:512,height:pageHeight,channels:4,background:'#f8f1e7'}}).composite(overlays).raw().toBuffer());
  }
  // GIF time units are centiseconds. Alternate120/130ms for an exact1s cycle.
  const delay=Array.from({length:8},(_,pose)=>pose%2?130:120),gifPath=resolve(output,'walk-four-directions-1s.gif');
  await sharp(Buffer.concat(pages),{raw:{width:512,height:pageHeight*8,pageHeight,channels:4}}).gif({loop:0,delay,effort:3,dither:0,keepDuplicateFrames:true}).toFile(gifPath);
  const metadata=await sharp(gifPath,{animated:true}).metadata();
  if(metadata.pages!==8||metadata.delay?.reduce((total,value)=>total+value,0)!==1000)throw new Error('Motion GIF did not preserve all eight poses and the one-second cycle.');
  return {file:'walk-four-directions-1s.gif',frames:metadata.pages,delayMs:metadata.delay,cycleMs:1000,recipe:layers};
}
const DIRECTIONS=['front','right','back','left'];
const sha256=data=>createHash('sha256').update(data).digest('hex');
async function upperHashes() {
  const names=(await readdir(live)).filter(name=>/\.(png|webp)$/.test(name)&&!name.startsWith('bottom-')).sort();
  return Object.fromEntries(await Promise.all(names.map(async name=>[name,sha256(await readFile(resolve(live,name)))])));
}
function copyRuntimeCell(target,original,index) {
  const left=index%COLS*64,top=Math.floor(index/COLS)*96;
  for(let y=0;y<96;y++){const at=((top+y)*COLS*64+left)*4;original.copy(target,at,at,at+64*4);}
}
function waistFit(frame,originalCloth,originalBoots,cloth,boots,upper) {
  let originalPixels=0,uncoveredPixels=0,exposedPixels=0;
  for(let y=Math.max(0,Math.floor(frame.waist.y-8));y<=Math.min(H-1,Math.ceil(frame.waist.y+8));y++)for(let x=0;x<W;x++){
    const p=(y*W+x)*4;
    if(Math.max(originalCloth[p+3],originalBoots[p+3])<96)continue;
    originalPixels++;if(Math.max(cloth[p+3],boots[p+3])<48){uncoveredPixels++;if(upper[p+3]<64)exposedPixels++;}
  }
  return {originalWaistPixels:originalPixels,uncoveredOriginalWaistPixels:uncoveredPixels,uncoveredExposedWaistPixels:exposedPixels};
}
export function protectWaist(frame,cloth,boots,originalCloth,originalBoots) {
  const top=Math.max(0,Math.floor(frame.waist.y-8)),bottom=Math.min(H-1,Math.ceil(frame.waist.y+8)),transitionRows=4;
  const protectedCloth=Buffer.from(cloth),protectedBoots=Buffer.from(boots);
  for(const [target,original]of [[protectedCloth,originalCloth],[protectedBoots,originalBoots]]){
    for(let y=top;y<=Math.min(H-1,bottom+transitionRows);y++){
      const weight=y<=bottom?1:(transitionRows-(y-bottom))/transitionRows;
      if(weight<=0)continue;
      for(let x=0;x<W;x++){
        const p=(y*W+x)*4,a=original[p+3]/255*weight;
        if(!a)continue; // Transparent old pixels cannot erase a wider new thigh.
        if(a===1){original.copy(target,p,p,p+4);continue;}
        const b=target[p+3]/255*(1-a),total=a+b;
        for(let c=0;c<3;c++)target[p+c]=Math.round((original[p+c]*a+target[p+c]*b)/total);
        target[p+3]=Math.round(total*255);
      }
    }
  }
  return {cloth:protectedCloth,boots:protectedBoots,metadata:{top,bottom,relativeBand:[-8,8],transitionRows,originalOpaqueRGBAExact:true,antialiasedEdgesSourceOver:true,candidateOutsideOriginalCoveragePreserved:true,coordinatesUnchanged:true}};
}
async function main() {
  const args=process.argv.slice(2),inputs=new Map();let legacyInput=null;
  for(let index=0;index<args.length;index++){
    const arg=args[index],direction=DIRECTIONS.indexOf(arg.slice(2));
    if(!arg.startsWith('--')||direction<0&&arg!=='--input')throw new Error(`Unknown argument: ${arg}`);
    if(!args[index+1]||args[index+1].startsWith('--'))throw new Error(`${arg} requires a source PNG path.`);
    const path=resolve(args[++index]);
    if(arg==='--input')legacyInput=path;else if(inputs.has(direction))throw new Error(`${arg} was supplied twice.`);else inputs.set(direction,path);
  }
  if(legacyInput&&inputs.size)throw new Error('Use either a legacy full source sheet or explicit direction boards, never both.');
  if(!legacyInput&&!inputs.size)throw new Error('Supply at least one --front, --right, --back or --left board path.');
  const output=resolve(process.env.PLAYER_WALK_LEGS_OUTPUT_DIR??'/private/tmp/player-walk-boards');
  if(output===live||output.startsWith(`${live}/`))throw new Error('Candidate export must remain outside live player assets.');
  const hashesBefore=await upperHashes(),manifest=JSON.parse(await readFile(resolve(live,'manifest.json'),'utf8'));
  if(manifest.cell?.[0]!==W||manifest.cell?.[1]!==H||manifest.columns!==COLS||manifest.rows!==ROWS||manifest.frames.length!==COLS*ROWS)throw new Error('Expected existing 9×4 shared registration manifest.');
  const boards=new Map(),sources=[];let candidate=null;
  for(const [direction,path]of inputs){
    const image=await load(path);validateBoard(image);boards.set(direction,image);
    const source={direction,name:DIRECTIONS[direction],file:relative(root,path),sha256:sha256(await readFile(path)),layout:BOARD_LAYOUT};
    try{
      const provenance=JSON.parse(await readFile(path.replace(/\.png$/i,'.provenance.json'),'utf8'));
      if(provenance.sha256!==source.sha256||provenance.rgbaExact!==true||provenance.cells?.length!==8||provenance.cells.some((cell,index)=>cell.cell!==index||!Number.isInteger(cell.sourceCell)||cell.sourceCell<0||cell.sourceCell>=8))throw new Error(`Invalid per-cell board provenance: ${path}`);
      validateBoard(image,provenance.layout);source.cells=provenance.cells;source.packedRGBAExact=true;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    sources.push(source);
  }
  if(legacyInput){candidate=await load(legacyInput);assertDimensions(candidate,{width:1536,height:1024},'Lower-body candidate');sources.push({file:relative(root,legacyInput),sha256:sha256(await readFile(legacyInput)),layout:'Legacy 9×4 native cells with original manifest transforms'});}
  const originalCloth=await load(resolve(live,'bottom-fabric-preview.webp')),originalBoots=await load(resolve(live,'bottom-detail-preview.webp'));
  for(const image of [originalCloth,originalBoots])assertDimensions(image,{width:W*COLS,height:H*ROWS},'Original bottom preview');
  // These immutable raw WebPs come from the bald master body exporter. Unlike
  // active previews, they are never replaced by a staged walking-layer export.
  const waistCloth=await load(resolve(live,'bottom-fabric-raw.webp')),waistBoots=await load(resolve(live,'bottom-detail-raw.webp'));
  for(const image of [waistCloth,waistBoots])assertDimensions(image,{width:W*COLS,height:H*ROWS},'Original master waist material');
  for(let p=0;p<waistCloth.data.length;p+=4)if(waistCloth.data[p+3]){const gray=Math.min(255,Math.round(lum(waistCloth.data,p)*255/70));waistCloth.data[p]=waistCloth.data[p+1]=waistCloth.data[p+2]=gray;}
  const waistSources=await Promise.all(['bottom-fabric','bottom-detail'].map(async id=>({file:`${id}-raw.webp`,sha256:sha256(await readFile(resolve(live,`${id}-raw.webp`))),neutralReference:id==='bottom-fabric'?70:null})));
  const upperCoverage=Buffer.alloc(originalCloth.data.length);
  for(const id of ['body-skin','head-detail','jacket-detail','jacket-fabric','hair-waves']){const image=await load(resolve(live,`${id}-preview.webp`));assertDimensions(image,{width:W*COLS,height:H*ROWS},'Original upper preview');for(let p=3;p<upperCoverage.length;p+=4)upperCoverage[p]=Math.max(upperCoverage[p],image.data[p]);}
  const cloth=[],boots=[],reports=[],levels=[],edited=new Set();
  for(const [index,frame]of manifest.frames.entries()){
    const direction=Math.floor(index/COLS),column=index%COLS,oldCloth=cell(originalCloth,index),oldBoots=cell(originalBoots,index),board=boards.get(direction);
    if(column===0||!board&&!candidate){cloth.push(oldCloth);boots.push(oldBoots);reports.push({frame:index,direction,column,copiedOriginal:true,originalIdle:column===0});continue;}
    let pixels=board?boardFrame(board,column-1):canonical(candidate,frame),registration=null;
    if(board&&direction===2){
      const originalGround=extractLegs(frame,pixels).report.groundY,targetGround=Math.round(frame.ground.y);
      if(originalGround===null)throw new Error(`Back frame ${column} has no ground-contact boot pixels.`);
      const dy=targetGround-originalGround;pixels=translateWholeFrame(pixels,dy);
      registration={space:'Canonical whole source frame after fixed board crop',offset:{x:0,y:dy},originalGround,targetGround,appliedBeforeMaterialExtraction:true,scaleUnchanged:true,visibleRGBAUnchanged:true};
    }
    const extracted=extractLegs(frame,pixels);edited.add(index);cloth.push(extracted.cloth);boots.push(extracted.boots);
    const source=sources.find(source=>source.direction===direction),provenance=board?source.cells?.[column-1]??{source:source.file,sourceCell:column-1,sourceSha256:source.sha256}:null;
    reports.push({frame:index,direction,column,boardCell:board?column-1:null,provenance,registration,...extracted.report,...waistFit(frame,oldCloth,oldBoots,extracted.cloth,extracted.boots,cell({data:upperCoverage,info:originalCloth.info},index))});
    for(let p=0;p<extracted.cloth.length;p+=4)if(extracted.cloth[p+3]>=128)levels.push(lum(extracted.cloth,p));
  }
  levels.sort((a,b)=>a-b);const reference=Math.max(40,levels[Math.floor(levels.length*.85)]??70);
  const errors=reports.filter(frame=>!frame.copiedOriginal&&(!frame.clothPixels||!frame.bootPixels||!frame.connectedWaist));
  const report={sources,output,cell:[W,H],runtimeCell:[64,96],columns:COLS,rows:ROWS,registration:boards.size?'Fixed whole-frame crop (32,16,320,480) within each 384×512 board cell, uniform scale 0.4. No leg warp, pose realignment or independent material transform.':'Existing per-frame full-source isotropic transforms, unchanged.',clothReference:reference,frames:reports,errors,warnings:reports.filter(frame=>!frame.copiedOriginal&&(frame.groundWarning||frame.uncoveredExposedWaistPixels>8))};
  await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(errors.length)throw new Error(`Lower-body extraction failed in ${errors.length} board cells; report saved, no atlases emitted.`);
  await sharp(atlas(cloth),{raw:{width:W*COLS,height:H*ROWS,channels:4}}).png().toFile(resolve(output,'bottom-fabric-candidate-raw.png'));
  await sharp(atlas(boots),{raw:{width:W*COLS,height:H*ROWS,channels:4}}).png().toFile(resolve(output,'bottom-detail-candidate-raw.png'));
  for(const index of edited)for(let p=0;p<cloth[index].length;p+=4)if(cloth[index][p+3]){const gray=Math.min(255,Math.round(lum(cloth[index],p)*255/reference));cloth[index][p]=cloth[index][p+1]=cloth[index][p+2]=gray;}
  for(const index of edited){
    const oldCloth=cell(originalCloth,index),oldBoots=cell(originalBoots,index),protectedMaterials=protectWaist(manifest.frames[index],cloth[index],boots[index],cell(waistCloth,index),cell(waistBoots,index));
    cloth[index]=protectedMaterials.cloth;boots[index]=protectedMaterials.boots;reports[index].protectedWaist=protectedMaterials.metadata;
    Object.assign(reports[index],waistFit(manifest.frames[index],oldCloth,oldBoots,cloth[index],boots[index],cell({data:upperCoverage,info:originalCloth.info},index)));
  }
  report.protectedWaist={source:'Immutable original master raw materials source-over new fabric after neutralization',sourceAtlases:waistSources,relativeBand:[-8,8],transitionRows:4,originalOpaqueRGBAExact:true,antialiasedEdgesSourceOver:true,candidateOutsideOriginalCoveragePreserved:true,coordinatesUnchanged:true};
  report.warnings=reports.filter(frame=>!frame.copiedOriginal&&(frame.groundWarning||frame.uncoveredExposedWaistPixels>8));
  await sharp(atlas(cloth),{raw:{width:W*COLS,height:H*ROWS,channels:4}}).png().toFile(resolve(output,'bottom-fabric-raw.png'));
  await sharp(atlas(boots),{raw:{width:W*COLS,height:H*ROWS,channels:4}}).png().toFile(resolve(output,'bottom-detail-raw.png'));
  report.preservedFrames={frames:reports.filter(frame=>frame.copiedOriginal).map(frame=>frame.frame),assets:[]};
  for(const [id,frames]of [['bottom-fabric',cloth],['bottom-detail',boots]]){
    const data=atlas(frames),raw={raw:{width:W*COLS,height:H*ROWS,channels:4}};
    await sharp(data,raw).webp({lossless:true,exact:true}).toFile(resolve(output,`${id}-preview.webp`));
    const runtime=await sharp(data,raw).resize(COLS*64,ROWS*96,{fit:'fill'}).raw().toBuffer(),original=await load(resolve(live,`${id}.webp`));
    assertDimensions(original,{width:64*COLS,height:96*ROWS},'Original bottom runtime');
    for(let index=0;index<COLS*ROWS;index++)if(!edited.has(index))copyRuntimeCell(runtime,original.data,index);
    await sharp(runtime,{raw:{width:64*COLS,height:96*ROWS,channels:4}}).webp({lossless:true,exact:true}).toFile(resolve(output,`${id}.webp`));
    const previewEmitted=await load(resolve(output,`${id}-preview.webp`)),runtimeEmitted=await load(resolve(output,`${id}.webp`)),previewOriginal=id==='bottom-fabric'?originalCloth:originalBoots;
    const previewExact=report.preservedFrames.frames.every(index=>cell(previewOriginal,index).equals(cell(previewEmitted,index))),runtimeExact=report.preservedFrames.frames.every(index=>cell(original,index,64,96).equals(cell(runtimeEmitted,index,64,96)));
    report.preservedFrames.assets.push({id,previewRGBAExact:previewExact,runtimeRGBAExact:runtimeExact});
    if(!previewExact||!runtimeExact)throw new Error(`${id}: original idle or untouched direction RGBA changed during export.`);
  }
  const originalSkin=await load(resolve(live,'body-skin-preview.webp')),originalSkinRuntime=await load(resolve(live,'body-skin.webp')),skinFrames=[],skinCleanup=[];
  for(const [index,frame]of manifest.frames.entries()){const cleaned=cleanDetachedSkin(frame,cell(originalSkin,index),index);skinFrames.push(cleaned.data);if(cleaned.removed)skinCleanup.push(cleaned.removed);}
  const skinData=atlas(skinFrames),skinRuntime=await sharp(skinData,{raw:{width:W*COLS,height:H*ROWS,channels:4}}).resize(64*COLS,96*ROWS,{fit:'fill'}).raw().toBuffer();
  const changedSkinFrames=new Set(skinCleanup.map(item=>item.frame));
  for(let index=0;index<COLS*ROWS;index++)if(!changedSkinFrames.has(index))copyRuntimeCell(skinRuntime,originalSkinRuntime.data,index);
  for(const exception of skinCleanup){
    const old=cell(originalSkinRuntime,exception.frame,64,96),current=cell({data:skinRuntime,info:{width:64*COLS}},exception.frame,64,96),cut=Math.floor(exception.bounds.top/2)-4;
    if(!old.subarray(0,cut*64*4).equals(current.subarray(0,cut*64*4)))throw new Error('Skin cleanup changed runtime head or hand pixels outside the identified lower fragment.');
    exception.runtimeHeadAndHandsRGBAExact=true;
  }
  await sharp(skinData,{raw:{width:W*COLS,height:H*ROWS,channels:4}}).webp({lossless:true,exact:true}).toFile(resolve(output,'body-skin-preview.webp'));
  await sharp(skinRuntime,{raw:{width:64*COLS,height:96*ROWS,channels:4}}).webp({lossless:true,exact:true}).toFile(resolve(output,'body-skin.webp'));
  const inheritedSkinExceptions=manifest.skinCleanup?.exceptions??manifest.skinCleanup?.rebuildExceptions??[],allSkinExceptions=Array.from(new Map([...inheritedSkinExceptions,...skinCleanup].map(exception=>[exception.frame,exception])).values());
  report.skinCleanup={source:'Current active body-skin atlas retaining the recorded rebuild exception',exceptions:allSkinExceptions,removedThisExport:skinCleanup,otherFramesRGBAExact:true,sourceFilesUnchanged:true};
  report.motionProof=await proof(output,cloth,boots,manifest);
  const hashesAfter=await upperHashes(),upperUnchanged=Object.keys(hashesBefore).length===Object.keys(hashesAfter).length&&Object.entries(hashesBefore).every(([name,hash])=>hashesAfter[name]===hash);
  report.upperAssets={sourceBaseline:'Current active public assets, including the recorded skin cleanup when present',sourceFilesUnchanged:upperUnchanged,unchanged:upperUnchanged,before:hashesBefore,after:hashesAfter};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(!upperUnchanged)throw new Error('Original upper asset hashes changed during isolated export.');
  const staged=structuredClone(manifest);
  staged.reconstruction={...staged.reconstruction,rawPixelExact:false,disjoint:false,upperMaterialsUnchanged:true,idleFramesUnchanged:true,description:'Edited lower-body pixels replace selected walking frames; they do not reconstruct the original bald body master. Upper materials retain original pixels and registration.'};
  staged.lowerBodyEdit={source:'player-walk-edits',sources,template:boards.size?BOARD_LAYOUT:null,protectedWaist:report.protectedWaist,editedFrames:[...edited],originalFrames:reports.filter(frame=>frame.copiedOriginal).map(frame=>frame.frame)};
  for(const index of edited){staged.frames[index].lowerBodySource=reports[index].provenance;if(reports[index].registration)staged.frames[index].lowerBodyRegistration=reports[index].registration;}
  for(const asset of staged.assets)if(asset.id==='bottom-detail'||asset.id==='bottom-fabric')Object.assign(asset,{source:'player-walk-edits-with-original-waist',sourceBoards:sources,template:boards.size?BOARD_LAYOUT:null,protectedWaist:report.protectedWaist,previewFile:`${asset.id}-preview.webp`,rawFile:`${asset.id}-raw.png`,reference:asset.id==='bottom-fabric'?reference:null,editedFrames:[...edited],originalIdlePreserved:true});
  staged.skinCleanup=report.skinCleanup;
  const skinAsset=staged.assets.find(asset=>asset.id==='body-skin');if(skinAsset)skinAsset.cleanup=report.skinCleanup;
  staged.reconstruction.upperMaterialsUnchanged=allSkinExceptions.length===0;
  staged.reconstruction.upperMaterialsUnchangedExcept=allSkinExceptions;
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(staged,null,2)+'\n');
  console.log(JSON.stringify({output,sources:sources.map(source=>basename(source.file)),editedFrames:edited.size,warnings:report.warnings.length,upperUnchanged,proof:resolve(output,'composite-labelled.png')}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
