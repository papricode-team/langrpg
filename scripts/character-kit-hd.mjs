/** Native-detail authoring pages. Enlarged references never qualify for publication. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildReferences} from './character-kit.mjs';
const ROOT=resolve(import.meta.dirname,'..'),HD='art/source/character-kit/hd';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,value)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(value,null,2)+'\n');};
const safe=id=>typeof id==='string'&&/^[a-z][a-z0-9-]*$/.test(id);
// Empty clearance accommodates hats and skirt volume without rescaling the paint.
const FRAME={width:640,height:896,padding:64};

export async function prepareHD(id,{root=ROOT}={}) {
  if(!safe(id))throw new Error('Invalid component id');
  const original=await json(resolve(root,'art/source/character-kit/catalogue.json'));
  const originalEntry=original.entries.find(e=>e.id===id);if(!originalEntry)throw new Error('Unknown component');
  const refs=buildReferences(original,originalEntry.build,originalEntry.poseSet);
  const registration=await json(resolve(root,refs.registration));
  const referencePath=originalEntry.locked;
  const frames=[],referenceCells=[],pages=[];
  for(const [index,frame] of registration.frames.entries()) {
    const cell=frame.transform.sourceCell;
    const scale=Math.min(512/cell.width,768/cell.height),width=Math.round(cell.width*scale),height=Math.round(cell.height*scale);
    const padX=Math.floor((512-width)/2),padY=Math.floor((768-height)/2);
    const buffer=await sharp(resolve(root,referencePath)).extract(cell).resize(width,height).extend({left:padX,right:512-width-padX,top:padY,bottom:768-height-padY,background:'#00000000'}).png().toBuffer();
    referenceCells.push(buffer);
    frames.push({...frame,transform:{scale:frame.transform.scale/scale,offset:{x:frame.transform.offset.x-(padX+FRAME.padding)*frame.transform.scale/scale,y:frame.transform.offset.y-(padY+FRAME.padding)*frame.transform.scale/scale},sourceCell:{left:(index%9)*FRAME.width,top:Math.floor(index/9)*FRAME.height,width:FRAME.width,height:FRAME.height}}});
  }
  const referenceDirectory=`${HD}/references/${id}`;
  await mkdir(resolve(root,referenceDirectory),{recursive:true});
  for(let page=0;page<9;page++) {
    const path=`${referenceDirectory}/page-${page}.png`;
    await sharp({create:{width:1024,height:1536,channels:4,background:'#00000000'}}).composite(referenceCells.slice(page*4,page*4+4).map((input,i)=>({input,left:i%2*512,top:Math.floor(i/2)*768}))).png().toFile(resolve(root,path));
    pages.push({path,frames:[0,1,2,3].map(n=>page*4+n),publishable:false,kind:'resized-pose-guide'});
  }
  const master=`${referenceDirectory}/master.png`;
  await sharp({create:{width:FRAME.width*9,height:FRAME.height*4,channels:4,background:'#00000000'}}).composite(referenceCells.map((input,i)=>({input,left:i%9*FRAME.width+FRAME.padding,top:Math.floor(i/9)*FRAME.height+FRAME.padding}))).png().toFile(resolve(root,master));
  const manifest={...registration,source:master,sourceSha256:hash(await readFile(resolve(root,master))),sourceSize:[FRAME.width*9,FRAME.height*4],frames};
  delete manifest.reference;
  manifest.reference={sources:[{path:referencePath,sha256:hash(await readFile(resolve(root,referencePath)))}],spec:refs.registration,specSha256:hash(await readFile(resolve(root,refs.registration))),registration:refs.registration,registrationSha256:hash(await readFile(resolve(root,refs.registration)))};
  const manifestPath=`${referenceDirectory}/registration.json`;
  await save(resolve(root,manifestPath),manifest);
  await save(resolve(root,referenceDirectory,'pages.json'),{id,kind:'resized-pose-guide',publishable:false,pages,source:referencePath,registration:manifestPath});
  return {master,registration:manifestPath,pages};
}

export async function assembleHD(id,selections,{root=ROOT}={}) {
  if(!safe(id)||!Array.isArray(selections)||selections.length!==9)throw new Error('Select exactly nine four-frame native pages');
  const inputs=[],sources=[];
  for(const [page,selection] of selections.entries()) {
    const bytes=await readFile(resolve(root,selection.path)),meta=await sharp(bytes).metadata();
    if(meta.width!==1024||meta.height!==1536)throw new Error(`Page ${page} needs native 1024×1536 pixels; no resizing allowed`);
    if(!selection.prompt||!selection.path.startsWith(`${HD}/candidates/`))throw new Error('Native page and prompt provenance required; reference guides cannot be assembled');
    const prompt=await readFile(resolve(root,selection.prompt));
    sources.push({path:selection.path,sha256:hash(bytes)},{path:selection.prompt,sha256:hash(prompt)});
    for(let tile=0;tile<4;tile++) {const frame=page*4+tile;inputs.push({input:await sharp(bytes).extract({left:tile%2*512,top:Math.floor(tile/2)*768,width:512,height:768}).png().toBuffer(),left:frame%9*FRAME.width+FRAME.padding,top:Math.floor(frame/9)*FRAME.height+FRAME.padding});}
  }
  const path=`${HD}/${id}-candidate.png`;
  await sharp({create:{width:FRAME.width*9,height:FRAME.height*4,channels:4,background:'#ffffff'}}).composite(inputs).png().toFile(resolve(root,path));
  const provenance={version:1,operation:'lossless page rearrangement; no resizing or per-part transforms',sources,outputSha256:hash(await readFile(resolve(root,path)))};
  await save(resolve(root,path+'.json'),provenance);
  return {path,preparedCandidate:path+'.json',authoring:{kind:'native-repaint',pages:selections}};
}

/** Registered rectangular crops save empty page area. They never move a body part. */
export async function assembleCroppedHD(id,selections,{root=ROOT}={}) {
  if(!safe(id)||!Array.isArray(selections)||!selections.length)throw new Error('Native crop selections required');
  const inputs=[],sources=[],seen=new Set();let base;
  for(const selection of selections){
    if(!selection.path.startsWith(`${HD}/candidates/`)||!selection.prompt||!selection.mapping)throw new Error('Native crop provenance required');
    const mapping=await json(resolve(root,selection.mapping));
    if(base&&base!==mapping.source)throw new Error('Crop pages must share one registered base');
    base=mapping.source;
    const bytes=await readFile(resolve(root,selection.path)),meta=await sharp(bytes).metadata();
    const [width,height]=mapping.size;
    if(meta.width<width||meta.height<height||Math.abs(meta.width/meta.height-width/height)>.001)throw new Error('Native crop page must not be enlarged or stretched');
    const registered=await sharp(bytes).resize(width,height,{fit:'fill'}).png().toBuffer();
    for(const crop of mapping.crops){
      if(!Number.isInteger(crop.frame)||crop.frame<0||crop.frame>=36||seen.has(crop.frame))throw new Error('Each registered frame must occur exactly once');
      seen.add(crop.frame);
      if(crop.page.width!==crop.source.width||crop.page.height!==crop.source.height)throw new Error('Crop dimensions must be lossless');
      inputs.push({input:await sharp(registered).extract(crop.page).png().toBuffer(),left:crop.source.left,top:crop.source.top});
    }
    for(const path of [selection.path,selection.prompt,selection.mapping])sources.push({path,sha256:hash(await readFile(resolve(root,path)))});
  }
  if(seen.size!==36)throw new Error('Native crops must cover all 36 frames');
  const baseBytes=await readFile(resolve(root,base));sources.push({path:base,sha256:hash(baseBytes)});
  const path=`${HD}/${id}-candidate.png`;
  await sharp(baseBytes).flatten({background:'#ffffff'}).composite(inputs).png().toFile(resolve(root,path));
  await save(resolve(root,path+'.json'),{version:1,operation:'registered rectangular crops; only whole-page downsampling, never enlargement or part transforms',sources,outputSha256:hash(await readFile(resolve(root,path)))});
  return {path,preparedCandidate:path+'.json',authoring:{kind:'native-repaint',pages:selections}};
}

export async function main(args=process.argv.slice(2)) {
  const [command,id,file]=args;
  if(command==='prepare')console.log(JSON.stringify(await prepareHD(id)));
  else if(command==='assemble')console.log(JSON.stringify(await assembleHD(id,await json(resolve(ROOT,file)))));
  else if(command==='assemble-crops')console.log(JSON.stringify(await assembleCroppedHD(id,await json(resolve(ROOT,file)))));
  else throw new Error('Usage: character-kit-hd.mjs prepare <id> | assemble <id> <page-selections.json>');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
