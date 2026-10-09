#!/usr/bin/env node
/** Offline visual QA of the exact shared-frame composition used by the game. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'web/public/assets/player-layers');
const output=resolve(process.argv[2]??'/private/tmp/player-layer-assembled-review');
await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));
const columns=manifest.columns,rows=manifest.rows;
assert.deepEqual([columns,rows],[9,4]);
// Run the actual pure TypeScript recipe with Node's native type stripping.
// Resolve its extensionless relative frontend import without copying its logic.
const hook=registerHooks({resolve(specifier,context,nextResolve){
  return nextResolve(context.parentURL?.includes('/web/src/')&&specifier.startsWith('.')&&!extname(specifier)?`${specifier}.ts`:specifier,context);
}});
let characterLayers,faceOptions,hairOptions,MODULAR_ART;
try {
  ({characterLayers}=await import('../web/src/modular-character.ts'));
  ({faceOptions,hairOptions,MODULAR_ART}=await import('../web/src/avatar-options.ts'));
} finally {hook.deregister();}
const W=MODULAR_ART.previewWidth??manifest.previewCell?.[0]??MODULAR_ART.width;
const H=MODULAR_ART.previewHeight??manifest.previewCell?.[1]??MODULAR_ART.height;
assert.deepEqual([W,H],[128,192]);
const palette={skin:'#d6a07d',hair:'#48372e',outfit:'#326a65',pants:'#44464d'};
const defaultAvatar={...palette,face:'oval',hairstyle:'waves',jacket:'travel',bottom:'straight',build:'regular'};
const directions=['Front','Right','Back','Left'],paths=[],atlasCache=new Map(),frameCache=new Map();
const ids=new Set(manifest.assets.map(asset=>asset.id));
async function atlas(id,runtime=false){
  const key=`${id}:${runtime?'runtime':'preview'}`;
  if(!atlasCache.has(key)) {
    assert.ok(ids.has(id),`Runtime recipe references missing material ${id}`);
    let path=`${directory}/${id}${runtime?'':'-preview'}.webp`;
    try {await access(path);} catch(error) {if(error.code!=='ENOENT')throw error;path=`${directory}/${id}.webp`;}
    const source=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const [cellWidth,cellHeight]=runtime?(manifest.runtimeCell??[MODULAR_ART.width,MODULAR_ART.height]):[W,H];
    assert.deepEqual([source.info.width,source.info.height],[cellWidth*columns,cellHeight*rows],`${id}: mismatched frame grid`);
    atlasCache.set(key,source);
  }
  return atlasCache.get(key);
}
async function framePixels(layer,runtime=false){
  assert.ok(layer.frame>=0&&layer.frame<columns*rows,`Invalid runtime frame ${layer.frame}`);
  const key=[layer.id,layer.frame,layer.tint,layer.width,runtime?'runtime':'preview'].join(':');
  if(!frameCache.has(key)) {
    const {data,info}=await atlas(layer.id,runtime),sourceWidth=info.width/columns,sourceHeight=info.height/rows,pixels=Buffer.alloc(W*H*4),left=layer.frame%columns*sourceWidth,top=Math.floor(layer.frame/columns)*sourceHeight;
    const tint=[layer.tint>>16&255,layer.tint>>8&255,layer.tint&255];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
      const sx=Math.floor(x*sourceWidth/W),sy=Math.floor(y*sourceHeight/H);
      const s=((sy+top)*info.width+sx+left)*4,p=(y*W+x)*4;
      for(let channel=0;channel<3;channel++)pixels[p+channel]=Math.round(data[s+channel]*tint[channel]/255);
      pixels[p+3]=data[s+3];
    }
    assert.ok(Number.isFinite(layer.width)&&layer.width>0,`${layer.id}: invalid layer width`);
    if(layer.width!==1) {
      const scaledWidth=Math.round(W*layer.width),resized=await sharp(pixels,{raw:{width:W,height:H,channels:4}}).resize(scaledWidth,H,{fit:'fill'}).raw().toBuffer();
      const transformed=Buffer.alloc(W*H*4),left=Math.round((W-scaledWidth)/2),fromX=Math.max(0,-left),toX=Math.min(scaledWidth,W-left);
      for(let y=0;y<H;y++)resized.copy(transformed,(y*W+left+fromX)*4,(y*scaledWidth+fromX)*4,(y*scaledWidth+toX)*4);
      frameCache.set(key,transformed);
    } else frameCache.set(key,pixels);
  }
  return frameCache.get(key);
}
async function compose(avatar,frame=0,filter,runtime=false){
  const canvas=Buffer.alloc(W*H*4);
  const layers=characterLayers(avatar,frame).filter(layer=>!filter||filter(layer));
  for(const layer of layers) {
    assert.equal(layer.frame,frame,`${layer.id}: independent animation phase`);
    assert.ok(!('x' in layer)&&!('y' in layer)&&!('rotation' in layer),`${layer.id}: unexpected independent transform`);
    const pixels=await framePixels(layer,runtime);
    for(let p=0;p<pixels.length;p+=4) {
      const alpha=pixels[p+3]/255,previous=canvas[p+3]/255,total=alpha+previous*(1-alpha);
      if(!total)continue;
      for(let channel=0;channel<3;channel++)canvas[p+channel]=Math.round((pixels[p+channel]*alpha+canvas[p+channel]*previous*(1-alpha))/total);
      canvas[p+3]=Math.round(total*255);
    }
  }
  return canvas;
}
const escape=text=>String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const label=(title,width,height,subtitle='')=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#eee7dd"/><text x="8" y="17" font-family="Arial" font-size="13" fill="#342e28">${escape(title)}</text>${subtitle?`<text x="8" y="33" font-family="Arial" font-size="11" fill="#64584e">${escape(subtitle)}</text>`:''}</svg>`);
async function sheet(name,title,entries,cols,scale=1,detail=false) {
  const imageWidth=detail?144:Math.round(W*scale),imageHeight=detail?156:Math.round(H*scale),cellWidth=imageWidth+14,cellHeight=imageHeight+42,width=cols*cellWidth,height=48+Math.ceil(entries.length/cols)*cellHeight;
  const overlays=[{input:label(title,width,48,'Runtime characterLayers; coincident 9×4 material sheets; source-over alpha'),left:0,top:0}];
  for(const [index,entry] of entries.entries()) {
    const left=index%cols*cellWidth,top=48+Math.floor(index/cols)*cellHeight;
    const pixels=await compose(entry.avatar,entry.frame,entry.filter,entry.runtime);
    let image=sharp(pixels,{raw:{width:W,height:H,channels:4}});
    image=detail?image.extract({left:40,top:15,width:48,height:52}).resize(imageWidth,imageHeight,{kernel:'nearest'}):image.resize(imageWidth,imageHeight,{fit:'fill'});
    overlays.push({input:label(entry.label,cellWidth,40,entry.subtitle),left,top},{input:await image.png().toBuffer(),left:left+7,top:top+40});
  }
  const path=`${output}/${name}.png`;
  await sharp({create:{width,height,channels:4,background:'#f8f1e7'}}).composite(overlays).png().toFile(path);
  paths.push(path);
}
const upright=avatar=>directions.map((direction,facing)=>({avatar,frame:facing*9,label:direction,subtitle:`${avatar.face} / ${avatar.hairstyle} / ${avatar.build}`}));
await sheet('standing','Default character: actual assembled idle',upright(defaultAvatar),4,2);
const approvedHair=hairOptions.map(([id])=>id);
for(const id of approvedHair.filter(id=>id!=='bald'))assert.ok(manifest.assets.some(asset=>asset.id===`hair-${id}`&&asset.source==='player-edits'),`Hair ${id} is not an edit of the shared master`);
for(let start=0;start<approvedHair.length;start+=4) {
  const entries=approvedHair.slice(start,start+4).flatMap(hairstyle=>upright({...defaultAvatar,hairstyle}));
  await sheet(`hair-${start/4+1}`,'Every approved hairstyle on the same painted body',entries,4,1.5);
  await sheet(`hair-collars-${start/4+1}`,'Hair, bare head and collar at three-times native size',entries,4,1,true);
}
for(let start=0;start<faceOptions.length;start+=4) {
  const entries=faceOptions.slice(start,start+4).flatMap(([face])=>upright({...defaultAvatar,face,hairstyle:'bald'}));
  await sheet(`faces-${start/4+1}`,'Every face, bare scalp and collar',entries,4,1.5);
  await sheet(`face-collars-${start/4+1}`,'Face detail and neckline at three-times native size',entries,4,1,true);
}
const walkers=[
  ['default',defaultAvatar],
  ['bald',{...defaultAvatar,hairstyle:'bald'}],
  ['waves-colours',{...defaultAvatar,skin:'#aa704c',hair:'#754581',outfit:'#854a5b',pants:'#44464d'}],
];
for(const [name,avatar] of walkers) {
  const entries=directions.flatMap((direction,facing)=>Array.from({length:9},(_,phase)=>({avatar,frame:facing*9+phase,label:`${direction} ${phase?'walk '+phase:'idle'}`,subtitle:avatar.hairstyle})));
  await sheet(`walk-${name}`,`${avatar.hairstyle}: idle and entire 8-frame walk`,entries,9,1.125);
}
const diagnostic={...defaultAvatar,skin:'#ff66cc',hair:'#e4e1d8',outfit:'#55dd99',pants:'#4466ff'};
await sheet('material-diagnostic','Tint boundaries: pink skin, mint jacket, blue trousers',directions.flatMap((direction,facing)=>[0,1,3,5,8].map(phase=>({avatar:diagnostic,frame:facing*9+phase,label:`${direction} ${phase?'walk '+phase:'idle'}`,subtitle:'Look for collar/hand/waist contamination'}))),5,1.5);
await sheet('skin-tones','Matched hair and head across skin tones', ['#f5d9c6','#d6a07d','#855338','#40271e'].flatMap(skin=>upright({...defaultAvatar,skin})),4,1.5);
await sheet('runtime-standing','64px runtime materials, enlarged without smoothing',walkers.flatMap(([,avatar])=>upright(avatar).map(entry=>({...entry,runtime:true}))),4,2);
await sheet('runtime-material-diagnostic','64px runtime tint boundaries after independent downsampling',directions.flatMap((direction,facing)=>[0,1,5].map(phase=>({avatar:diagnostic,frame:facing*9+phase,runtime:true,label:`${direction} ${phase?'walk '+phase:'idle'}`,subtitle:'Runtime source pixels enlarged 2×'}))),3,2);
const shapeVariants=[
  {...defaultAvatar,skin:'#855338',pants:'#354d70'},
  {...defaultAvatar,hairstyle:'bald',skin:'#855338',pants:'#354d70'},
];
await sheet('head-shape-standing','Matched original head: waves edit and bare skull',shapeVariants.flatMap(upright),4,2);
await sheet('head-shape-collars','Original neck and collar with matching waves paint',shapeVariants.flatMap(upright),4,1,true);
await sheet('head-shape-runtime','Same matching pieces from actual 64px runtime assets',shapeVariants.flatMap(avatar=>upright(avatar).map(entry=>({...entry,runtime:true}))),4,2);
await writeFile(`${output}/report.json`,JSON.stringify({version:manifest.version,composition:'Runtime characterLayers, multiplication tint, coincident source-over frames, per-layer width from the runtime recipe',assetGridChecks:atlasCache.size,framesPerAsset:36,faces:faceOptions.map(([id])=>id),hairstyles:approvedHair,outputPaths:paths},null,2)+'\n');
console.log(JSON.stringify({output,assetGridChecks:atlasCache.size,contactSheets:paths.length,hairstyles:approvedHair.length,faces:faceOptions.length}));
