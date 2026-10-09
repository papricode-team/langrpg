#!/usr/bin/env node
/**
 * Heads and hair painted ON the registration master, never on a donor figure.
 *
 *   node scripts/prepare-player-head-edits.mjs kit   # base sheet + edit masks
 *   node scripts/prepare-player-head-edits.mjs       # extract head + hair layers
 *
 * `kit` writes art/source/player-edits/{base,mask-short,mask-long}.png. A
 * hairstyle is an inpaint of base.png inside one mask, saved as
 * art/source/player-edits/hair-<id>.png at the same 1536x1024 size. Because
 * every edit keeps the master's pixels outside the mask, the extracted hair
 * shares the body's exact poses and the shared per-frame transform from
 * prepare-player-layers.mjs. No warping, no donor registration.
 */
import sharp from 'sharp';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const editDir = resolve(root, 'art/source/player-edits');
const registrationDir = resolve(root, 'web/public/assets/player-layers');
const layerDir = resolve(process.env.PLAYER_HEAD_EDIT_OUTPUT_DIR ?? registrationDir);
const masterPath = resolve(root, 'art/source/player-customizations/motion.png');
const WIDTH = 128, HEIGHT = 192, COLUMNS = 9, ROWS = 4;
const SKIN_REFERENCE = 180; // Same luminance reference as hands-skin, so one tint matches.
// Mask reach below the neck, in head widths: short styles stop at the jaw,
// long styles may fall over the shoulders and down the back.
const REACH = { short: 0.7, long: 2.4 };
export const DRIFT_LIMITS = { visibleAlpha: 16, noiseDelta: 12, meanRGBA: 4, changedFraction: 0.025, largeDelta: 96, largeFraction: 0.002, minimumLargePixels: 8 };

