#!/usr/bin/env node
/** Export native transparent paintings; rectangular crops only, with no resampling. */
import sharp from 'sharp';
import {exportSceneryGeometry} from './scenery-geometry.mjs';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';

const root=resolve(import.meta.dirname,'..'), source=resolve(root,'art/source/map-quality'), out=resolve(root,'web/public/assets');
const towns=['lindenhafen','waldruh','nebelstadt'];
const args=process.argv.slice(2), selected=args.filter(arg=>towns.includes(arg));
const preserveHouseGeometry=args.includes('--preserve-house-geometry');
for(const arg of args)if(!towns.includes(arg)&&arg!=='--preserve-house-geometry')throw Error(`Unknown town: ${arg}`);
const exists=async path=>{try{await access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const sheets=[
  {file:'props.png',key:'story-quality-props',cells:[
    {name:'tree',rect:[0,0,715,704]},{name:'cypress',rect:[715,0,1254,704]},
    {name:'stall',rect:[0,704,715,1254]},{name:'fountain',rect:[715,704,1254,1254]},
  ],expected:[1254,1254]},
  {file:'misc.png',key:'story-quality-misc',expected:[1254,1254],cells:[
    {name:'lamp',rect:[220,0,430,661]},
    {name:'bench',rect:[600,100,1254,665]},
    // The cap overlaps the lamp's bounding box in Y, while their actual pixels
    // stay apart in X. Two native windows retain the complete sign in place.
    {name:'sign',rect:[90,640,610,1254],parts:[[90,640,230,670],[90,670,610,1254]]},
    {name:'planter',rect:[690,665,1254,1254]},
  ]},
  ...['inn','bakery','grocery'].map(name=>({file:`${name}.png`,key:`story-quality-${name}`,standalone:true,cells:[{name:`house-${name}`}]})),
  {file:'../waldruh-props.png',key:'story-quality-boat',standalone:false,cells:[{name:'boat',rect:[0,950,350,1254],minimum:200}],expected:[1254,1254]},
];
// Reuse native encoded bases without fetching historical source PNGs from LFS.
// Texture keys are global, and the renderer streams every referenced key.
const architectureAliases=new Map();
for(const [town,name]of [['lindenhafen','arch'],['waldruh','greenhouse']]){
  const manifest=JSON.parse(await readFile(resolve(out,`${town}-day-animations.json`),'utf8')),asset=manifest.assets[name];
  architectureAliases.set(name,asset);
}
await mkdir(out,{recursive:true});
const exported=new Map();
for(const sheet of sheets){
  const path=resolve(source,sheet.file);if(!await exists(path))continue;
  const metadata=await sharp(path).metadata();
  if(!metadata.hasAlpha)throw Error(`${sheet.file}: native transparent source required`);
  if(sheet.expected&&(metadata.width!==sheet.expected[0]||metadata.height!==sheet.expected[1]))throw Error(`${sheet.file}: crop registration requires ${sheet.expected.join(' × ')} native pixels`);
  const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let cells=sheet.cells;
  if(sheet.grid){
    const divider=(length,count)=>{
      const middle=Math.round(length/2),radius=Math.round(length*.14);let best=middle,minimum=count(middle);
      for(let p=middle-radius;p<=middle+radius;p++){const value=count(p);if(value<minimum||value===minimum&&Math.abs(p-middle)<Math.abs(best-middle)){minimum=value;best=p;}}
      if(minimum>4)throw Error(`${sheet.file}: no transparent cell gutter (${minimum} painted pixels)`);
      return best;
    };
    const cutX=divider(info.width,x=>{let count=0;for(let y=0;y<info.height;y++)if(data[(y*info.width+x)*4+3]>32)count++;return count;});
    cells=[];
    for(let col=0;col<2;col++){
      const left=col?cutX:0,right=col?info.width:cutX;
      const cutY=divider(info.height,y=>{let count=0;for(let x=left;x<right;x++)if(data[(y*info.width+x)*4+3]>32)count++;return count;});
      for(let row=0;row<2;row++)cells.push({name:sheet.grid[row*2+col],rect:[left,row?cutY:0,right,row?info.height:cutY]});
    }
  }
  let geometry=sheet.geometry??{};const sidecar=path.replace(/\.png$/,'.json');if(await exists(sidecar))geometry=JSON.parse(await readFile(sidecar,'utf8'));
  const items=[];
  for(const cell of cells){
    const [x0,y0,x1,y1]=cell.rect??[0,0,info.width,info.height];
    const included=(x,y)=>!cell.parts||cell.parts.some(([left,top,right,bottom])=>x>=left&&x<right&&y>=top&&y<bottom);
    let left=x1,top=y1,right=-1,bottom=-1,clear=0,solid=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const alpha=included(x,y)?data[(y*info.width+x)*4+3]:0;if(alpha===0)clear++;
      if(alpha>12){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);solid++;}
    }
    if(solid<1000||clear<1000)throw Error(`${sheet.file}/${cell.name}: isolated painting and transparent gutter required`);
    const crop=cell.preserveCrop?{left:x0,top:y0,width:x1-x0,height:y1-y0}:{left:Math.max(x0,left-3),top:Math.max(y0,top-3),width:Math.min(x1,right+4)-Math.max(x0,left-3),height:Math.min(y1,bottom+4)-Math.max(y0,top-3)};
    if(Math.max(crop.width,crop.height)<(cell.minimum??400))throw Error(`${sheet.file}/${cell.name}: insufficient native detail`);
    let buffer;
    if(cell.parts){
      const pixels=Buffer.alloc(crop.width*crop.height*4);
      for(let y=crop.top;y<crop.top+crop.height;y++)for(let x=crop.left;x<crop.left+crop.width;x++)if(included(x,y))data.copy(pixels,((y-crop.top)*crop.width+x-crop.left)*4,(y*info.width+x)*4,(y*info.width+x)*4+4);
      buffer=await sharp(pixels,{raw:{width:crop.width,height:crop.height,channels:4}}).png().toBuffer();
    }else buffer=await sharp(path).extract(crop).png().toBuffer();
    items.push({name:cell.name,buffer,crop,parts:cell.parts,width:crop.width,height:crop.height,geometry:geometry.assets?.[cell.name]??(geometry.assets?{}:geometry)});
  }
  let page=0,x=4,y=4,rowHeight=0,parts=[],frames={};
  const save=async()=>{
    if(!parts.length)return;
    const key=`${sheet.key}${page?`-${page}`:''}`,width=2048,height=2**Math.ceil(Math.log2(y+rowHeight+4));
    await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts.map(item=>({input:item.buffer,left:item.x,top:item.y}))).webp({quality:92,alphaQuality:100,effort:6}).toFile(resolve(out,`${key}.webp`));
    await writeFile(resolve(out,`${key}.json`),JSON.stringify({frames,meta:{image:`${key}.webp`,size:{w:width,h:height},scale:'1',provenance:'Built-in ImageGen painting; native rectangular crops; no upscaling'}},null,2)+'\n');
    page++;x=4;y=4;rowHeight=0;parts=[];frames={};
  };
  for(const item of items){
    if(item.width+8>2048||item.height+8>2048)throw Error(`${sheet.file}/${item.name}: native painting exceeds GPU atlas limit`);
    if(x+item.width+4>2048){x=4;y+=rowHeight+8;rowHeight=0;}
    if(y+item.height+4>2048)await save();
    const key=`${sheet.key}${page?`-${page}`:''}`;
    frames[item.name]={frame:{x,y,w:item.width,h:item.height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:item.width,h:item.height},sourceSize:{w:item.width,h:item.height},source:{path:relative(root,path),nativeSize:{width:info.width,height:info.height},crop:item.crop,...(item.parts?{windows:item.parts}:{}),standalone:!!sheet.standalone}};
    parts.push({...item,x,y});
    exported.set(item.name,{key,frames:[item.name],fps:0,width:item.width,height:item.height,referenceWidth:item.width,originX:.5,originY:1,base:{key,frame:item.name},overlays:[],...item.geometry});
    x+=item.width+8;rowHeight=Math.max(rowHeight,item.height);
    console.log(`${item.name}: ${item.width} × ${item.height} native source pixels`);
  }
  await save();
}
if(!exported.size)throw Error('No native map-quality sources found');
for(const [name,asset]of architectureAliases)exported.set(name,asset);
const replacement=name=>exported.get(name)??(/^(tree|cypress|stall|fountain|lamp|bench|sign|planter|boat|arch|greenhouse)(?:-\d+)?$/.test(name)?exported.get(name.split('-')[0]):undefined);
for(const town of selected.length?selected:towns)for(const period of ['day','night']){
  const path=resolve(out,`${town}-${period}-animations.json`),manifest=JSON.parse(await readFile(path,'utf8'));
  for(const name of new Set([...Object.keys(manifest.assets),...exported.keys()])){
    const asset=replacement(name);if(!asset)continue;
    const current=manifest.assets[name],ratio=asset.referenceWidth/(current?.referenceWidth??asset.referenceWidth);
    if(preserveHouseGeometry&&current&&/^house-(inn|bakery|grocery)$/.test(name))continue;
    const geometry={};
    for(const kind of ['footprint','sortLine'])if(current?.[kind])geometry[kind]=current[kind].map(([x,y])=>[x*ratio,y*ratio]);
    if(current?.door)geometry.door=Object.fromEntries(Object.entries(current.door).map(([key,value])=>[key,value*ratio]));
    // Keep reviewed geometry when a painting changes resolution; source sidecars
    // take precedence because their coordinates belong to the new native crop.
    manifest.assets[name]={...asset,...geometry,...Object.fromEntries(['footprint','sortLine','door'].filter(key=>asset[key]!==undefined).map(key=>[key,asset[key]])),...(period==='night'?{nightTint:0x8c9ac8}:{})};
  }
  await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
}
await exportSceneryGeometry(root);
