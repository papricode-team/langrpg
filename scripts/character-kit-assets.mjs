/** Validated derivatives and the shared browser/server component catalogue. */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { canonical } from './character-kit-pixels.mjs';
import { characterSheetPages } from '../web/src/character-sheets.mjs';
import { CHARACTER_RESOLUTION, characterResolutionErrors } from '../web/src/character-resolution.mjs';

export const ASSET_ROOT = 'web/public/assets/character-kit';
export const FORMAT = { columns: 9, rows: 4, frames: 36, runtimeCell: [64, 96], editorCell: [128, 192], luminanceReference: 180 };
const sha = value => createHash('sha256').update(value).digest('hex');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const saveJSON = async (path, data) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(data, null, 2) + '\n'); };
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const fingerprint = value => sha(JSON.stringify(stable(value)));
const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);

export function catalogueFormat(source) {
  if (!source.highResolution) return FORMAT;
  return {...FORMAT, runtimeCell:CHARACTER_RESOLUTION.runtimeCell, editorCell:CHARACTER_RESOLUTION.editorCell};
}
function assetRoot(source) {
  if (source.assetDirectory !== undefined && !slug(source.assetDirectory)) throw new Error('Invalid character asset directory');
  return `web/public/assets/${source.assetDirectory ?? 'character-kit'}`;
}
export function requireNativeDetail(entry, manifest) {
  if (entry.authoring?.kind !== 'native-repaint' || !entry.authoring.pages?.length) throw new Error(`${entry.id}: high-resolution publication requires reviewed native repaint pages`);
  if (manifest.frames.some(frame => frame.transform.scale * 4 > 1.001)) throw new Error(`${entry.id}: native source would be enlarged at editor resolution`);
  if(!entry.preparedCandidate||entry.authoring.pages.some(page=>!page.path?.startsWith('art/source/character-kit/hd/candidates/')||!page.prompt))throw new Error(`${entry.id}: native pages need retained candidate and prompt provenance`);
}

/** A resolution migration must retain every already-published customization. */
export function requireCompleteHDReplacement(source, published) {
  if(!source.highResolution)return;
  const current=[...published.components,...Object.values(published.poseSets??{}).flatMap(pose=>pose.components),...Object.values(published.expressions??{}).flatMap(expression=>expression.components)];
  const missing=current.filter(part=>!source.entries.some(entry=>entry.id===part.id&&entry.status==='approved'&&entry.authoring?.kind==='native-repaint'));
  if(missing.length)throw new Error(`High-resolution replacement is incomplete: ${missing.map(part=>part.id).join(', ')}`);
}

export function expressionDefinition(source, id) {
  const definition = source.expressions?.[id];
  if (!slug(id) || id === 'neutral' || !definition || typeof definition.label !== 'string' || !definition.label.trim()) throw new Error(`Invalid expression ${id}`);
  return {label:definition.label};
}

export function poseDefinition(source, id = 'walk') {
  const pose = source.poseSets?.[id] ?? (id === 'walk' ? {label:'Walk', rowDescription:'standing then eight walking poses', frameDurations:[650,130,130,130,130,130,130,130,130]} : null);
  if (!slug(id) || !pose || typeof pose.label !== 'string' || !pose.label.trim() || typeof pose.rowDescription !== 'string' || !pose.rowDescription.trim()
    || !Array.isArray(pose.frameDurations) || pose.frameDurations.length !== 9 || pose.frameDurations.some(ms => !Number.isInteger(ms) || ms < 10 || ms > 60000)) throw new Error(`Invalid pose set ${id}`);
  if(pose.requiredParts!==undefined && (!pose.requiredParts || Array.isArray(pose.requiredParts) || typeof pose.requiredParts!=='object'
    || Object.entries(pose.requiredParts).some(([slot,option])=>slot==='body'||!source.slots?.some(s=>s.id===slot)||!slug(option)))) throw new Error(`Invalid required parts for pose set ${id}`);
  return {label:pose.label, rowDescription:pose.rowDescription, frameDurations:pose.frameDurations,...(pose.requiredParts?{requiredParts:pose.requiredParts}:{})};
}