const load = async path => sharp(await readFile(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
export function assertDimensions(image, expected, name = 'Image') {
  if(image.info.width!==expected.width || image.info.height!==expected.height)
    throw new Error(`${name}: expected ${expected.width}×${expected.height}, received ${image.info.width}×${image.info.height}; the registration grid cannot be resized.`);
}
function validateManifest(manifest, master) {
  if(manifest.cell?.[0]!==WIDTH || manifest.cell?.[1]!==HEIGHT || manifest.columns!==COLUMNS || manifest.rows!==ROWS || manifest.frames?.length!==COLUMNS*ROWS)
    throw new Error('Expected the shared 9×4 registration manifest with 128×192 cells.');
  for(const [index,frame] of manifest.frames.entries()) {
    const {scale,offset,sourceCell:cell}=frame.transform??{};
    if(!cell || ![cell.left,cell.top,cell.width,cell.height].every(Number.isInteger) || cell.left<0 || cell.top<0 || cell.width<=0 || cell.height<=0 || cell.left+cell.width>master.info.width || cell.top+cell.height>master.info.height || !(scale>0) || !Number.isFinite(offset?.x) || !Number.isFinite(offset?.y))
      throw new Error(`Frame ${index}: invalid native registration cell.`);
    if(frame.direction!==Math.floor(index/COLUMNS) || frame.column!==index%COLUMNS)
      throw new Error(`Frame ${index}: direction/column does not match the registration grid.`);
  }
}

/** Canonical head box for a frame, padded for hair volume. */
function headBox(frame, reach) {
  const { left, right, top } = frame.headBounds, width = right - left;
  return { left: left - width * 1.15, right: right + width * 1.15, top: top - width * 0.75, bottom: frame.neck.y + width * reach };
}
const toNative = (frame, x, y) => {
  const { scale, offset, sourceCell } = frame.transform;
  return { x: sourceCell.left + (x - offset.x) / scale, y: sourceCell.top + (y - offset.y) / scale };
};

/** The exact editable ellipse, clipped to its own native grid cell. */
export function editableGeometry(frame, reach = REACH.long) {
  const box=headBox(frame,reach),a=toNative(frame,box.left,box.top),b=toNative(frame,box.right,box.bottom),cell=frame.transform.sourceCell;
  return {
    left:Math.max(cell.left,Math.floor(a.x)),right:Math.min(cell.left+cell.width,Math.ceil(b.x)),
    top:Math.max(cell.top,Math.floor(a.y)),bottom:Math.min(cell.top+cell.height,Math.ceil(b.y)),
    cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,rx:(b.x-a.x)/2,ry:(b.y-a.y)/2,
  };
}
export const isEditable = (geometry,x,y) => x>=geometry.left && x<geometry.right && y>=geometry.top && y<geometry.bottom && ((x-geometry.cx)/geometry.rx)**2+((y-geometry.cy)/geometry.ry)**2<=1.15;

async function writeKit(master,manifest) {
  await mkdir(editDir, { recursive: true });
  await copyFile(masterPath, resolve(editDir, 'base.png'));
  for (const [name, reach] of Object.entries(REACH)) {
    // Image-edit APIs paint where the mask is transparent; the -bw copy is
    // white-where-editable for tools that expect a greyscale mask.
    const editable = new Uint8Array(master.info.width * master.info.height);
    for (const frame of manifest.frames) {
      const geometry=editableGeometry(frame,reach);
      for(let y=geometry.top;y<geometry.bottom;y++)for(let x=geometry.left;x<geometry.right;x++)
        if(isEditable(geometry,x,y))editable[y*master.info.width+x]=1;
    }
    const alpha = Buffer.alloc(master.data.length), bw = Buffer.alloc(editable.length);
    for (let i = 0; i < editable.length; i++) {
      bw[i] = editable[i] ? 255 : 0;
      if (!editable[i]) alpha[i * 4 + 3] = 255;
    }
    const raw = { raw: { width: master.info.width, height: master.info.height, channels: 4 } };
    await sharp(alpha, raw).png().toFile(resolve(editDir, `mask-${name}.png`));
    await sharp(bw, { raw: { ...raw.raw, channels: 1 } }).png().toFile(resolve(editDir, `mask-${name}-bw.png`));
  }
  console.log(`Edit kit written to ${editDir}: base.png, mask-short.png, mask-long.png (+ -bw variants).`);
}

/** Resample a native cell into the canonical 128x192 frame with the body's transform. */
export function canonical(image, frame) {
  const { data, info } = image, { scale, offset, sourceCell } = frame.transform, out = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const sx = (x - offset.x) / scale, sy = (y - offset.y) / scale, x0 = Math.floor(sx), y0 = Math.floor(sy);
    let alpha = 0; const rgb = [0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const nx = x0 + dx, ny = y0 + dy;
      if (nx < 0 || ny < 0 || nx >= sourceCell.width || ny >= sourceCell.height) continue;
      const p = ((sourceCell.top + ny) * info.width + sourceCell.left + nx) * 4;
      const weight = (dx ? sx - x0 : 1 - sx + x0) * (dy ? sy - y0 : 1 - sy + y0), contribution = data[p + 3] * weight;
      alpha += contribution;
      for (let c = 0; c < 3; c++) rgb[c] += data[p + c] * contribution;
    }
    const p = (y * WIDTH + x) * 4, a = Math.round(alpha);
    if (!a) continue;
    for (let c = 0; c < 3; c++) out[p + c] = Math.round(rgb[c] / alpha);
    out[p + 3] = a;
  }
  return out;
}

function hue(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
  const h = chroma ? ((max === r ? (g - b) / chroma : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma) * 60 + 360) % 360 : 0;
  return { h, chroma, saturation: chroma / Math.max(1, max) };
}
const isSkin = (r, g, b) => { const { h, chroma } = hue(r, g, b); return h >= 3 && h < 42 && chroma > 8 && r > g * 1.10 && r > b * 1.25; };
const isCoat = (r, g, b) => { const { h, chroma, saturation } = hue(r, g, b); return h >= 110 && h <= 235 && chroma > 8 && saturation > 0.18; };
const isViolet = (r, g, b) => { const { h, chroma, saturation } = hue(r, g, b); return h >= 245 && h <= 325 && chroma > 12 && saturation > 0.20 && b > g*1.15; };
const luminance = (data, p) => data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;

/** Bald master head: everything above the body's neck cut. */
function baseHead(frame, data) {
  const skin = Buffer.alloc(data.length), detail = Buffer.alloc(data.length), cut = Math.floor(frame.neck.y);
  for (let y = 0; y < cut; y++) for (let x = 0; x < WIDTH; x++) {
    const p = (y * WIDTH + x) * 4;
    if (!data[p + 3]) continue;
    const target = isSkin(data[p], data[p + 1], data[p + 2]) ? skin : detail;
    data.copy(target, p, p, p + 4);
  }
  for (let p = 0; p < skin.length; p += 4) if (skin[p + 3]) {
    const gray = Math.min(255, Math.round(luminance(skin, p) * 255 / SKIN_REFERENCE));
    skin[p] = skin[p + 1] = skin[p + 2] = gray;
  }
  return { skin, detail };
}

const nearScalp=(frame,x,y)=>{
  const width=frame.headBounds.right-frame.headBounds.left;
  return x>=frame.headBounds.left-width*.5 && x<=frame.headBounds.right+width*.5 && y>=frame.headBounds.top-width*.6 && y<=frame.headBounds.top+width*.45;
};
/** Keyed violet hair and its attached neutral shading; changed face details are excluded. */
export function hairLayer(frame, edit, base) {
  const box = headBox(frame, REACH.long), geometry=editableGeometry(frame), hair = Buffer.alloc(edit.length), keep = new Uint8Array(WIDTH * HEIGHT), violet=new Uint8Array(WIDTH*HEIGHT);
  for (let y = Math.max(0, Math.floor(box.top)); y < Math.min(HEIGHT, Math.ceil(box.bottom)); y++)
    for (let x = Math.max(0, Math.floor(box.left)); x < Math.min(WIDTH, Math.ceil(box.right)); x++) {
      const p = (y * WIDTH + x) * 4, [r, g, b, a] = edit.subarray(p, p + 4);
      if (a < 64) continue;
      const native=toNative(frame,x,y);if(!isEditable(geometry,native.x,native.y))continue;
      const changed=visibleDelta(base,edit,p)>DRIFT_LIMITS.noiseDelta,neutral=hue(r,g,b).saturation<0.28 && Math.max(r,g,b)<230;
      const index=y*WIDTH+x;
      if(isViolet(r,g,b)){keep[index]=1;violet[index]=1;}
      else if(changed && neutral && !isSkin(r,g,b) && !isCoat(r,g,b))keep[index]=1;
    }
  // Drop specks: components under 6 px are repaint noise, not hair.
  const seen = new Uint8Array(keep.length);
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i] || seen[i]) continue;
    const component = [], stack = [i]; seen[i] = 1;let keyed=0,scalp=0;
    while (stack.length) {
      const j = stack.pop(), x = j % WIDTH, y = (j - x) / WIDTH; component.push(j);
      keyed+=violet[j];if(nearScalp(frame,x,y))scalp++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const nx = x + dx, ny = y + dy, n = ny * WIDTH + nx;
        if (nx >= 0 && ny >= 0 && nx < WIDTH && ny < HEIGHT && keep[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    if (component.length >= 6 && keyed>=2 && scalp>=2) for (const j of component) edit.copy(hair, j * 4, j * 4, j * 4 + 4);
  }
  return hair;
}

export function visibleDelta(base,edit,p) {
  return Math.max(Math.abs(base[p+3]-edit[p+3]),...Array.from({length:3},(_,c)=>Math.abs(base[p+c]*base[p+3]/255-edit[p+c]*edit[p+3]/255)));
}
/** Native visible RGBA drift outside the SAME clipped ellipse used by the edit kit. */
export function drift(frame, edit, base, reach = REACH.long) {
  assertDimensions(edit,base.info,'Edited sheet');
  const geometry=editableGeometry(frame,reach),cell=frame.transform.sourceCell;
  let rgb=0,alpha=0,count=0,changed=0,large=0,maxDelta=0;
  for(let y=cell.top;y<cell.top+cell.height;y++)for(let x=cell.left;x<cell.left+cell.width;x++){
    if(isEditable(geometry,x,y))continue;
    const p=(y*base.info.width+x)*4,a=base.data[p+3],b=edit.data[p+3];
    if(Math.max(a,b)<=DRIFT_LIMITS.visibleAlpha)continue;
    const delta=visibleDelta(base.data,edit.data,p);
    for(let c=0;c<3;c++)rgb+=Math.abs(base.data[p+c]*a/255-edit.data[p+c]*b/255);
    alpha+=Math.abs(a-b);count++;maxDelta=Math.max(maxDelta,delta);
    if(delta>DRIFT_LIMITS.noiseDelta)changed++;
    if(delta>DRIFT_LIMITS.largeDelta)large++;
  }
  return {visiblePixels:count,meanPremultipliedRGB:count?rgb/(count*3):0,meanAlpha:count?alpha/count:0,meanRGBA:count?(rgb+alpha)/(count*4):0,changedPixels:changed,changedFraction:count?changed/count:0,largeChangedPixels:large,maxDelta};
}
export function driftErrors(report) {
  const errors=[];
  if(report.meanRGBA>DRIFT_LIMITS.meanRGBA)errors.push(`mean visible RGBA drift ${report.meanRGBA.toFixed(2)} exceeds ${DRIFT_LIMITS.meanRGBA}`);
  if(report.changedFraction>DRIFT_LIMITS.changedFraction)errors.push(`${(report.changedFraction*100).toFixed(2)}% of protected visible pixels changed by more than ${DRIFT_LIMITS.noiseDelta}`);
  if(report.largeChangedPixels>=Math.max(DRIFT_LIMITS.minimumLargePixels,report.visiblePixels*DRIFT_LIMITS.largeFraction))errors.push(`${report.largeChangedPixels} protected pixels changed by more than ${DRIFT_LIMITS.largeDelta}`);
  return errors;
}
export function hairReport(frame,data) {
  let pixels=0,scalpPixels=0,alphaMass=0,scalpEdgePixels=0;
  for(let p=0;p<data.length;p+=4)if(data[p+3]>=64){pixels++;alphaMass+=data[p+3]/255;const x=p/4%WIDTH,y=Math.floor(p/4/WIDTH);if(nearScalp(frame,x,y))scalpPixels++;}
  for(let p=0;p<data.length;p+=4)if(data[p+3]>=64){const x=p/4%WIDTH,y=Math.floor(p/4/WIDTH);if(!nearScalp(frame,x,y))continue;const native=toNative(frame,x,y),cell=frame.transform.sourceCell;if(native.x-cell.left<2 || cell.left+cell.width-native.x<2 || native.y-cell.top<2 || cell.top+cell.height-native.y<2)scalpEdgePixels++;}
  return {pixels,scalpPixels,alphaMass,scalpEdgePixels,valid:pixels>=6&&scalpPixels>=2&&alphaMass>=4};
}

function atlas(frames) {
  const data = Buffer.alloc(WIDTH * COLUMNS * HEIGHT * ROWS * 4);
  frames.forEach((frame, index) => {
    const column = index % COLUMNS, row = Math.floor(index / COLUMNS);
    for (let y = 0; y < HEIGHT; y++) frame.copy(data, ((row * HEIGHT + y) * WIDTH * COLUMNS + column * WIDTH) * 4, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  });
  return data;
}

/** Join equally tinted, disjoint source masks before any interpolation.
 * Resizing each mask independently and drawing source-over loses coverage at
 * their shared boundary: two half-covered pixels compose to only 3/4 opacity.
 */
export function combineDisjointSkin(head,hands) {
  if(head.length!==hands.length || head.length%4)throw new Error('Skin source masks must have identical RGBA dimensions.');
  const combined=Buffer.from(head);
  for(let p=0;p<hands.length;p+=4)if(hands[p+3]){
    if(head[p+3])throw new Error(`Skin source masks overlap at pixel ${p/4}; check shared neck registration.`);
    hands.copy(combined,p,p,p+4);
  }
  return combined;
}
/** One identified old boot fragment was mislabelled as skin. Its detached
 * source component is the only permitted rebuild exception; fail on any new
 * lower component instead of silently broadening an anatomical cleanup rule.
 */
export function cleanDetachedSkin(frame,data,frameIndex) {
  if(data.length!==WIDTH*HEIGHT*4)throw new Error('Skin cleanup requires one canonical 128×192 RGBA cell.');
  const seen=new Uint8Array(WIDTH*HEIGHT),candidates=[];
  for(let index=0;index<seen.length;index++){
    if(seen[index]||!data[index*4+3])continue;
    const points=[],pending=[index];seen[index]=1;
    while(pending.length){const p=pending.pop(),x=p%WIDTH,y=Math.floor(p/WIDTH);points.push(p);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,n=ny*WIDTH+nx;if(nx<0||nx>=WIDTH||ny<0||ny>=HEIGHT||seen[n]||!data[n*4+3])continue;seen[n]=1;pending.push(n);}
    }
    const bounds={left:Math.min(...points.map(p=>p%WIDTH)),top:Math.min(...points.map(p=>Math.floor(p/WIDTH))),right:Math.max(...points.map(p=>p%WIDTH)),bottom:Math.max(...points.map(p=>Math.floor(p/WIDTH)))};
    if(bounds.top<=frame.waist.y+30)continue;
    const highAlphaPixels=points.filter(p=>data[p*4+3]>=96).length;
    if(frameIndex!==31||points.length>96||points.length!==65||highAlphaPixels!==41||bounds.left!==107||bounds.top!==133||bounds.right!==118||bounds.bottom!==140)throw new Error(`Unexpected detached lower skin component in frame ${frameIndex}: ${points.length} pixels at ${JSON.stringify(bounds)}; export requires review.`);
    candidates.push({points,bounds,highAlphaPixels});
  }
  if(candidates.length>1)throw new Error('Multiple detached skin components require review.');
  const cleaned=Buffer.from(data),candidate=candidates[0];
  if(!candidate)return {data:cleaned,removed:null};
  for(const p of candidate.points)cleaned.fill(0,p*4,p*4+4);
  return {data:cleaned,removed:{frame:frameIndex,reason:'Known detached old boot pixels incorrectly labelled as skin',positiveAlphaPixels:candidate.points.length,highAlphaPixels:candidate.highAlphaPixels,bounds:candidate.bounds,whollyBelowWaistPlus30:true,otherSkinRGBAUnchanged:true}};
}
async function bodySkinFrames() {
  // The body exporter first writes the complete source-size atlas; its finalizer
  // preserves that atlas as -preview before writing the half-size runtime copy.
  let image=await load(resolve(registrationDir,'hands-skin.webp'));
  if(image.info.width!==WIDTH*COLUMNS || image.info.height!==HEIGHT*ROWS)image=await load(resolve(registrationDir,'hands-skin-preview.webp'));
  assertDimensions(image,{width:WIDTH*COLUMNS,height:HEIGHT*ROWS},'Body skin source atlas');
  return Array.from({length:COLUMNS*ROWS},(_,index)=>{
    const data=Buffer.alloc(WIDTH*HEIGHT*4),left=index%COLUMNS*WIDTH,top=Math.floor(index/COLUMNS)*HEIGHT;
    for(let y=0;y<HEIGHT;y++)image.data.copy(data,y*WIDTH*4,((top+y)*image.info.width+left)*4,((top+y)*image.info.width+left+WIDTH)*4);
    return data;
  });
}
async function emit(id, frames) {
  const raw = { raw: { width: WIDTH * COLUMNS, height: HEIGHT * ROWS, channels: 4 } }, data = atlas(frames);
  await sharp(data, raw).webp({ lossless: true }).toFile(resolve(layerDir, `${id}-preview.webp`));
  await sharp(data, raw).resize(COLUMNS * 64, ROWS * 96, { fit: 'fill' }).webp({ lossless: true }).toFile(resolve(layerDir, `${id}.webp`));
  return { id, file: `${id}.webp`, kind: id.split('-')[0], source: 'player-edits', columns: COLUMNS, rows: ROWS, frames: COLUMNS * ROWS, materials: 1 };
}

async function main() {
  const args=process.argv.slice(2),value=flag=>{const index=args.indexOf(flag);if(index<0)return undefined;if(!args[index+1]||args[index+1].startsWith('--'))throw new Error(`${flag} requires a value.`);return args[index+1];};
  const check=args.includes('--check'),input=value('--input'),requestedId=value('--id'),reachName=value('--reach')??'long';
  if(!(reachName in REACH))throw new Error('--reach must be short or long.');
  const manifest=JSON.parse(await readFile(resolve(registrationDir,'manifest.json'),'utf8')),master=await load(masterPath);
  assertDimensions(master,{width:1536,height:1024},'Registration master');validateManifest(manifest,master);
  if(args.includes('kit')){await writeKit(master,manifest);return;}
  const files=input?[resolve(input)]:(await readdir(editDir).catch(()=>[])).filter(name=>/^hair-[a-z]+\.png$/.test(name)).sort().map(name=>resolve(editDir,name));
  const baseFrames=manifest.frames.map(frame=>canonical(master,frame)),heads=manifest.frames.map((frame,index)=>baseHead(frame,baseFrames[index]));
  const hands=await bodySkinFrames(),skinCleanup=heads.map((head,index)=>cleanDetachedSkin(manifest.frames[index],combineDisjointSkin(head.skin,hands[index]),index)),skin=skinCleanup.map(item=>item.data);
  const prepared=[],report={validated:true,checkOnly:check,output:layerDir,thresholds:DRIFT_LIMITS,skin:{asset:'body-skin',sourceMasks:['head-skin','hands-skin'],frames:skin.length,mergedBeforeResize:true,rebuildExceptions:skinCleanup.flatMap(item=>item.removed?[item.removed]:[])},hair:{}};
  for(const path of files) {
    const id=requestedId??basename(path).match(/^hair-[a-z]+/)?.[0];
    if(!id || !/^hair-[a-z]+$/.test(id))throw new Error(`Invalid hair asset id for ${path}; use --id hair-<style>.`);
    const image=await load(path),entry={source:path,frames:[],errors:[]};report.hair[id]=entry;
    try{assertDimensions(image,master.info,path);}catch(error){entry.errors.push(error.message);report.validated=false;continue;}
    const editFrames=manifest.frames.map(frame=>canonical(image,frame)),hair=manifest.frames.map((frame,index)=>hairLayer(frame,editFrames[index],baseFrames[index]));
    for(const [index,frame] of manifest.frames.entries()){
      const bodyDrift=drift(frame,image,master,REACH[reachName]),paint=hairReport(frame,hair[index]),errors=driftErrors(bodyDrift);
      if(!paint.valid)errors.push(`Hair must be nonempty and attached near the scalp (pixels=${paint.pixels}, scalp=${paint.scalpPixels}).`);
      entry.frames.push({frame:index,direction:frame.direction,column:frame.column,drift:bodyDrift,hair:paint,errors});
      if(errors.length)report.validated=false;
    }
    prepared.push({id,hair});
  }
  // Validate EVERY input and EVERY frame before emitting even the bald master.
  // A rejected candidate therefore cannot partially replace the live assets.
  console.log(JSON.stringify(report,null,2));
  if(!report.validated)throw new Error('Head edit validation failed; no assets emitted.');
  if(check)return;
  await mkdir(layerDir,{recursive:true});
  const emitted=[await emit('head-skin',heads.map(head=>head.skin)),await emit('head-detail',heads.map(head=>head.detail)),await emit('body-skin',skin)];
  emitted.find(asset=>asset.id==='body-skin').cleanup=report.skin.rebuildExceptions;
  for(const {id,hair} of prepared){
    const levels=hair.flatMap(frame=>{const out=[];for(let p=0;p<frame.length;p+=4)if(frame[p+3]>128)out.push(luminance(frame,p));return out;}).sort((a,b)=>a-b);
    const reference=Math.max(40,levels[Math.floor(levels.length*.85)]??128);
    for(const frame of hair)for(let p=0;p<frame.length;p+=4)if(frame[p+3]){const gray=Math.min(255,Math.round(luminance(frame,p)*255/reference));frame[p]=frame[p+1]=frame[p+2]=gray;}
    emitted.push(await emit(id,hair));
  }
  const ids=new Set(emitted.map(asset=>asset.id));manifest.assets=[...manifest.assets.filter(asset=>!ids.has(asset.id)),...emitted];
  manifest.runtimeMemoryBytes=manifest.assets.filter(asset=>!['hands-skin','head-skin'].includes(asset.id)).length*COLUMNS*64*ROWS*96*4;
  manifest.skinCleanup={rebuildExceptions:report.skin.rebuildExceptions};
  await writeFile(resolve(layerDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
