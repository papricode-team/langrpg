#!/usr/bin/env node
/** Native-resolution rectangular export of separately painted static buildings. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expeditionArt } from './expedition-art-plan.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'web/public/assets');
const stories = ['lindenhafen', 'waldruh', 'nebelstadt'];
const buildingGroups = [
  ['archive', 'cafe', 'station', 'workshop'],
  ['house', 'greenhouse', 'house-1', 'house-2'],
  ['house-3', 'house-4', 'arch'],
];

// This painting's top and bottom rows have different horizontal registration.
// Each boundary lies in a verified transparent gutter; source pixels stay native.
const nativeCellOverrides = {
  'terracielo-day-1': [[0, 0, 660, 614], [660, 0, 1254, 614], [0, 614, 630, 1254], [630, 614, 1254, 1254]],
};

const largeBuildings = {
  lindenhafen: ['archive', 'cafe', 'station', 'workshop', 'house-1', 'house-2'],
  waldruh: ['cafe', 'station', 'workshop', 'house-1', 'greenhouse'],
  nebelstadt: ['archive', 'cafe', 'station', 'workshop', 'house', 'greenhouse'],
};
const smallBuildings = {
  lindenhafen: ['house', 'greenhouse', 'house-3', 'house-4', 'arch'],
  waldruh: ['archive', 'house', 'house-2', 'house-3', 'house-4', 'arch'],
  nebelstadt: ['house-1', 'house-2', 'house-3', 'house-4', 'arch'],
};
async function sourceCells(map, period) {
  const result = [];
  const standalone = largeBuildings[map] ?? [];
  const sources = standalone.map(name => ({file: `${map}-${period}-${name}`, names: [name], columns: 1, rows: 1, standalone: true}));
  if (stories.includes(map)) {
    if (map === 'lindenhafen' && period === 'day') {
      sources.push({file: `${map}-day-1`, names: ['house','greenhouse',null,null], columns: 2, rows: 2},
        {file: `${map}-day-2`, names: ['house-3','house-4','arch'], columns: 2, rows: 2});
    } else sources.push({file: `${map}-${period}-small`, names: smallBuildings[map], columns: 3, rows: 2});
  } else for (const [group,names] of buildingGroups.entries()) sources.push({file: `${map}-${period}-${group}`, names, columns: 2, rows: 2});
  for (const sheet of sources) {
    const source = `art/source/buildings/${sheet.file}.png`, path = resolve(root, source);
    const {data,info} = await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    if (!(await sharp(path).metadata()).hasAlpha) throw Error(`${source}: native alpha required`);
    // The generated grid spacing is approximate. Each column has its own row gaps.
    const divider = (length, fraction, count) => {
      const center=Math.round(length*fraction),radius=Math.floor(length*.09);
      let best=center,minimum=count(center);
      for(let p=center-radius;p<=center+radius;p++){
        const n=count(p);
        if(n<minimum||n===minimum&&Math.abs(p-center)<Math.abs(best-center)){best=p;minimum=n;}
      }
      if(minimum>6)throw Error(`${source}: artwork crosses a grid divider (${minimum} pixels)`);
      return best;
    };
    const cells = [], registered = nativeCellOverrides[sheet.file];
    if (registered) {
      if (info.width !== 1254 || info.height !== 1254) throw Error(`${source}: registered source dimensions changed`);
      for (const [index, cell] of registered.entries()) {
        const name = sheet.names[index];
        if (name) cells.push({name, cell});
      }
    } else {
      try {
      const countColumn=x=>{let count=0;for(let y=0;y<info.height;y++)if(data[(y*info.width+x)*4+3]>32)count++;return count;};
      const columns=[0];
      for(let col=1;col<sheet.columns;col++)columns.push(divider(info.width,col/sheet.columns,countColumn));
      columns.push(info.width);
      for(let col=0;col<sheet.columns;col++){
        const countRow=y=>{let count=0;for(let x=columns[col];x<columns[col+1];x++)if(data[(y*info.width+x)*4+3]>32)count++;return count;};
        const rows=[0];
        for(let row=1;row<sheet.rows;row++)rows.push(divider(info.height,row/sheet.rows,countRow));
        rows.push(info.height);
        for(let row=0;row<sheet.rows;row++){
          const name=sheet.names[row*sheet.columns+col];
          if(name)cells.push({name,cell:[columns[col],rows[row],columns[col+1],rows[row+1]]});
        }
      }
      } catch (error) {
        if (!error.message.includes('grid divider')) throw error;
        // Some sheets align rows precisely but give each row its own column gaps.
        // Try that registration before requiring explicit source-specific cells.
        cells.length=0;
        const countRow=y=>{let count=0;for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>32)count++;return count;};
        const rows=[0];
        for(let row=1;row<sheet.rows;row++)rows.push(divider(info.height,row/sheet.rows,countRow));
        rows.push(info.height);
        for(let row=0;row<sheet.rows;row++){
          const countColumn=x=>{let count=0;for(let y=rows[row];y<rows[row+1];y++)if(data[(y*info.width+x)*4+3]>32)count++;return count;};
          const columns=[0];
          for(let col=1;col<sheet.columns;col++)columns.push(divider(info.width,col/sheet.columns,countColumn));
          columns.push(info.width);
          for(let col=0;col<sheet.columns;col++){
            const name=sheet.names[row*sheet.columns+col];
            if(name)cells.push({name,cell:[columns[col],rows[row],columns[col+1],rows[row+1]]});
          }
        }
      }

    }
    for (const {name, cell} of cells) {
        const [cellLeft, cellTop, cellRight, cellBottom] = cell;
        let left=cellRight,top=cellBottom,right=-1,bottom=-1,clear=0,opaque=0;
        for(let y=cellTop;y<cellBottom;y++)for(let x=cellLeft;x<cellRight;x++){
          const alpha=data[(y*info.width+x)*4+3];if(alpha===0)clear++;
          if(alpha>24){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);opaque++;}
        }
        if(opaque<1000||clear<1000)throw Error(`${source}/${name}: isolated transparent building required`);
        if(left<=0||top<=0||right>=info.width-1||bottom>=info.height-1)throw Error(`${source}/${name}: clipped at source boundary ${JSON.stringify({left,top,right,bottom,cell})}`);
        const crop={left:Math.max(cellLeft,left-4),top:Math.max(cellTop,top-4),width:0,height:0};
        crop.width=Math.min(cellRight,right+5)-crop.left;crop.height=Math.min(cellBottom,bottom+5)-crop.top;
        const minimum=sheet.standalone?800:400;
        if(Math.max(crop.width,crop.height)<minimum)throw Error(`${source}/${name}: native resolution below ${minimum}px`);
        const pixels=await sharp(path).extract(crop).ensureAlpha().raw().toBuffer();
        // Only crop native pixels. Never upscale, warp, mask or remove backgrounds.
        result.push({name,source,crop,width:crop.width,height:crop.height,pixels,standalone:!!sheet.standalone,
          originX:.5,originY:(bottom-crop.top+1)/crop.height});
    }
  }
  return result;
}

async function exportBases(map, period) {
  const items = await sourceCells(map, period), story = stories.includes(map);
  const prefix = `${map}${story ? `-${period}` : ''}-building-bases`;
  const entries = {};
  let page = 0, parts = [], frames = {}, x = 4, y = 4, rowHeight = 0;
  async function save() {
    const key = `${prefix}${page ? `-${page}` : ''}`, height = y + rowHeight + 4, width = 2048;
    const pixels = Buffer.alloc(width * height * 4);
    for (const item of parts) for (let row = 0; row < item.height; row++) item.pixels.copy(pixels,
      ((item.y + row) * width + item.x) * 4, row * item.width * 4, (row + 1) * item.width * 4);
    await sharp(pixels, { raw: { width, height, channels: 4 } }).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(resolve(out, `${key}.webp`));
    await writeFile(resolve(out, `${key}.json`), JSON.stringify({ frames, meta: { image: `${key}.webp`, size: { w: width, h: height }, scale: '1',
      provenance: 'Built-in ImageGen static paintings; native rectangular crops, no upscaling' } }, null, 2) + '\n');
    page++; parts = []; frames = {}; x = 4; y = 4; rowHeight = 0;
  }
  for (const item of items) {
    if (item.standalone) {
      const key=`${map}-${period}-building-${item.name}`;
      await sharp(item.pixels,{raw:{width:item.width,height:item.height,channels:4}}).webp({quality:88,alphaQuality:100,effort:6}).toFile(resolve(out,`${key}.webp`));
      await writeFile(resolve(out,`${key}.json`),JSON.stringify({frames:{[item.name]:{frame:{x:0,y:0,w:item.width,h:item.height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:item.width,h:item.height},sourceSize:{w:item.width,h:item.height},source:{path:item.source,crop:item.crop,standalone:true}}},meta:{image:`${key}.webp`,size:{w:item.width,h:item.height},scale:'1',provenance:'Individual built-in ImageGen building painting; native crop'}},null,2)+'\n');
      entries[item.name]={key,frames:[item.name],fps:0,width:item.width,height:item.height,referenceWidth:item.width,originX:item.originX,originY:item.originY,base:{key,frame:item.name},overlays:[]};
      continue;
    }
    if (item.width + 8 > 2048 || item.height + 8 > 2048) throw Error(`${item.source}: texture budget exceeded`);
    if (x + item.width + 4 > 2048) { x = 4; y += rowHeight + 8; rowHeight = 0; }
    if (y + item.height + 4 > 2048) await save();
    const key = `${prefix}${page ? `-${page}` : ''}`;
    frames[item.name] = { frame: { x, y, w: item.width, h: item.height }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: item.width, h: item.height }, sourceSize: { w: item.width, h: item.height },
      source: { path: item.source, crop: item.crop } };
    parts.push({ ...item, x, y });
    entries[item.name] = { key, frames: [item.name], fps: 0, width: item.width, height: item.height, referenceWidth: item.width,
      originX: item.originX, originY: item.originY, base: { key, frame: item.name }, overlays: [] };
    x += item.width + 8; rowHeight = Math.max(rowHeight, item.height);
  }
  if (parts.length) await save();
  for (const target of story ? [period] : ['day', 'night']) {
    const path = resolve(out, `${map}-${target}-animations.json`), manifest = JSON.parse(await readFile(path, 'utf8'));
    Object.assign(manifest.assets, entries); manifest.version = 3;
    await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
    if (story) {
      const active = new Set(Object.values(manifest.assets).flatMap(asset =>
        [asset.base?.key ?? asset.key, ...(asset.overlays ?? []).map(overlay => overlay.key)]));
      for (const suffix of ['animation-0', 'animation-4', 'building-details']) {
        const key = `${map}-${target}-${suffix}`;
        if (active.has(key)) continue;
        for (const extension of ['json', 'webp']) await unlink(resolve(out, `${key}.${extension}`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    }
  }
  console.log(`${map}/${period}: ${items.length} static native-resolution buildings in ${page} page(s)`);
}

const args = process.argv.slice(2), setIndex = args.indexOf('--set'), set = setIndex < 0 ? undefined : args[setIndex + 1];
if (set && !['day', 'night'].includes(set)) throw Error('Set must be day or night');
const requested = args.filter((_, index) => setIndex < 0 || index !== setIndex && index !== setIndex + 1);
await mkdir(out, { recursive: true });
for (const map of requested.length ? requested : [...stories, ...expeditionArt.map(region => region.id)]) {
  if (!stories.includes(map) && !expeditionArt.some(region => region.id === map)) throw Error(`Unknown region ${map}`);
  for (const period of stories.includes(map) ? set ? [set] : ['day', 'night'] : ['day']) await exportBases(map, period);
}

execFileSync(process.execPath, ['scripts/prepare-scenery-previews.mjs', ...requested], {stdio:'inherit'});