/** Split before interpolation; each sheet carries disjoint native coverage. */
export function splitMaterials(component, materials, classify, detailMaterial) {
  const layers = Object.fromEntries(materials.map(key => [key, Buffer.alloc(component.length)]));
  for (let p = 0; p < component.length; p += 4) {
    if (!component[p + 3]) continue;
    const detected = classify(component[p], component[p + 1], component[p + 2]);
    const classified = materials.includes(detected) ? detected : 'detail';
    const key = classified === 'detail' && detailMaterial ? detailMaterial : classified;
    const layer = layers[key];
    if (!layer) throw new Error(`Undeclared ${key} paint in component`);
    component.copy(layer, p, p, p + 4);
    if (key === 'detail') continue;
    const gray = Math.min(255, Math.round((component[p] * .2126 + component[p + 1] * .7152 + component[p + 2] * .0722) * 255 / FORMAT.luminanceReference));
    layer[p] = layer[p + 1] = layer[p + 2] = gray;
  }
  return layers;
}

export function atlasFor(image, frames, cellSize = [128, 192]) {
  const [width,height] = cellSize, atlasWidth = width * 9;
  const out = Buffer.alloc(atlasWidth * height * 4 * 4);
  for (const [index, frame] of frames.entries()) {
    const cell = canonical(image, frame, cellSize), column = index % 9, row = Math.floor(index / 9);
    for (let y = 0; y < height; y++) cell.copy(out, ((row * height + y) * atlasWidth + column * width) * 4, y * width * 4, (y + 1) * width * 4);
  }
  return out;
}

function requireValid(report) {
  if (!report.valid) throw new Error(`${report.id}: export refused: ${report.errors.join('; ')}`);
}

/** Approval binds to actual reviewed pixels and reports, not just a status word. */
export async function verifyApproval(root, entry) {
  const review = entry.review;
  let visibleNativeProof = false;
  if (entry.status !== 'approved' || review?.result !== 'approved' || !review.proofs?.length)
    throw new Error(`${entry.id}: visual approval required`);
  if (sha(await readFile(resolve(root, entry.locked))) !== review.lockedSha256)
    throw new Error(`${entry.id}: approved locked source has changed`);
  for (const proof of review.proofs) {
    for (const [path, expected] of [[proof.image, proof.imageSha256], [proof.report, proof.reportSha256], [proof.walk, proof.walkSha256]]) {
      if (!path || !expected || sha(await readFile(resolve(root, path))) !== expected) throw new Error(`${entry.id}: stale reviewed proof ${path}`);
    }
    const report = await readJSON(resolve(root, proof.report));
    if (!report.valid || !report.checks?.every(check => check.valid)) throw new Error(`${entry.id}: reviewed proof is not valid`);
    if(entry.authoring?.kind==='native-repaint') {
      if(report.nativeProofs?.length!==18)throw new Error(`${entry.id}: all frames in both palettes need native-resolution proofs`);
      for(const page of report.nativeProofs) {
        if(page.cell?.[0]!==512||page.cell?.[1]!==768||sha(await readFile(resolve(root,page.image)))!==page.imageSha256)throw new Error(`${entry.id}: stale or undersized native proof`);
        const traces=report.ruleTrace?.filter(trace=>trace.board===page.board)??[];
        if(!Number.isInteger(page.board)||!traces.some(trace=>trace.visible.includes(entry.id)||trace.hidden.includes(entry.id)))throw new Error(`${entry.id}: native proof does not include the reviewed component`);
        visibleNativeProof ||= traces.some(trace=>trace.visible.includes(entry.id));
      }
    }
    for (const input of Object.values(report.sources ?? {})) if (sha(await readFile(resolve(root, input.path))) !== input.sha256)
      throw new Error(`${entry.id}: reviewed proof input has changed: ${input.path}`);
  }
  if(entry.authoring?.kind==='native-repaint'&&!visibleNativeProof)throw new Error(`${entry.id}: native approval needs a proof with the component visible`);
}

