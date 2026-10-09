#!/usr/bin/env node
/**
 * Register each complete painted frame once, then partition its exact pixels.
 * No limb rig, independent piece resizing, or per-material translations.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(process.env.PLAYER_LAYERS_SOURCE_PATH ?? resolve(root, 'art/source/player-customizations/motion.png'));
// Overrides allow isolated reproducibility checks without replacing live assets.
const outputDir = resolve(process.env.PLAYER_LAYERS_OUTPUT_DIR ?? resolve(root, 'web/public/assets/player-layers'));
const proofDir = resolve(process.env.PLAYER_LAYERS_PROOF_DIR ?? '/private/tmp');
const WIDTH = 128, HEIGHT = 192, COLUMNS = 9, ROWS = 4;
const GROUND = { x: 64, y: 172.8 }, IDLE_HEIGHT = 142, MAX_BODY_VARIATION = 2;
const ids = ['jacket-detail', 'jacket-fabric', 'hands-skin', 'bottom-detail', 'bottom-fabric'];
const labels = Object.fromEntries(ids.map((id, index) => [id, index]));
await mkdir(outputDir, { recursive: true });
await mkdir(proofDir, { recursive: true });
const sourceFile = await readFile(sourcePath);
const { data: source, info } = await sharp(sourceFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

function pigment(r, g, b) {
  const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b), chroma = maximum - minimum;
  const hue = chroma ? ((maximum === r ? (g-b)/chroma : maximum === g ? 2+(b-r)/chroma : 4+(r-g)/chroma)*60+360)%360 : 0;
  const saturation = chroma / Math.max(1, maximum);
  return {
    coat: hue >= 115 && hue <= 225 && chroma > 8 && saturation > 0.18,
    coatShade: hue >= 110 && hue <= 235 && chroma > 2 && r < g*0.98 && r < b*1.06,
    skin: hue >= 3 && hue < 30 && saturation > 0.30 && r > g*1.18 && r > b*1.43,
    warmSkin: hue >= 3 && hue < 42 && chroma > 8 && r > g*1.10 && r > b*1.25,
    boot: hue < 50 && saturation > 0.13 && r > g*1.08 && r > b*1.14,
    neutral: saturation < 0.19 && maximum < 155 && r >= g*0.98 && r >= b*1.03,
    shirt: maximum > 95 && g > r*0.79 && b > r*0.52,
    shirtPaint: r >= g*0.99 && r > b*1.02 && (maximum >= 135 || saturation > 0.18 && r-g > 12),
  };
}
const alphaAt = (x, y) => source[(y*info.width+x)*4+3];
function divider(axis, expected, radius, start, end) {
  let best = Math.round(expected), minimum = Infinity;
  for (let position = Math.round(expected-radius); position <= Math.round(expected+radius); position++) {
    let score = 0;
    for (let other = start; other < end; other++) {
      const alpha = axis === 'x' ? alphaAt(position, other) : alphaAt(other, position);
      if (alpha >= 128) score += alpha;
    }
    score += Math.abs(position-expected)*0.001;
    if (score < minimum) { best = position; minimum = score; }
  }
  return best;
}
const rowEdges = [0, ...Array.from({length:ROWS-1}, (_, index) => divider('y', (index+1)*info.height/ROWS, info.height*0.025, 0, info.width)), info.height];
const nativeFrames = [];
for (let row = 0; row < ROWS; row++) {
  const columnEdges = [0, ...Array.from({length:COLUMNS-1}, (_, index) => divider('x', (index+1)*info.width/COLUMNS, info.width*0.013, rowEdges[row], rowEdges[row+1])), info.width];
  for (let column = 0; column < COLUMNS; column++) {
    const rect = { left:columnEdges[column], top:rowEdges[row], width:columnEdges[column+1]-columnEdges[column], height:rowEdges[row+1]-rowEdges[row] };
    const pixels = await sharp(sourceFile).extract(rect).ensureAlpha().raw().toBuffer();
    nativeFrames.push(measure(pixels, rect.width, rect.height, rect, row, column));
  }
}

function measure(data, width, height, sourceCell, direction, column) {
  const opaque = [], coatRows = [], skinRows = [];
  for (let y = 0; y < height; y++) {
    const skinXs = []; let coatCount = 0;
    for (let x = 0; x < width; x++) {
      const p = (y*width+x)*4;
      if (data[p+3] < 160) continue;
      opaque.push({x,y});
      const color = pigment(data[p], data[p+1], data[p+2]);
      if (color.coat) coatCount++;
      if (color.skin) skinXs.push(x);
    }
    if (coatCount >= 4) coatRows.push({y,count:coatCount});
    if (skinXs.length) skinRows.push({y,xs:skinXs});
  }
  if (!opaque.length) throw new Error(`Empty painted frame ${direction}/${column}`);
  const crownY = Math.min(...opaque.map(point => point.y)), groundY = Math.max(...opaque.map(point => point.y));
  const collar = coatRows.find(row => row.y < crownY+(groundY-crownY)*0.35);
  if (!collar) throw new Error(`No teal collar in frame ${direction}/${column}`);
  // The bald head meets the collar here. Measure warm head pixels ABOVE the
  // first substantial teal collar row; never assume a constant neckline.
  const neckY = collar.y-1;
  const neckRows = skinRows.filter(row => row.y >= neckY-3 && row.y <= neckY);
  const headRows = skinRows.filter(row => row.y >= crownY && row.y <= neckY);
  const neckXs = neckRows.flatMap(row => row.xs), headXs = headRows.flatMap(row => row.xs);
  if (!neckXs.length || !headXs.length) throw new Error(`Missing bald neck in frame ${direction}/${column}`);
  const neckX = neckXs.reduce((sum, x) => sum+x, 0)/neckXs.length;
  const headLeft = Math.min(...headXs), headRight = Math.max(...headXs)+1;
  const headWidth = headRight-headLeft;
  // The measured waistband is the first substantial run of neutral trousers
  // in the central body lane. Coat tails remain in the jacket material below it.
  let waistY;
  for (let y = Math.round(neckY+headWidth*0.9); y < groundY; y++) {
    let count = 0;
    for (let x = Math.max(0, Math.round(neckX-headWidth*0.5)); x <= Math.min(width-1, Math.round(neckX+headWidth*0.5)); x++) {
      const p = (y*width+x)*4;
      if (data[p+3] >= 160 && pigment(data[p],data[p+1],data[p+2]).neutral) count++;
    }
    if (count >= Math.max(4, headWidth*0.23)) { waistY = y; break; }
  }
  if (waistY === undefined) throw new Error(`Missing trousers in frame ${direction}/${column}`);
  return { data, width, height, sourceCell, direction, column, crown:{x:neckX,y:crownY}, neck:{x:neckX,y:neckY}, headBounds:{left:headLeft,top:crownY,right:headRight,bottom:neckY}, waist:{x:neckX,y:waistY}, ground:{x:neckX,y:groundY} };
}

function canonicalFrame(frame) {
  const idle = nativeFrames[frame.direction*COLUMNS];
  // The generated master changes figure size between idle and walk. Register
  // the COMPLETE pose isotropically, preserving at most two pixels of its
  // measured height variation. Every material shares this exact transform.
  const nativeHeight = frame.ground.y-frame.crown.y;
  const referenceScale = IDLE_HEIGHT/(idle.ground.y-idle.crown.y);
  const originalHeightVariation = nativeHeight*referenceScale-IDLE_HEIGHT;
  const heightVariation = Math.max(-MAX_BODY_VARIATION,Math.min(MAX_BODY_VARIATION,originalHeightVariation));
  const scale = (IDLE_HEIGHT+heightVariation)/nativeHeight;
  const offset = { x:GROUND.x-frame.neck.x*scale, y:GROUND.y-frame.ground.y*scale };
  const pixels = Buffer.alloc(WIDTH*HEIGHT*4);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const sourceX = (x-offset.x)/scale, sourceY = (y-offset.y)/scale;
    const x0 = Math.floor(sourceX), y0 = Math.floor(sourceY), fx = sourceX-x0, fy = sourceY-y0;
    let alpha = 0; const rgb = [0,0,0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const nx = x0+dx, ny = y0+dy;
      if (nx < 0 || ny < 0 || nx >= frame.width || ny >= frame.height) continue;
      const p = (ny*frame.width+nx)*4, weight = (dx ? fx : 1-fx)*(dy ? fy : 1-fy), contribution = frame.data[p+3]*weight;
      alpha += contribution;
      for (let channel = 0; channel < 3; channel++) rgb[channel] += frame.data[p+channel]*contribution;
    }
    const p = (y*WIDTH+x)*4, a = Math.round(alpha);
    if (!a) continue; // RGB underneath alpha0 is backing data, not painted art.
    for (let channel = 0; channel < 3; channel++) pixels[p+channel] = Math.round(rgb[channel]/alpha);
    pixels[p+3] = a;
  }
  const point = value => ({x:offset.x+value.x*scale,y:offset.y+value.y*scale});
  return {
    data:pixels, crown:point(frame.crown), neck:point(frame.neck), waist:point(frame.waist), ground:{...GROUND},
    headBounds:{left:offset.x+frame.headBounds.left*scale,top:offset.y+frame.headBounds.top*scale,right:offset.x+frame.headBounds.right*scale,bottom:offset.y+frame.headBounds.bottom*scale},
    transform:{scale,offset,sourceCell:frame.sourceCell,originalHeightVariation,heightVariation}, direction:frame.direction,column:frame.column,
  };
}

function partition(frame) {
  const data = frame.data, cut = Math.floor(frame.neck.y), headWidth = frame.headBounds.right-frame.headBounds.left;
  const size = WIDTH*HEIGHT, mask = new Int8Array(size).fill(-1), distance = new Int16Array(size).fill(-1);
  const queue = new Int32Array(size); let read = 0, write = 0;
  const shirtCandidates = new Uint8Array(size);
  const shirtDomain = new Uint8Array(size);
  const profile = frame.direction===1 || frame.direction===3, forward=frame.direction===1?1:-1;
  function throat(x,y,color) {
    // Warm highlights at the jaw/collar junction are skin even when their
    // saturation is below the hand detector. This measured neck wedge excludes
    // the pale shirt collar; its depth follows the actual bald head width.
    const down=y-frame.neck.y, depth=headWidth*(frame.direction===2?0.18:0.58);
    const center=frame.neck.x+(profile?forward*(headWidth*0.14+Math.max(0,down)*0.10):0);
    const radius=headWidth*(profile?0.30:0.40)-Math.max(0,down)*0.42;
    return down>=-1 && down<=depth && Math.abs(x-center)<=Math.max(1.5,radius) && color.warmSkin;
  }
  const bootTop = new Float64Array(WIDTH).fill(Infinity);
  for (let y = Math.round(GROUND.y-IDLE_HEIGHT*0.18); y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const p = (y*WIDTH+x)*4;
    if (data[p+3] >= 96 && pigment(data[p],data[p+1],data[p+2]).boot) bootTop[x] = Math.min(bootTop[x],y);
  }
  const bootEdge = Array.from({length:WIDTH}, (_, x) => {
    let top = Infinity;
    for (let nx = Math.max(0,x-3); nx <= Math.min(WIDTH-1,x+3); nx++) top = Math.min(top,bootTop[nx]);
    return top-1;
  });
  for (let y = cut; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const index = y*WIDTH+x, p = index*4;
    if (data[p+3] < 96) continue;
    const r = data[p], g = data[p+1], b = data[p+2], color = pigment(r,g,b);
    const centralShirt = Math.abs(x-frame.neck.x) < headWidth*0.65 && y > frame.neck.y+headWidth*0.75 && y < frame.waist.y+3;
    const shirtCenter=frame.neck.x+(profile?forward*(headWidth*0.12+Math.max(0,y-frame.neck.y)*0.15):0);
    const shirtRegion=frame.direction!==2 && Math.abs(x-shirtCenter)<headWidth*0.70 && y<=frame.waist.y+1;
    let label = -1;
    if (color.coat || color.coatShade) label = labels['jacket-fabric'];
    else if (throat(x,y,color)) label = labels['hands-skin'];
    else if (color.skin && !centralShirt && y < GROUND.y-IDLE_HEIGHT*0.24) label = labels['hands-skin'];
    else if (y >= bootEdge[x]) label = labels['bottom-detail'];
    else if (shirtRegion && color.shirt && color.shirtPaint) shirtCandidates[index]=1;
    else if (color.neutral && y >= frame.waist.y-1) label = labels['bottom-fabric'];
    if(label<0 && shirtRegion)shirtDomain[index]=1;
    if (label >= 0) { mask[index]=label; distance[index]=0; queue[write++]=index; }
  }
  // A static detail belongs to the actual shirt only when its painted component
  // reaches the collar. Unrelated tan/gray islands on trousers or inside the
  // coat stay unresolved and inherit the enclosing tintable material below.
  const visited=new Uint8Array(size);
  for(let index=cut*WIDTH;index<size;index++) {
    if(!shirtDomain[index] || visited[index])continue;
    const component=[],pending=[index];visited[index]=1;let touchesCollar=false,touchesOpening=false;
    while(pending.length) {
      const point=pending.pop(),x=point%WIDTH,y=Math.floor(point/WIDTH),p=point*4;
      component.push(point);
      if(shirtCandidates[point] && y<=frame.neck.y+headWidth*0.45 && Math.max(data[p],data[p+1],data[p+2])>=160)touchesCollar=true;
      // In profile the thin shirt strip is separated from its collar by a
      // painted dark lapel seam. Its second anchor is the forward torso opening.
      const opening=frame.neck.x+forward*(headWidth*0.12+Math.max(0,y-frame.neck.y)*0.15);
      if(profile && shirtCandidates[point] && y>frame.neck.y+headWidth*0.5 && y<frame.waist.y-2 && Math.abs(x-opening)<headWidth*0.22 && Math.max(data[p],data[p+1],data[p+2])>=140)touchesOpening=true;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy,next=ny*WIDTH+nx;
        if(nx<0||nx>=WIDTH||ny<cut||ny>=HEIGHT||visited[next]||!shirtDomain[next])continue;
        visited[next]=1;pending.push(next);
      }
    }
    if(!(touchesCollar||touchesOpening) || component.length<4)continue;
    for(const point of component)if(shirtCandidates[point]){mask[point]=labels['jacket-detail'];distance[point]=0;queue[write++]=point;}
  }
  // Recover antialiased outlines from the adjacent painted material without
  // changing source RGBA. Existing confident labels are never overwritten.
  while (read < write) {
    const index = queue[read++], x = index%WIDTH, y = Math.floor(index/WIDTH);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx=x+dx,ny=y+dy;
      if (nx < 0 || ny < cut || nx >= WIDTH || ny >= HEIGHT) continue;
      const next=ny*WIDTH+nx;
      if (distance[next] >= 0 || !data[next*4+3]) continue;
      mask[next]=mask[index]; distance[next]=distance[index]+1; queue[write++]=next;
    }
  }
  const materials = ids.map(() => Buffer.alloc(data.length)), body = Buffer.alloc(data.length);
  let paintedPixels = 0;
  for (let y = cut; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const index=y*WIDTH+x,p=index*4;
    if (!data[p+3]) continue;
    const label=mask[index] < 0 ? y < frame.waist.y ? labels['jacket-fabric'] : labels['bottom-fabric'] : mask[index];
    data.copy(materials[label],p,p,p+4);data.copy(body,p,p,p+4);paintedPixels++;
  }
  // Exact disjoint-mask reconstruction, including original fractional alpha.
  const combined = Buffer.alloc(data.length);
  for (let p = 0; p < data.length; p += 4) {
    let owners = 0;
    for (const material of materials) if (material[p+3]) { owners++;material.copy(combined,p,p,p+4); }
    if (owners > 1) throw new Error(`Overlapping material masks at ${frame.direction}/${frame.column}/${p/4}`);
  }
  if (!combined.equals(body)) throw new Error(`Body reconstruction failed at ${frame.direction}/${frame.column}`);
  return {materials,body,paintedPixels};
}

const canonical = nativeFrames.map(canonicalFrame), split = canonical.map(partition);
function atlas(frames) {
  const data = Buffer.alloc(WIDTH*COLUMNS*HEIGHT*ROWS*4);
  frames.forEach((frame,index) => {
    const column=index%COLUMNS,row=Math.floor(index/COLUMNS);
    for (let y = 0; y < HEIGHT; y++) frame.copy(data,((row*HEIGHT+y)*WIDTH*COLUMNS+column*WIDTH)*4,y*WIDTH*4,(y+1)*WIDTH*4);
  });
  return data;
}
const rawOptions = {raw:{width:WIDTH*COLUMNS,height:HEIGHT*ROWS,channels:4}};
await sharp(atlas(canonical.map(frame=>frame.data)),rawOptions).png().toFile(`${proofDir}/base.png`);
await sharp(atlas(split.map(frame=>frame.body)),rawOptions).png().toFile(`${proofDir}/base-body.png`);
const assets = [];
for (const [index,id] of ids.entries()) {
  const raw = atlas(split.map(frame=>frame.materials[index]));
  const runtime = Buffer.from(raw), reference = id==='jacket-fabric'?113:id==='hands-skin'?180:id==='bottom-fabric'?70:undefined;
  if (reference) for (let p = 0; p < runtime.length; p += 4) if (runtime[p+3]) {
    const gray=Math.min(255,Math.round((runtime[p]*0.2126+runtime[p+1]*0.7152+runtime[p+2]*0.0722)*255/reference));
    runtime[p]=runtime[p+1]=runtime[p+2]=gray;
  }
  await sharp(raw,rawOptions).png().toFile(`${proofDir}/${id}-raw.png`);
  await sharp(raw,rawOptions).webp({lossless:true}).toFile(`${outputDir}/${id}-raw.webp`);
  await sharp(runtime,rawOptions).webp({lossless:true}).toFile(`${outputDir}/${id}.webp`);
  assets.push({id,file:`${id}.webp`,rawFile:`${id}-raw.webp`,columns:COLUMNS,rows:ROWS,frames:COLUMNS*ROWS,materials:1,reference:reference??null});
}
const alphaHistogram = Array(256).fill(0);let transparentBackingPixels=0;
for(let p=0;p<source.length;p+=4){alphaHistogram[source[p+3]]++;if(!source[p+3]&&(source[p]||source[p+1]||source[p+2]))transparentBackingPixels++;}
const rounded = value => Number(value.toFixed(6));
const roundPoint = point => ({x:rounded(point.x),y:rounded(point.y)});
const manifest = {
  version:5,cell:[WIDTH,HEIGHT],previewCell:[WIDTH,HEIGHT],columns:COLUMNS,rows:ROWS,
  source:relative(root,sourcePath),sourceSha256:createHash('sha256').update(sourceFile).digest('hex'),
  alpha:{sourceMaximum:alphaHistogram.findLastIndex(count=>count>0),sourceZeroPixels:alphaHistogram[0],transparentBackingPixels,preserved:true},
  bodyHeight:IDLE_HEIGHT,maxBodyHeightVariation:MAX_BODY_VARIATION,
  registration:'One isotropic full-frame affine transform shared by all materials; painted figure-size variation capped at two pixels around upright idle.',
  reconstruction:{frames:COLUMNS*ROWS,disjoint:true,rawPixelExact:true},
  frames:canonical.map((frame,index)=>({
    direction:frame.direction,column:frame.column,crown:roundPoint(frame.crown),neck:roundPoint(frame.neck),
    headBounds:Object.fromEntries(Object.entries(frame.headBounds).map(([key,value])=>[key,rounded(value)])),waist:roundPoint(frame.waist),ground:{...GROUND},
    transform:{scale:rounded(frame.transform.scale),offset:roundPoint(frame.transform.offset),sourceCell:frame.transform.sourceCell,originalHeightVariation:rounded(frame.transform.originalHeightVariation),heightVariation:rounded(frame.transform.heightVariation)},paintedPixels:split[index].paintedPixels,
  })),assets,
};
await writeFile(`${outputDir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');

// Annotated upright body proof: col0 from each actual direction, no inferred pose.
const proofWidth=656,proofHeight=270,spacing=156,top=45;
const composites = [];
for(let direction=0;direction<ROWS;direction++)composites.push({input:await sharp(split[direction*COLUMNS].body,{raw:{width:WIDTH,height:HEIGHT,channels:4}}).png().toBuffer(),left:22+direction*spacing,top});
const names=['Front','Right','Back','Left'];
let annotations=`<svg width="${proofWidth}" height="${proofHeight}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;fill:#e8e1cc;font-size:14px}.anchor{stroke:#9acebd;stroke-width:1;fill:#193d38}</style><text x="22" y="22">Actual painted idle · independent material masks · unchanged body pixels</text>`;
for(let direction=0;direction<ROWS;direction++){
  const frame=canonical[direction*COLUMNS],left=22+direction*spacing;
  annotations+=`<text x="${left}" y="260">${names[direction]}</text>`;
  for(const [label,point] of [['neck',frame.neck],['waist',frame.waist],['ground',frame.ground]])annotations+=`<circle class="anchor" cx="${left+point.x}" cy="${top+point.y}" r="2.5"/><text x="${left+point.x+6}" y="${top+point.y+4}" style="font-size:9px">${label}</text>`;
}
annotations+='</svg>';
await sharp({create:{width:proofWidth,height:proofHeight,channels:4,background:'#273b38'}}).composite([...composites,{input:Buffer.from(annotations),left:0,top:0}]).png().toFile(`${proofDir}/player-layers-neutral-proof.png`);
console.log(JSON.stringify({output:outputDir,proof:`${proofDir}/player-layers-neutral-proof.png`,base:`${proofDir}/base.png`,rawBody:`${proofDir}/base-body.png`,frames:36,materials:ids,reconstruction:'36/36 pixel-exact disjoint raw masks'}));
