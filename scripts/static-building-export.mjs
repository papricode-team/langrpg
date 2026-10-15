import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {WEBP_QUALITY} from './webp-quality.mjs';

/** Texture density is independent of the original collision coordinate system. */
export async function exportStaticBuilding(out, key, item) {
  const scale = item.exportScale ?? 1;
  if (!Number.isInteger(scale) || scale < 1 || scale > 4) throw Error(`Invalid building export scale: ${scale}`);
  const width = item.width * scale, height = item.height * scale;
  let painting = sharp(item.pixels, {raw:{width:item.width,height:item.height,channels:4}});
  if (scale !== 1) painting = painting.resize(width, height, {kernel:'lanczos3'});
  await painting.webp({quality: WEBP_QUALITY,alphaQuality:100,effort:6}).toFile(resolve(out, `${key}.webp`));
  await writeFile(resolve(out, `${key}.json`), JSON.stringify({frames:{[item.name]:{
    frame:{x:0,y:0,w:width,h:height},rotated:false,trimmed:false,
    spriteSourceSize:{x:0,y:0,w:width,h:height},sourceSize:{w:width,h:height},
    source:{path:item.source,crop:item.crop,standalone:true,...(scale !== 1 ? {exportScale:scale} : {})},
  }},meta:{image:`${key}.webp`,size:{w:width,h:height},scale:'1',
    provenance:scale === 1 ? 'Individual built-in ImageGen building painting; native crop'
      : `Original building painting; ${scale}x Lanczos resampling, unchanged design (no generated detail)`,
  }}, null, 2) + '\n');
  return {key,frames:[item.name],fps:0,width,height,referenceWidth:item.width,
    originX:item.originX,originY:item.originY,
    base:{key,frame:item.name,...(scale !== 1 ? {referenceWidth:width} : {})},
    overlays:[],...item.geometry};
}
