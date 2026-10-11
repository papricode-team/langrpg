import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';

/** Native image-collection tile rectangles avoid duplicate editor-only rasters. */
export async function tiledSceneImages(scene, content, root) {
  const jsonCache = new Map(), sizeCache = new Map();
  const json = async asset => {
    if (!jsonCache.has(asset)) jsonCache.set(asset, readFile(resolve(root, 'web/public', asset.slice(1)), 'utf8').then(JSON.parse));
    return jsonCache.get(asset);
  };
  const size = async asset => {
    if (!sizeCache.has(asset)) sizeCache.set(asset, sharp(resolve(root, 'web/public', asset.slice(1))).metadata());
    const {width, height} = await sizeCache.get(asset);
    return {asset, imageWidth: width, imageHeight: height};
  };
  const result = {terrain: {}, scenery: {}};
  for (const plate of scene.terrain) result.terrain[plate.dayAsset] = {...await size(plate.dayAsset),
    ...(plate.dayCrop ? {frame: {x: plate.dayCrop.x, y: plate.dayCrop.y, w: plate.dayCrop.width, h: plate.dayCrop.height}} : {})};
  const manifest = await json(`/assets/${scene.id}-day-animations.json`);
  for (const item of scene.scenery) {
    const name = item.frame ?? item.asset, animation = manifest.assets[name], base = animation?.base;
    const image = base ? `/assets/${base.key}.webp` : animation ? `/assets/${animation.key}.webp` : item.variant ? content.variationAsset : content.sceneryAsset;
    const atlasPath = base ? `/assets/${base.key}.json` : animation ? `/assets/${animation.key}.json` : item.variant ? content.variationAtlas : content.sceneryAtlas;
    const frameName = base?.frame ?? animation?.frames[0] ?? name;
    const atlas = await json(atlasPath), frame = atlas.frames?.[frameName]?.frame;
    if (!frame) throw new Error(`${scene.id}: no Tiled image for ${item.id} (${frameName})`);
    result.scenery[item.id] = {...await size(image), frame,
      originX: base?.originX ?? animation?.originX ?? .5, originY: base?.originY ?? animation?.originY ?? 1,
      referenceWidth: base?.referenceWidth ?? animation?.referenceWidth ?? frame.w};
  }
  return result;
}