/** Encodes all buffers first; failed validation cannot overwrite exported files. */
export async function exportComponent(ctx, locked, report, helpers) {
  requireValid(report);
  const { entry, root, base, mask, manifest } = ctx;
  const format = catalogueFormat(ctx.catalogue), directory = assetRoot(ctx.catalogue);
  if (ctx.catalogue.highResolution) requireNativeDetail(entry, manifest);
  const [ew,eh] = format.editorCell, [rw,rh] = format.runtimeCell;
  if (!slug(entry.id) || !slug(entry.build) || !slug(entry.slot) || !slug(entry.optionId)) throw new Error('Export requires safe id, optionId, slot and build identifiers');
  const source = helpers.extract(base, locked, mask, entry.lock, manifest);
  if(ctx.catalogue.highResolution && entry.slot==='body') {
    for(const [index,frame] of manifest.frames.entries()) {
      const pixels=canonical({data:source,info:base.info},frame,format.runtimeCell);
      let first=rh,last=-1;
      for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)if(pixels[(y*rw+x)*4+3]>16){first=Math.min(first,y);last=y;}
      const errors=characterResolutionErrors({nativeCell:[frame.transform.sourceCell.width,frame.transform.sourceCell.height],outputCell:format.runtimeCell,paintedHeight:last-first+1,surface:'world',authored:true,worldHeightRatio:ctx.entry.poseSet ? Math.min(1,(frame.ground.y-frame.headBounds.top)/CHARACTER_RESOLUTION.registeredStandingHeight) : 1});
      if(errors.length)throw new Error(`${entry.id} frame ${index}: ${errors.join('; ')}`);
    }
  }
  const layers = splitMaterials(source, entry.materials, helpers.material, entry.lock?.detailMaterial), files = [], sheets = {};
  const prefix = `${entry.build}/${entry.id}`;
  for (const [material, data] of Object.entries(layers)) {
    if (!data.some((value, index) => index % 4 === 3 && value)) continue;
    const editor = atlasFor({ data, info: base.info }, manifest.frames, format.editorCell);
    if(ctx.catalogue.highResolution){
      const pages={runtimePages:[],editorPages:[]};
      for(let start=0;start<36;start+=4){
        const cells=[];
        for(let tile=0;tile<4;tile++){
          const frame=start+tile;
          cells.push(await sharp(editor,{raw:{width:ew*9,height:eh*4,channels:4}}).extract({left:frame%9*ew,top:Math.floor(frame/9)*eh,width:ew,height:eh}).png().toBuffer());
        }
        for(const [resolution,w,h]of [['runtime',rw,rh],['editor',ew,eh]]){
          const overlays=[];
          for(const [tile,cell]of cells.entries())overlays.push({input:await sharp(cell).resize(w,h).png().toBuffer(),left:tile%2*w,top:Math.floor(tile/2)*h});
          const buffer=await sharp({create:{width:w*2,height:h*2,channels:4,background:'#00000000'}}).composite(overlays).webp({lossless:true,effort:6}).toBuffer();
          const path=`${prefix}.${material}.${resolution}.${start/4}.webp`;
          files.push([path,buffer]);pages[`${resolution}Pages`].push({path,sha256:sha(buffer),firstFrame:start,frameCount:4,columns:2});
        }
      }
      sheets[material]=pages;continue;
    }
    const editorBuffer = await sharp(editor, { raw: { width: ew*9, height: eh*4, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
    // Resize complete cells individually; a filter may never sample its neighbour.
    const runtimeCells = [];
    for (let row = 0; row < 4; row++) for (let column = 0; column < 9; column++) {
      const input = await sharp(editor, { raw: { width: ew*9, height: eh*4, channels: 4 } }).extract({ left: column * ew, top: row * eh, width: ew, height: eh }).resize(rw, rh).png().toBuffer();
      runtimeCells.push({ input, left: column * rw, top: row * rh });
    }
    const runtimeBuffer = await sharp({ create: { width: rw*9, height: rh*4, channels: 4, background: '#00000000' } }).composite(runtimeCells).webp({ lossless: true, effort: 6 }).toBuffer();
    const runtime = `${prefix}.${material}.webp`, editorPath = `${prefix}.${material}.editor.webp`;
    files.push([runtime, runtimeBuffer], [editorPath, editorBuffer]);
    sheets[material] = { runtime, editor: editorPath, runtimeSha256: sha(runtimeBuffer), editorSha256: sha(editorBuffer) };
  }
  const palette = { primary: [80, 107, 155], secondary: [198, 174, 105], skin: [214, 160, 125] };
  const paint = helpers.tintComponent(source, palette, entry.materials, entry.lock?.detailMaterial);
  const body = entry.lock?.operation === 'replace' ? Buffer.alloc(base.data.length) : helpers.tintComponent(base.data, palette, ['skin', 'detail']);
  const thumbnailBuffer = await sharp(canonical({ data: body, info: base.info }, manifest.frames[0]), { raw: { width: 128, height: 192, channels: 4 } })
    .composite([{ input: canonical({ data: paint, info: base.info }, manifest.frames[0]), raw: { width: 128, height: 192, channels: 4 } }]).webp({ lossless: true }).toBuffer();
  const thumbnail = `${prefix}.thumb.webp`; files.push([thumbnail, thumbnailBuffer]);
  const provenance = await readJSON(resolve(root, `${entry.locked}.json`));
  const poseSet = entry.poseSet ?? 'walk';
  const definition = poseDefinition(ctx.catalogue, poseSet);
  const asset = { id: entry.id, optionId: entry.optionId, slot: entry.slot, build: entry.build, ...(poseSet === 'walk' ? {} : {poseSet}), ...(entry.expression ? {expression:entry.expression} : {}), source: entry.locked, sourceSha256: sha(await readFile(resolve(root, entry.locked))), provenance, materials: Object.keys(sheets), sheets, thumbnail, thumbnailSha256: sha(thumbnailBuffer) };
  let output;
  try { output = await readJSON(resolve(root, directory, 'manifest.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; output = { schemaVersion: 1, format, assets: [] }; }
  if (output.schemaVersion !== 1 || fingerprint(output.format) !== fingerprint(format)) throw new Error('Incompatible character-kit export manifest');
  output.assets = [...output.assets.filter(item => item.id !== entry.id), asset].sort((a, b) => a.id.localeCompare(b.id));
  if (poseSet !== 'walk' || output.poseSets) output.poseSets = {...output.poseSets, walk:poseDefinition(ctx.catalogue), [poseSet]:definition};
  output.assetVersion = fingerprint(output.assets).slice(0, 16);
  for (const [path, buffer] of files) { const target = resolve(root, directory, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, buffer); }
  await saveJSON(resolve(root, directory, 'manifest.json'), output);
  return asset;
}

// A material may be occluded by the body (an apron bib viewed from behind),
// or have a different visible area by facing (front lapels versus rear collar).
// Keep these exceptions explicit and preserve the ordinary all-frame defaults.
export function validateMaterialPolicy(entry) {
  const policy = entry.validation ?? {}, facings = ['down', 'right', 'up', 'left'];
  const visible = policy.visibleFacings ?? facings;
  const materialFacings = policy.materialFacings ?? {}, optional = policy.optionalMaterialFacings ?? {}, byFacing = policy.materialCountByFacing ?? [];
  const isKey = key => key !== 'detail' && entry.materials?.includes(key);
  if (!optional || typeof optional !== 'object' || Array.isArray(optional) || Object.entries(optional).some(([key, values]) => !isKey(key) || !Array.isArray(values) || !values.length || new Set(values).size !== values.length || values.some(facing => !(materialFacings[key] ?? visible).includes(facing)))
    || !materialFacings || typeof materialFacings !== 'object' || Array.isArray(materialFacings)
    || Object.entries(materialFacings).some(([key, values]) => !isKey(key) || !Array.isArray(values) || !values.length
      || new Set(values).size !== values.length || values.some(facing => !facings.includes(facing) || !visible.includes(facing)))
    || !Array.isArray(byFacing) || new Set(byFacing).size !== byFacing.length || byFacing.some(key => !isKey(key))
    || ((Object.keys(materialFacings).length || Object.keys(optional).length || byFacing.length) && (entry.slot === 'body' || typeof policy.materialReason !== 'string' || !policy.materialReason.trim()))) {
    throw new Error(`Invalid material visibility/count policy for ${entry.id}; exceptions require declared keys, facings and an explanation, and cannot apply to mannequins`);
  }
}

export function validateCatalogue(source) {
  if (!Array.isArray(source.slots) || !Array.isArray(source.entries) || !source.builds) throw new Error('Catalogue needs slots, entries and builds');
  const slots = new Set(), ids = new Set(), identities = new Set();
  for (const id of Object.keys(source.poseSets ?? {})) poseDefinition(source, id);
  for (const id of Object.keys(source.expressions ?? {})) expressionDefinition(source, id);
  for (const build of Object.keys(source.builds)) if (!slug(build)) throw new Error(`Invalid build ${build}`);
  for (const [key, value] of Object.entries(source.defaultColors ?? {})) if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid default colour ${key}`);
  for (const slot of source.slots) {
    if (!slug(slot.id) || slots.has(slot.id) || typeof slot.label !== 'string' || !slot.label || typeof slot.optional !== 'boolean') throw new Error(`Invalid or duplicate slot ${slot.id}`);
    slots.add(slot.id);
    if (slot.defaultOption !== undefined && !slug(slot.defaultOption)) throw new Error(`Invalid default option for ${slot.id}`);
    if (!Number.isFinite(slot.zOrder?.default)) throw new Error(`Slot ${slot.id} needs default z-order`);
  }
  for (const entry of source.entries) {
    const poseSet = entry.poseSet ?? 'walk';
    poseDefinition(source, poseSet);
    if (poseSet !== 'walk') {
      const refs = source.builds[entry.build]?.poseSets?.[poseSet];
      if (!refs || ['master','mannequin','registration','masks'].some(key=>typeof refs[key] !== 'string' || !refs[key])) throw new Error(`Incomplete references for ${entry.build}/${poseSet}`);
    }
    if (entry.expression !== undefined) {
      expressionDefinition(source, entry.expression);
      if (entry.slot !== 'face' || poseSet !== 'walk' || entry.materials?.length !== 1 || entry.materials[0] !== 'detail') throw new Error(`Expressions must be untinted walking-grid face variants: ${entry.id}`);
    }
    const identity = `${entry.build}/${poseSet}/${entry.expression ?? 'neutral'}/${entry.slot}/${entry.optionId}`;
    if (!slug(entry.id) || !slug(entry.optionId) || ids.has(entry.id) || identities.has(identity) || !slots.has(entry.slot) || !source.builds[entry.build]) throw new Error(`Invalid or duplicate component ${entry.id}`);
    ids.add(entry.id); identities.add(identity);
    if (entry.slot === 'body' && entry.optionId !== entry.build) throw new Error(`Body option must identify its build: ${entry.id}`);
    if (entry.validation) {
      const max = entry.validation.maxRegions ?? 1;
      if (Object.keys(entry.validation).some(key => !['maxRegions', 'maxRegionsByFacing', 'regionReason', 'visibleFacings', 'visibilityReason', 'materialFacings', 'optionalMaterialFacings', 'materialCountByFacing', 'materialReason', 'cellMargin'].includes(key)) || !Number.isInteger(max) || max < 1 || max > (entry.slot === 'markings' ? 16 : entry.slot === 'face' ? 8 : entry.slot === 'outer' ? 6 : 4) || (entry.slot === 'body' && max !== 1) || (max > 1 && !entry.validation.regionReason?.trim())) throw new Error(`Invalid region validation policy for ${entry.id}`);
      const margin = entry.validation.cellMargin ?? 0;
      if (!Number.isInteger(margin) || margin < 0 || margin > 8) throw new Error(`Invalid cell margin for ${entry.id}`);
      const facingRegions = entry.validation.maxRegionsByFacing ?? {};
      if (!facingRegions || Array.isArray(facingRegions) || typeof facingRegions !== 'object' || Object.entries(facingRegions).some(([facing, count]) => !['down', 'right', 'up', 'left'].includes(facing) || !Number.isInteger(count) || count < 1 || count > (entry.slot === 'markings' ? 16 : entry.slot === 'face' ? 8 : entry.slot === 'outer' ? 6 : 4) || (entry.slot === 'body' && count !== 1) || (count > 1 && !entry.validation.regionReason?.trim()))) throw new Error(`Invalid facing region validation policy for ${entry.id}`);
      const facings = entry.validation.visibleFacings ?? ['down', 'right', 'up', 'left'];
      if (!Array.isArray(facings) || !facings.length || new Set(facings).size !== facings.length || facings.some(facing => !['down', 'right', 'up', 'left'].includes(facing)) || (facings.length < 4 && (entry.slot === 'body' || !entry.validation.visibilityReason?.trim()))) throw new Error(`Invalid facing validation policy for ${entry.id}`);
    }
    if (!entry.label || !Array.isArray(entry.materials) || !entry.materials.length || new Set(entry.materials).size !== entry.materials.length || entry.materials.some(key => !['primary', 'secondary', 'skin', 'detail'].includes(key))) throw new Error(`Invalid label/materials for ${entry.id}`);
    validateMaterialPolicy(entry);
    for (const key of ['hides', 'excludes', 'occupies']) if (entry[key] !== undefined && (!Array.isArray(entry[key]) || entry[key].some(slot => !slots.has(slot) && !(key === 'hides' && slot === 'hairCrown')))) throw new Error(`Invalid ${key} for ${entry.id}`);
    for (const [slot, coverage] of Object.entries(entry.covers ?? {})) if (!slots.has(slot) || !['upper', 'lower', 'full'].includes(coverage)) throw new Error(`Invalid coverage for ${entry.id}`);
    for (const [facing, value] of Object.entries(entry.zOrder ?? {})) if (!['default', 'down', 'right', 'up', 'left'].includes(facing) || !Number.isFinite(value)) throw new Error(`Invalid z-order for ${entry.id}`);
  }
}

export function compileCatalogue(source, exported) {
  validateCatalogue(source);
  const assets = new Map(exported.assets.map(asset => [asset.id, asset]));
  const allComponents = source.entries.filter(entry => entry.status === 'approved').map(entry => {
    const asset = assets.get(entry.id), slot = source.slots.find(slot => slot.id === entry.slot);
    const poseSet = entry.poseSet ?? 'walk';
    if (!asset || entry.build !== asset.build || entry.slot !== asset.slot || entry.optionId !== asset.optionId || (asset.poseSet ?? 'walk') !== poseSet || asset.expression !== entry.expression) throw new Error(`Missing or stale export for ${entry.id}`);
    if (poseSet !== 'walk' && fingerprint(exported.poseSets?.[poseSet] ?? null) !== fingerprint(poseDefinition(source,poseSet))) throw new Error(`Stale pose definition for ${entry.id}; export again`);
    return { id: entry.id, optionId: entry.optionId, slot: entry.slot, build: entry.build, label: entry.label, labelKey: entry.label,
      ...(poseSet === 'walk' ? {} : {poseSet}), ...(entry.expression ? {expression:entry.expression} : {}),
      materials: asset.materials, tints: Object.fromEntries(asset.materials.map(key => [key, key === 'detail' ? null : key === 'skin' ? 'skin' : ['hair', 'facial-hair'].includes(entry.slot) ? 'hair' : `${entry.slot}.${key}`])),
      occupies: entry.occupies ?? [], hides: entry.hides ?? [], excludes: entry.excludes ?? [], covers: entry.covers ?? {}, zOrder: { ...slot.zOrder, ...entry.zOrder },
      sheets: asset.sheets, thumbnail: asset.thumbnail, sourceSha256: asset.sourceSha256 };
  }).sort((a, b) => a.id.localeCompare(b.id));
  for (const component of allComponents) if (!allComponents.some(part => part.slot === 'body' && part.build === component.build && (part.poseSet ?? 'walk') === (component.poseSet ?? 'walk'))) throw new Error(`No approved mannequin for build ${component.build}/${component.poseSet ?? 'walk'}`);
  const components = allComponents.filter(part => !part.poseSet && !part.expression);
  for (const part of allComponents.filter(part => part.expression)) {
    const neutral = components.find(base => base.build === part.build && base.slot === 'face' && base.optionId === part.optionId);
    if (!neutral) throw new Error(`No approved neutral face for ${part.id}`);
    for (const key of ['materials','tints','occupies','hides','excludes','covers','zOrder']) if (fingerprint(part[key]) !== fingerprint(neutral[key])) throw new Error(`Expression changes face contract for ${part.id}: ${key}`);
  }
  const expressions = Object.fromEntries([...new Set(allComponents.map(part=>part.expression).filter(Boolean))].sort().map(id=>[id,{...expressionDefinition(source,id),components:allComponents.filter(part=>part.expression===id)}]));
  for (const part of allComponents.filter(part=>part.poseSet)) {
    const walk = components.find(base=>base.build===part.build && base.slot===part.slot && base.optionId===part.optionId);
    if (!walk) throw new Error(`No approved walking option for ${part.id}`);
    // Detailed action faces may also shade the skin silhouette. Skin is already
    // a required global recipe colour, so this adds no per-piece colour field.
    if (Object.values(part.tints).some(key=>key && !(part.slot==='face'&&key==='skin') && !Object.values(walk.tints).includes(key))) throw new Error(`Pose materials change the recipe contract for ${part.id}`);
  }
  const poseSets = Object.fromEntries([...new Set(allComponents.map(part=>part.poseSet).filter(Boolean))].sort().map(id=>{
    const parts = allComponents.filter(part=>part.poseSet === id);
    return [id,{...poseDefinition(source,id),builds:[...new Set(parts.filter(part=>part.slot==='body').map(part=>part.build))].sort(),components:parts}];
  }));
  const slots = source.slots.map(({ id, label, optional, tab, zOrder, defaultOption }) => ({ id, label, labelKey: label, optional, tab, zOrder, ...(defaultOption ? {defaultOption} : {}) }));
  const output = { schemaVersion: 1, recipeVersion: 2, assetVersion: '', assetBase: assetRoot(source).replace('web/public','')+'/', format: catalogueFormat(source),
    defaultColors: source.defaultColors ?? {},
    builds: [...new Set(components.filter(entry => entry.slot === 'body').map(entry => entry.build))].sort(), slots, components,
    ...(Object.keys(poseSets).length ? {poseSets} : {}),
    ...(Object.keys(expressions).length ? {expressions} : {}),
    colorKeys: [...new Set(components.flatMap(entry => Object.values(entry.tints).filter(key => key && !['skin', 'hair'].includes(key))))].sort() };
  output.assetVersion = fingerprint(output).slice(0, 16);
  return output;
}

export async function buildCatalogue(root, source, verify) {
  if(source.highResolution)requireCompleteHDReplacement(source,await readJSON(resolve(root,'server/character-kit.json')));
  validateCatalogue(source);
  const directory = assetRoot(source);
  const exported = await readJSON(resolve(root, directory, 'manifest.json'));
  if (exported.schemaVersion !== 1 || fingerprint(exported.format) !== fingerprint(catalogueFormat(source))) throw new Error('Incompatible character-kit export manifest');
  const compiled = compileCatalogue(source, exported);
  for (const entry of source.entries.filter(entry => entry.status === 'approved')) {
    const { report } = await verify(entry.id); requireValid(report); await verifyApproval(root, entry);
    const asset = exported.assets.find(asset => asset.id === entry.id);
    if (!asset || asset.sourceSha256 !== sha(await readFile(resolve(root, entry.locked))) || fingerprint(asset.provenance) !== fingerprint(await readJSON(resolve(root, `${entry.locked}.json`)))) throw new Error(`Stale export for ${entry.id}; export again`);
    if (!Array.isArray(asset.materials) || !asset.materials.length || asset.materials.some(key => !entry.materials.includes(key)) || entry.materials.filter(key => key !== 'detail').some(key => !asset.materials.includes(key)) || fingerprint([...asset.materials].sort()) !== fingerprint(Object.keys(asset.sheets).sort())) throw new Error(`Incomplete material export for ${entry.id}`);
    for (const sheet of Object.values(asset.sheets)) for (const resolution of ['runtime','editor']) {
      for(const page of characterSheetPages(sheet,resolution,exported.format[`${resolution}Cell`])) {
        if (sha(await readFile(resolve(root, directory, page.path))) !== page.sha256) throw new Error(`Changed derivative ${page.path}; export again`);
      }
    }
    if (sha(await readFile(resolve(root, directory, asset.thumbnail))) !== asset.thumbnailSha256) throw new Error(`Changed thumbnail for ${entry.id}`);
  }
  await saveJSON(resolve(root, 'server/character-kit.json'), compiled);
  return compiled;
}

export async function syncCharacterLabels(root, source) {
  const path = resolve(root, 'web/src/data/i18n/tr-ui.json'), ui = await readJSON(path);
  const publishedExpressions = new Set(source.entries.filter(entry => entry.status === 'approved').map(entry => entry.expression).filter(Boolean));
  const publishedPoses = new Set(source.entries.filter(entry => entry.status === 'approved').map(entry => entry.poseSet).filter(Boolean));
  for (const item of [...source.slots, ...source.entries.filter(entry => entry.status === 'approved'), ...[...publishedPoses].map(id => source.poseSets[id]), ...[...publishedExpressions].map(id => source.expressions[id])]) {
    if (item.labelTr) ui[item.label] = item.labelTr;
    if (!ui[item.label]?.trim()) throw new Error(`Missing Turkish character label: ${item.label}`);
  }
  await writeFile(path, JSON.stringify(ui, null, 1) + '\n');
}
