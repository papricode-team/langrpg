import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { material, validateGrid, makeMask, lockPixels, extract, checkPixels, tintComponent, promptFor, resolveProofPieces, candidateMatte, recoverInk, buildReferences } from './character-kit.mjs';

const entry = { id: 'test', slot: 'headwear', materials: ['primary'] };
const info = { width: 72, height: 32 }, image = () => ({ info, data: Buffer.alloc(info.width * info.height * 4) });
const frames = Array.from({ length: 36 }, (_, index) => ({ direction: Math.floor(index / 9), column: index % 9, headBounds: { left: 2, right: 6, top: 1 }, neck: { y: 4 }, waist: { y: 4 }, ground: { y: 7 }, transform: { scale: 1, offset: { x: 0, y: 0 }, sourceCell: { left: index % 9 * 8, top: Math.floor(index / 9) * 8, width: 8, height: 8 } } }));
const manifest = { columns: 9, rows: 4, cell: [128, 192], frames };
const paint = (target, x, y, rgba) => target.data.set(rgba, (y * target.info.width + x) * 4);
function fixture() {
  const base = image(), edit = image(), mask = new Uint8Array(info.width * info.height);
  for (const f of frames) for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) {
    const px = f.transform.sourceCell.left + x, py = f.transform.sourceCell.top + y;
    paint(base, px, py, [90, 90, 90, 255]); paint(edit, px, py, [122, 90, 154, 255]); mask[py * info.width + px] = 1;
  }
  return { base, edit, mask };
}

test('frame noise cleanup removes only subminimum residual paint and preserves valid marks', () => {
  const {base, edit, mask}=fixture();
  for (let y=2;y<6;y++) for(let x=2;x<6;x++) paint(edit,x,y,[90,90,90,255]);
  paint(edit,3,3,[122,90,154,255]);
  const clean=lockPixels(base,edit,mask,['primary'],{minFramePaintPixels:6},manifest);
  const p=(3*info.width+3)*4, next=(3*info.width+11)*4;
  assert.deepEqual(clean.subarray(p,p+4),base.data.subarray(p,p+4));
  assert.deepEqual(clean.subarray(next,next+4),edit.data.subarray(next,next+4));
  for(const value of [0,7,1.5]) assert.throws(()=>lockPixels(base,edit,mask,['primary'],{minFramePaintPixels:value},manifest),/Frame noise/);
});

test('neutral detail extraction excludes coloured mannequin fringe without changing keyed hair', () => {
  const {base,edit,mask}=fixture();
  paint(edit,2,2,[50,80,130,255]);
  paint(edit,3,2,[30,30,30,255]);
  const locked=lockPixels(base,edit,mask,['primary','detail'],{detailMaxChroma:.15},manifest);
  const pixel=(x,y)=>locked.subarray((y*info.width+x)*4,(y*info.width+x)*4+4);
  assert.deepEqual([...pixel(2,2)],[90,90,90,255]);
  assert.deepEqual([...pixel(3,2)],[30,30,30,255]);
  assert.deepEqual([...pixel(4,2)],[122,90,154,255]);
  for(const value of [-1,2,NaN]) assert.throws(()=>lockPixels(base,edit,mask,['primary','detail'],{detailMaxChroma:value},manifest),/Detail chroma/);
});

test('key families stay distinct under shading and natural detail is untinted', () => {
  for (const multiplier of [.3, .6, 1, 1.5]) for (const [key, rgb] of Object.entries({ primary: [122, 90, 154], secondary: [90, 154, 106], skin: [90, 154, 154] })) assert.equal(material(...rgb.map(n => Math.round(n * multiplier))), key);
  assert.equal(material(120, 120, 120), 'detail'); assert.equal(material(200, 130, 75), 'detail');
});

test('registration rejects overlapping, incomplete and reordered grids', () => {
  validateGrid(manifest, info);
  const bad = structuredClone(manifest); bad.frames[1].transform.sourceCell.left = 0;
  assert.throws(() => validateGrid(bad, info), /Overlapping/);
  assert.throws(() => validateGrid(manifest, { ...info, width: 73 }), /cover/);
  bad.frames[1].direction = 3; assert.throws(() => validateGrid(bad, info), /Invalid/);
  assert.throws(() => validateGrid({ ...manifest, frames: frames.slice(1) }, info), /9×4/);
});

test('cell clearance rejects clipped paint even when it remains connected and attached', () => {
  const {base,edit,mask}=fixture(), guarded={...entry,validation:{cellMargin:1}};
  assert.equal(checkPixels(base,edit,mask,manifest,guarded).valid,true);
  for(let y=0;y<2;y++) {paint(edit,3,y,[122,90,154,255]);mask[y*info.width+3]=1;}
  assert.equal(checkPixels(base,edit,mask,manifest,entry).valid,true);
  assert.match(checkPixels(base,edit,mask,manifest,guarded).errors.join('\n'),/Frame 0: 1 paint pixels violate 1-pixel cell clearance/);
  for(const cellMargin of [-1,.5,9]) assert.throws(()=>checkPixels(base,edit,mask,manifest,{...entry,validation:{cellMargin}}),/Cell margin/);
});

test('mask projection uses each frame transform and stays inside its cell', () => {
  const local = { ...manifest, frames: [frames[0]] };
  const mask = makeMask(info, local, { anchor: 'head', paddingX: 100, paddingTop: 100, reach: 100 });
  assert.equal(mask.reduce((sum, n) => sum + n, 0), 64);
  assert.equal(mask[8], 0); assert.equal(mask[8 * info.width], 0);
});

test('span masks follow registered landmarks and reject malformed bounds', () => {
  const span = { anchor: 'span', top: { from: 'waist', to: 'ground', fraction: .5 }, bottom: { from: 'ground', offset: 1 } };
  const mask = makeMask(info, manifest, span);
  assert.equal(mask[5 * info.width + 3], 0);
  assert.equal(mask[6 * info.width + 3], 1);
  assert.equal(mask[7 * info.width + 3], 1);
  assert.throws(() => makeMask(info, manifest, { ...span, top: { from: 'missing' } }), /landmark/);
  assert.throws(() => makeMask(info, manifest, { ...span, top: { from: 'ground', offset: 2 } }), /bounds/);
  assert.throws(() => makeMask(info, manifest, { anchor: 'head' }), /bounds/);
});

test('every catalogue slot has a bounded mask in its declared facings', async () => {
  const root = resolve(import.meta.dirname, '..');
  const catalogue = JSON.parse(await readFile(resolve(root, 'art/source/character-kit/catalogue.json')));
  const specs = JSON.parse(await readFile(resolve(root, 'art/source/character-kit/masks.json')));
  const registration = JSON.parse(await readFile(resolve(root, catalogue.registration)));
  for (const slot of catalogue.slots) assert.ok(Object.values(specs).some(spec => spec.slot === slot.id), `Missing ${slot.id} mask`);
  for (const [id, spec] of Object.entries(specs)) {
    const mask = makeMask({ width: 1536, height: 1024 }, registration, spec);
    for (const frame of registration.frames) {
      const c = frame.transform.sourceCell;
      let count = 0;
      for (let y = c.top; y < c.top + c.height; y++) for (let x = c.left; x < c.left + c.width; x++) count += mask[y * 1536 + x];
      const visible = !spec.facings || spec.facings.includes(['down', 'right', 'up', 'left'][frame.direction]);
      if (visible) assert.ok(count > 0 && count < c.width * c.height, `${id}, frame ${frame.direction}/${frame.column}: bounded editable region`);
      else assert.equal(count, 0, `${id}: invisible facing must be protected`);
    }
  }
});

test('detail-only face locks ignore cyan keys and preserve the antialiased silhouette', () => {
  const {base, edit, mask} = fixture();
  paint(base, 2, 2, [90, 154, 154, 100]); paint(edit, 2, 2, [200, 205, 204, 255]);
  paint(edit, 3, 3, [90, 154, 154, 255]); paint(edit, 4, 3, [80, 40, 30, 255]);
  const policy = {ignoreKeys:['primary','secondary','skin'], minBaseAlpha:240};
  const locked = lockPixels(base, edit, mask, ['detail'], policy, manifest);
  assert.deepEqual(locked.subarray((2*info.width+2)*4,(2*info.width+2)*4+4),base.data.subarray((2*info.width+2)*4,(2*info.width+2)*4+4));
  assert.deepEqual([...locked.subarray((3*info.width+3)*4,(3*info.width+3)*4+4)],[90,90,90,255]);
  assert.deepEqual([...locked.subarray((3*info.width+4)*4,(3*info.width+4)*4+4)],[80,40,30,255]);
  assert.throws(()=>lockPixels(base, edit, mask, ['skin','detail'], policy, manifest),/Ignored keys/);
  assert.throws(()=>lockPixels(base, edit, mask, ['detail'], {...policy,operation:'replace'}, manifest),/overlay/);
});

test('declared invisible facings must be empty while visible face frames still require attached paint', () => {
  const {base, edit, mask} = fixture();
  const face = {...entry,slot:'face',validation:{maxRegions:8,regionReason:'Separate facial marks',visibleFacings:['down','right','left'],visibilityReason:'Features cannot be seen from behind'}};
  assert.match(checkPixels(base, edit, mask, manifest, face).errors.join(),/invisible facing/);
  for(const f of frames.filter(f=>f.direction===2)) {
    const c=f.transform.sourceCell;
    for(let y=c.top;y<c.top+c.height;y++)base.data.copy(edit.data,(y*info.width+c.left)*4,(y*info.width+c.left)*4,(y*info.width+c.left+c.width)*4);
  }
  assert.equal(checkPixels(base, edit, mask, manifest, face).valid,true);
  assert.match(checkPixels(base, edit, mask, manifest, entry).errors.join(),/missing paint/);
  assert.throws(()=>checkPixels(base,edit,mask,manifest,{...face,slot:'body'}),/mannequins/);
  assert.throws(()=>checkPixels(base,edit,mask,manifest,{...face,validation:{...face.validation,visibilityReason:''}}),/explained/);
  assert.throws(()=>makeMask(info,manifest,{anchor:'body',padding:0,facings:[]}),/Invalid mask facings/);
});

test('material visibility allows a front bib but rejects missing visible paint and rear leakage', () => {
  const {base, edit, mask} = fixture();
  const apron = {...entry, slot:'outer', materials:['primary','secondary'], validation:{
    materialFacings:{primary:['down','right','left']}, materialReason:'The front bib is occluded by the body from behind.'
  }};
  for (const f of frames) {
    const c = f.transform.sourceCell;
    for (let y=2;y<6;y++) for(let x=2;x<6;x++) if(f.direction===2 || x>=4) paint(edit,c.left+x,c.top+y,[90,154,106,255]);
  }
  assert.equal(checkPixels(base,edit,mask,manifest,apron).valid,true);
  assert.match(checkPixels(base,edit,mask,manifest,{...apron,validation:undefined}).errors.join(),/missing primary/);
  const rear=frames[18].transform.sourceCell;
  paint(edit,rear.left+2,rear.top+2,[122,90,154,255]);
  assert.match(checkPixels(base,edit,mask,manifest,apron).errors.join(),/invisible material facing/);
  paint(edit,rear.left+2,rear.top+2,[90,154,106,255]);
  for(let y=2;y<6;y++)for(let x=2;x<4;x++)paint(edit,x,y,[90,154,106,255]);
  assert.match(checkPixels(base,edit,mask,manifest,apron).errors.join(),/Frame 0: missing primary/);
  for(const validation of [
    {...apron.validation,materialReason:''},
    {...apron.validation,materialFacings:{primary:[]}},
    {...apron.validation,materialFacings:{primary:['up','up']}},
    {...apron.validation,materialFacings:{detail:['up']}},
    {...apron.validation,materialCountByFacing:['unknown']},
  ]) assert.throws(()=>checkPixels(base,edit,mask,manifest,{...apron,validation}),/material visibility/);
  assert.throws(()=>checkPixels(base,edit,mask,manifest,{...apron,slot:'body'}),/mannequins/);
});

test('facing material medians preserve small rear collars and catch a missing collar in one walk frame', () => {
  const {base,edit,mask}=fixture();
  for(const f of frames){
    const c=f.transform.sourceCell;
    for(let y=0;y<8;y++)for(let x=1;x<7;x++){
      const green=f.direction===2 ? y===0 : y<6;
      paint(edit,c.left+x,c.top+y,green?[90,154,106,255]:[122,90,154,255]);
      mask[(c.top+y)*info.width+c.left+x]=1;
    }
  }
  const blazer={...entry,slot:'outer',materials:['primary','secondary']};
  assert.match(checkPixels(base,edit,mask,manifest,blazer).errors.join(),/secondary count 6 outside/);
  blazer.validation={materialCountByFacing:['secondary'],materialReason:'The rear collar is much smaller than the front lapels.'};
  assert.equal(checkPixels(base,edit,mask,manifest,blazer).valid,true);
  const c=frames[20].transform.sourceCell;
  for(let x=2;x<7;x++)paint(edit,c.left+x,c.top,[122,90,154,255]);
  const errors=checkPixels(base,edit,mask,manifest,blazer).errors.join();
  assert.match(errors,/Frame 20: missing secondary/);
  assert.match(errors,/Frame 20: secondary count 1 outside.*for this facing/);
});

test('kit creates every mask for a slot with no candidates, and filters explicit variants', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'character-kit-masks-'));
  const repo = resolve(import.meta.dirname, '..'), kit = 'art/source/character-kit';
  try {
    const { main } = await import('./character-kit.mjs');
    const catalogue = JSON.parse(await readFile(resolve(repo, kit, 'catalogue.json')));
    catalogue.entries = [];
    const paths = [catalogue.registration, catalogue.builds.regular.master, catalogue.builds.regular.mannequin, `${kit}/masks.json`];
    const registration = JSON.parse(await readFile(resolve(repo, catalogue.registration)));
    if (registration.reference) paths.push(registration.reference.spec, registration.reference.registration, ...registration.reference.sources.map(source => source.path));
    for (const path of paths) { await mkdir(resolve(root, path, '..'), { recursive: true }); await writeFile(resolve(root, path), await readFile(resolve(repo, path))); }
    await writeFile(resolve(root, kit, 'catalogue.json'), JSON.stringify(catalogue));
    await main(['kit', '--slot', 'outer'], root);
    for (const mask of ['outer-short', 'outer-long']) assert.ok((await readdir(resolve(root, kit, 'kits/regular', mask))).includes(`mask-${mask}-bw.png`));
    await main(['kit', '--slot', 'hair', '--mask', 'hair-short'], root);
    await assert.rejects(readdir(resolve(root, kit, 'kits/regular/hair-long')), /ENOENT/);
    await assert.rejects(main(['kit', '--slot', 'unknown'], root), /Usage/);
    await assert.rejects(main(['kit', '--slot', 'outer', '--mask', 'hair-short'], root), /Usage/);
    await assert.rejects(main(['kit', '--slot', 'hair', '--build', 'unknown'], root), /Unknown build/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('lock discards protected changes and unchanged pre-existing keys', () => {
  const { base, edit, mask } = fixture();
  paint(edit, 0, 0, [122, 90, 154, 255]);
  paint(base, 2, 2, [122, 90, 154, 255]);
  const locked = { info, data: lockPixels(base, edit, mask, entry.materials) };
  assert.deepEqual(locked.data.subarray(0, 4), base.data.subarray(0, 4));
  assert.equal(extract(base, locked, mask)[(2 * info.width + 2) * 4 + 3], 0);
  assert.throws(() => lockPixels(base, { ...edit, info: { ...info, width: 71 } }, mask, entry.materials), /cannot be resized/);
});

test('detail is opt-in and no-op candidates cannot be locked', () => {
  const { base, edit, mask } = fixture(); paint(edit, 2, 2, [190, 120, 70, 255]);
  const p = (2 * info.width + 2) * 4;
  assert.deepEqual(lockPixels(base, edit, mask, ['primary']).subarray(p, p + 4), base.data.subarray(p, p + 4));
  assert.deepEqual(lockPixels(base, edit, mask, ['primary', 'detail']).subarray(p, p + 4), edit.data.subarray(p, p + 4));
  assert.throws(() => lockPixels(base, base, mask, ['primary']), /No eligible/);
});

test('declared input matte removes the white fringe while retaining enclosed white buttons', () => {
  const { base, edit } = fixture(), mask = new Uint8Array(info.width * info.height).fill(1);
  for (let p = 0; p < edit.data.length; p += 4) if (!edit.data[p + 3]) edit.data.set([250, 250, 250, 255], p);
  for (const f of frames) paint(edit, f.transform.sourceCell.left + 3, f.transform.sourceCell.top + 3, [255, 255, 255, 255]);
  const policy = { detailReach: 1, matte: { color: '#ffffff', tolerance: 32 } };
  const matte = candidateMatte(edit, manifest, policy.matte);
  assert.equal(matte[0], 1); assert.equal(matte[3 * info.width + 3], 0);
  const raw = lockPixels(base, edit, mask, ['primary', 'detail'], { detailReach: 1 }, manifest);
  const clean = lockPixels(base, edit, mask, ['primary', 'detail'], policy, manifest);
  assert.equal(raw[(info.width + 2) * 4 + 3], 255);
  assert.equal(clean[(info.width + 2) * 4 + 3], 0);
  assert.deepEqual([...clean.subarray((3 * info.width + 3) * 4, (3 * info.width + 3) * 4 + 4)], [255, 255, 255, 255]);
  assert.equal(checkPixels(base, { info, data: clean }, mask, manifest, { ...entry, materials: ['primary', 'detail'], lock: policy }).valid, true);
  assert.throws(() => candidateMatte(edit, manifest, { color: '#ffffff', tolerance: 255 }), /tolerance/);
});

test('explicit enclosed matte removes background holes without removing coloured hair or protected pixels', () => {
  const { base, edit, mask } = fixture();
  const hole = (3 * info.width + 3) * 4;
  paint(edit, 3, 3, [250, 250, 250, 255]);
  paint(edit, 0, 0, [250, 250, 250, 255]);
  const policy = { detailReach: 1, matte: { color: '#fafafa', tolerance: 32, includeEnclosed: true } };
  const matte = candidateMatte(edit, manifest, policy.matte);
  assert.equal(matte[3 * info.width + 3], 1);
  assert.equal(matte[2 * info.width + 2], 0);
  const locked = lockPixels(base, edit, mask, ['primary', 'detail'], policy, manifest);
  assert.deepEqual(locked.subarray(hole, hole + 4), base.data.subarray(hole, hole + 4));
  assert.deepEqual(locked.subarray(0, 4), base.data.subarray(0, 4));
  const component = extract(base, { info, data: locked }, mask, policy, manifest);
  assert.equal(component[hole + 3], 0);
  assert.equal(component[(2 * info.width + 2) * 4 + 3], 255);
  assert.throws(() => candidateMatte(edit, manifest, { ...policy.matte, includeEnclosed: 'yes' }), /boolean/);
});

test('declared ink recovery separates coverage from painted shading without retaining the cyan underpaint', () => {
  const ink = [96, 53, 31];
  for (const background of [[90, 154, 154], [45, 100, 106]]) for (const alpha of [.25, .65, 1]) for (const shade of [.6, 1.2]) {
    const original = ink.map(c => c * shade);
    const painted = original.map((c, i) => Math.round(c * alpha + background[i] * (1 - alpha)));
    const recovered = recoverInk(background, painted, ink, 2);
    assert.ok(recovered);
    assert.ok(Math.abs(recovered[3] - alpha * 255) <= 5);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(recovered[i] - original[i]) <= 5);
  }
  assert.equal(recoverInk([90,154,154], [90,154,154], ink, 2), null);
  assert.equal(recoverInk([90,154,154], [0,255,0], ink, 2), null);
  assert.equal(recoverInk(ink, ink, ink, 2), null);
});

test('ink overlays preserve protected pixels and carry authored opacity into the extracted component', () => {
  const base = image(), edit = image(), mask = new Uint8Array(info.width * info.height), ink = [96,53,31];
  const p = (3 * info.width + 3) * 4;
  base.data.set([90,154,154,252],p);
  const underpaint = [90,154,154].map(c=>c*252/255+250*3/255);
  edit.data.set([...ink.map((c,i)=>Math.round(c*.7+underpaint[i]*.3)),255],p);
  mask[p/4] = 1;
  // A second painted pixel lies outside the edit mask and must stay unchanged.
  edit.data.set([96,53,31,255],p+4);
  const policy = { minBaseAlpha:240, matte:{color:'#fafafa',tolerance:32}, detailInk:{color:'#60351f',tolerance:2,opacity:.35} };
  const locked = lockPixels(base,edit,mask,['detail'],policy,manifest);
  const component = extract(base,{info,data:locked},mask,policy,manifest);
  assert.ok(Math.abs(component[p+3]-255*.7*.35)<=2);
  assert.deepEqual([...locked.subarray(p+4,p+8)],[...base.data.subarray(p+4,p+8)]);
  assert.throws(()=>lockPixels(base,edit,mask,['primary'],policy,manifest),/detail-only/);
  assert.throws(()=>lockPixels(base,edit,mask,['detail'],{...policy,detailInk:{...policy.detailInk,opacity:0}},manifest),/opacity/);
});

test('ink recovery accepts registered near-opaque paint and rejects translucent silhouette edges', () => {
  const base = image(), edit = image(), mask = new Uint8Array(info.width * info.height);
  const p = (3 * info.width + 3) * 4, ink = [96,53,31];
  base.data.set([90,154,154,252],p);
  const underpaint = [90,154,154].map(c=>c*252/255+250*3/255);
  const painted = ink.map((c,i)=>c*.7+underpaint[i]*.3);
  // Store the same visible painting as RGBA rather than an opaque matte image.
  edit.data.set([...painted.map(c=>Math.round((c-250*3/255)*255/252)),252],p);
  mask[p/4] = 1;
  const policy = {minBaseAlpha:240,matte:{color:'#fafafa',tolerance:32},detailInk:{color:'#60351f',tolerance:2}};
  const locked = lockPixels(base,edit,mask,['detail'],policy,manifest);
  const component = extract(base,{info,data:locked},mask,policy,manifest);
  assert.ok(Math.abs(component[p+3]-255*.7)<=3);
  for(let i=0;i<3;i++) assert.ok(Math.abs(component[p+i]-ink[i])<=3);
  edit.data[p+3] = 239;
  assert.throws(()=>lockPixels(base,edit,mask,['detail'],policy,manifest),/No eligible changed paint/);
});

test('complete 36-frame paint passes with exact protected RGBA', () => {
  const { base, edit, mask } = fixture();
  const report = checkPixels(base, edit, mask, manifest, entry);
  assert.equal(report.valid, true); assert.equal(report.frames.length, 36);
  paint(edit, 0, 0, [1, 0, 0, 0]);
  assert.match(checkPixels(base, edit, mask, manifest, entry).errors.join('\n'), /protected RGBA/);
});

test('empty frames, missing materials and detached islands fail', () => {
  const { base, edit, mask } = fixture();
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) paint(edit, x, y, [90, 90, 90, 255]);
  paint(edit, 15, 7, [122, 90, 154, 255]); mask[7 * info.width + 15] = 1;
  const errors = checkPixels(base, edit, mask, manifest, { ...entry, materials: ['primary', 'secondary'] }).errors.join('\n');
  assert.match(errors, /Frame 0: missing paint/); assert.match(errors, /floating paint/); assert.match(errors, /missing secondary/); assert.match(errors, /outside 0.25–4× median/);
});

test('explained paired or occluded regions remain bounded and must each touch the mannequin', () => {
  const base = image(), edit = image(), mask = new Uint8Array(info.width * info.height);
  for (const frame of frames) for (const origin of [1, 5]) for (let y = 3; y < 5; y++) for (let x = origin; x < origin + 2; x++) {
    const px = frame.transform.sourceCell.left + x, py = frame.transform.sourceCell.top + y;
    paint(base, px, py, [90, 90, 90, 255]); paint(edit, px, py, [122, 90, 154, 255]); mask[py * info.width + px] = 1;
  }
  const paired = { ...entry, slot: 'footwear', validation: { maxRegions: 2, regionReason: 'Two boots, one on each foot.' } };
  assert.equal(checkPixels(base, edit, mask, manifest, paired).valid, true);
  assert.match(checkPixels(base, edit, mask, manifest, entry).errors.join('\n'), /expected one connected/);
  assert.throws(() => checkPixels(base, edit, mask, manifest, { ...entry, validation: { maxRegions: 2 } }), /explained/);
  assert.throws(() => checkPixels(base, edit, mask, manifest, { ...paired, slot: 'body' }), /mannequins/);
  // A generous component region count never legalizes a floating boot.
  for (let y = 3; y < 5; y++) for (let x = 5; x < 7; x++) paint(base, x, y, [0, 0, 0, 0]);
  assert.match(checkPixels(base, edit, mask, manifest, paired).errors.join('\n'), /floating paint/);
  paint(edit, 3, 7, [122, 90, 154, 255]); mask[7 * info.width + 3] = 1;
  assert.match(checkPixels(base, edit, mask, manifest, paired).errors.join('\n'), /expected 1–2/);
});

test('freckle regions allow sixteen attached marks without relaxing other component limits', () => {
  const base=image(), edit=image(), mask=new Uint8Array(info.width*info.height);
  for(const f of frames) for(let y=0;y<8;y++) for(let x=0;x<8;x++) {
    const px=f.transform.sourceCell.left+x, py=f.transform.sourceCell.top+y;
    paint(base,px,py,[90,154,154,255]); paint(edit,px,py,[90,154,154,255]);
    if(x%2===0&&y%2===0) {paint(edit,px,py,[40,40,40,255]);mask[py*info.width+px]=1;}
  }
  const freckles={...entry,slot:'markings',materials:['detail'],validation:{maxRegions:16,regionReason:'Separate freckle dots on the face.'}};
  assert.equal(checkPixels(base,edit,mask,manifest,freckles).valid,true);
  for(const slot of ['face','hair','body']) assert.throws(()=>checkPixels(base,edit,mask,manifest,{...freckles,slot}),/bounded/);
  assert.throws(()=>checkPixels(base,edit,mask,manifest,{...freckles,validation:{...freckles.validation,maxRegions:17}}),/bounded/);
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) {
    paint(base,x,y,[0,0,0,0]);
    if(x%2||y%2) paint(edit,x,y,[0,0,0,0]);
  }
  assert.match(checkPixels(base,edit,mask,manifest,freckles).errors.join('\n'),/floating paint/);
});

test('facing-specific occlusion allowances preserve stricter gates in other facings', () => {
  const { base, edit, mask } = fixture();
  const split = frame => {
    const cell = frame.transform.sourceCell;
    for (let y = 2; y < 6; y++) {
      const p = ((cell.top + y) * info.width + cell.left + 3) * 4;
      base.data.copy(edit.data, p, p, p + 4);
    }
  };
  for (const frame of frames.filter(frame => frame.direction === 0)) split(frame);
  const tied = { ...entry, slot: 'hair', validation: { maxRegionsByFacing: { down: 2 }, regionReason: 'Head occludes the front-facing tail connection.' } };
  assert.equal(checkPixels(base, edit, mask, manifest, tied).valid, true);
  assert.match(checkPixels(base, edit, mask, manifest, entry).errors.join('\n'), /expected one connected/);
  split(frames.find(frame => frame.direction === 1));
  assert.match(checkPixels(base, edit, mask, manifest, tied).errors.join('\n'), /Frame 9: expected one connected/);
  for (const maxRegionsByFacing of [{ down: 5 }, { sideways: 2 }, { down: 1.5 }])
    assert.throws(() => checkPixels(base, edit, mask, manifest, { ...tied, validation: { ...tied.validation, maxRegionsByFacing } }), /Facing regions/);
  assert.throws(() => checkPixels(base, edit, mask, manifest, { ...tied, slot: 'body' }), /mannequins/);
  assert.throws(() => checkPixels(base, edit, mask, manifest, { ...tied, validation: { maxRegionsByFacing: { down: 2 } } }), /explained/);
});

test('a recoloured head cannot stand in for full skin coverage', () => {
  const { base, edit, mask } = fixture();
  const body = { ...entry, slot: 'body', materials: ['skin'] };
  for (const f of frames) for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) paint(edit, f.transform.sourceCell.left + x, f.transform.sourceCell.top + y, y === 2 ? [90, 154, 154, 255] : [90, 90, 90, 255]);
  assert.match(checkPixels(base, edit, mask, manifest, body).errors.join('\n'), /full-body skin coverage/);
});

test('a connected cyan backdrop still fails mannequin silhouette validation', () => {
  const { base, edit } = fixture(), mask = new Uint8Array(info.width * info.height).fill(1);
  for (let p = 0; p < edit.data.length; p += 4) edit.data.set([90, 154, 154, 255], p);
  const report = checkPixels(base, edit, mask, manifest, { ...entry, slot: 'body', materials: ['skin'] });
  assert.ok(report.frames.every(frame => frame.coverage === 1));
  assert.match(report.errors.join('\n'), /outside the reference silhouette/);
});

test('material tinting preserves alpha, detail and luminance reference', () => {
  const raw = Buffer.from([90, 154, 154, 210, 90, 90, 90, 180]);
  const result = tintComponent(raw, { skin: [214, 160, 125] });
  assert.equal(result[3], 210); assert.deepEqual(result.subarray(4), raw.subarray(4));
  const gray = Math.round((90 * .2126 + 154 * .7152 + 154 * .0722) * 255 / 180);
  assert.equal(result[0], Math.round(gray * 214 / 255));
});

test('prompts contain version, mask region, keys and component description', () => {
  const prompt = promptFor({ ...entry, prompt: 'A round cap.' }, { region: 'only the crown' }, 7);
  for (const text of ['version 7', 'only the crown', '#7a5a9a', 'A round cap.', '1536×1024', '36 figures']) assert.ok(prompt.includes(text));
});

test('replacement erases old clothes while preserving protected RGBA and registration', () => {
  const { base, edit, mask } = fixture(), policy = { operation: 'replace' };
  paint(base, 6, 4, [90, 90, 90, 255]); mask[4 * info.width + 6] = 1; // protruding coat tail
  paint(base, 0, 0, [70, 20, 10, 0]); paint(edit, 0, 0, [200, 200, 200, 255]);
  for (let p = 0; p < edit.data.length; p += 4) if (edit.data[p + 3]) edit.data.set([90, 154, 154], p);
  const locked = { info, data: lockPixels(base, edit, mask, ['skin'], policy, manifest) };
  assert.deepEqual(locked.data.subarray(0, 4), base.data.subarray(0, 4));
  assert.equal(locked.data[(4 * info.width + 6) * 4 + 3], 0);
  const report = checkPixels(base, locked, mask, manifest, { ...entry, slot: 'body', materials: ['skin'], lock: policy });
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(report.frames[0].coverage, 1);
  assert.ok(report.frames[0].pose.silhouetteIoU < 1);
});

test('replacement rejects a connected cyan backdrop and a displaced body', () => {
  const { base, edit } = fixture(), mask = new Uint8Array(info.width * info.height).fill(1);
  const body = { ...entry, slot: 'body', materials: ['skin'], lock: { operation: 'replace' } };
  for (let p = 0; p < edit.data.length; p += 4) edit.data.set([90, 154, 154, 255], p);
  assert.match(checkPixels(base, edit, mask, manifest, body).errors.join('\n'), /pose\/head silhouette overlap/);
  edit.data.fill(0);
  for (const f of frames) for (let y = 2; y < 6; y++) for (let x = 4; x < 8; x++) paint(edit, f.transform.sourceCell.left + x, f.transform.sourceCell.top + y, [90, 154, 154, 255]);
  assert.match(checkPixels(base, edit, mask, manifest, body).errors.join('\n'), /pose\/head silhouette overlap/);
});

test('retained skin remains whole even when candidate leg pixels are byte-identical', () => {
  const { base, edit, mask } = fixture();
  for (const f of frames) for (let y = 4; y < 6; y++) for (let x = 2; x < 6; x++) {
    paint(base, f.transform.sourceCell.left + x, f.transform.sourceCell.top + y, [90, 154, 154, 255]);
    paint(edit, f.transform.sourceCell.left + x, f.transform.sourceCell.top + y, [90, 154, 154, 255]);
  }
  const policy = { keepMaterials: ['skin'], materialRegions: { skin: { from: 'waist', to: 'ground', start: 0 } } };
  const locked = { info, data: lockPixels(base, edit, mask, ['primary', 'skin'], policy, manifest) };
  assert.equal(extract(base, locked, mask)[(5 * info.width + 2) * 4 + 3], 0);
  assert.equal(extract(base, locked, mask, policy, manifest)[(5 * info.width + 2) * 4 + 3], 255);
  assert.equal(checkPixels(base, locked, mask, manifest, { ...entry, materials: ['primary', 'skin'], lock: policy }).valid, true);
});

test('a garment can carry exact registered skin without importing candidate skin drift', () => {
  const {base,edit,mask}=fixture();
  const policy={keepMaterials:['skin'],preserveMaterials:['skin'],materialRegions:{skin:{from:'waist',to:'ground',start:0}}};
  for(const f of frames)for(let y=4;y<6;y++)for(let x=2;x<6;x++) {
    paint(base,f.transform.sourceCell.left+x,f.transform.sourceCell.top+y,[90,154,154,255]);
    paint(edit,f.transform.sourceCell.left+x,f.transform.sourceCell.top+y,[45,100,100,255]);
  }
  const locked={info,data:lockPixels(base,edit,mask,['primary','skin'],policy,manifest)};
  const pixel=(5*info.width+2)*4;
  assert.deepEqual(locked.data.subarray(pixel,pixel+4),base.data.subarray(pixel,pixel+4));
  assert.equal(extract(base,locked,mask,policy,manifest)[pixel+3],255);
  assert.throws(()=>lockPixels(base,edit,mask,['primary','skin'],{...policy,operation:'replace'},manifest),/overlay/);
  assert.throws(()=>lockPixels(base,edit,mask,['primary','skin'],{preserveMaterials:['skin']},manifest),/retained regions/);
});

test('natural seams connect cap materials without importing green eyes or distant paint', () => {
  const base = image(), edit = image(), mask = new Uint8Array(info.width * info.height).fill(1);
  for (let x = 2; x < 6; x++) {
    paint(edit, x, 1, [122, 90, 154, 255]);
    paint(edit, x, 2, [90, 90, 90, 255]);
    paint(edit, x, 3, [90, 154, 106, 255]);
  }
  paint(edit, 4, 6, [90, 154, 106, 255]); // iris: same key, different object
  paint(edit, 0, 7, [90, 90, 90, 255]);
  const data = lockPixels(base, edit, mask, ['primary', 'secondary', 'skin', 'detail'], { detailReach: 1, fringeMaterials: ['skin', 'detail'], anchorMaterial: 'primary' }, manifest);
  assert.equal(data[(2 * info.width + 4) * 4 + 3], 255);
  assert.equal(data[(3 * info.width + 4) * 4 + 3], 255);
  assert.equal(data[(6 * info.width + 4) * 4 + 3], 0);
  assert.equal(data[7 * info.width * 4 + 3], 0);
});

test('bounded cleanup does not silently delete substantial disconnected paint', () => {
  const { base, edit, mask } = fixture();
  for (let x = 2; x < 6; x++) { paint(edit, x, 7, [122, 90, 154, 255]); mask[7 * info.width + x] = 1; }
  const policy = { maxSpeckPixels: 2 }, locked = { info, data: lockPixels(base, edit, mask, ['primary'], policy, manifest) };
  assert.match(checkPixels(base, locked, mask, manifest, { ...entry, lock: policy }).errors.join('\n'), /connected paint region/);
});

test('enclosed natural details keep buttons but reject exterior colour fringe and open gaps', () => {
  const base = image(), edit = image(), mask = new Uint8Array(info.width * info.height).fill(1);
  for (const f of frames) {
    const c = f.transform.sourceCell;
    for (let y = 1; y <= 6; y++) for (let x = 1; x <= 6; x++) paint(edit, c.left + x, c.top + y, [122, 90, 154, 255]);
    // A four-pixel natural button has no backdrop connection.
    for (let y = 3; y <= 4; y++) for (let x = 3; x <= 4; x++) paint(edit, c.left + x, c.top + y, [180, 170, 150, 200]);
    paint(edit, c.left + 7, c.top + 3, [210, 210, 210, 128]);
  }
  const policy = { detailEnclosedBy: 'primary' };
  const locked = lockPixels(base, edit, mask, ['primary', 'detail'], policy, manifest);
  assert.deepEqual([...locked.subarray((3 * info.width + 3) * 4, (3 * info.width + 3) * 4 + 4)], [180, 170, 150, 200]);
  assert.equal(locked[(3 * info.width + 7) * 4 + 3], 0);
  // A transparent opening connects the natural pixels to the exterior.
  for (let x = 0; x <= 2; x++) paint(edit, x, 3, [0, 0, 0, 0]);
  const open = lockPixels(base, edit, mask, ['primary', 'detail'], policy, manifest);
  assert.equal(open[(3 * info.width + 3) * 4 + 3], 0);
  assert.throws(() => lockPixels(base, edit, mask, ['detail'], policy, manifest), /declared enclosing key/);
});

test('proof resolver hides equipped hair and respects facing z-order without mutation', () => {
  const hair = { entry: { id: 'waves', slot: 'hair', zOrder: { default: 60 } } };
  const hat = { entry: { id: 'cap', slot: 'headwear', hides: ['hair'], zOrder: { default: 80 } } };
  const bag = { entry: { id: 'bag', slot: 'bag', zOrder: { default: 10, up: 85 } } };
  const input = [hat, hair, bag];
  assert.deepEqual(resolveProofPieces(input, 'down').map(p => p.entry.id), ['bag', 'cap']);
  assert.deepEqual(resolveProofPieces(input, 'up').map(p => p.entry.id), ['cap', 'bag']);
  assert.deepEqual(input, [hat, hair, bag]);
  const bun = { entry: { ...hair.entry, id: 'bun', excludes: ['headwear'] } };
  const dress = { entry: { id: 'dress', slot: 'top', occupies: ['top', 'bottom'], zOrder: { default: 40 } } };
  const trousers = { entry: { id: 'trousers', slot: 'bottom', zOrder: { default: 30 } } };
  assert.deepEqual(resolveProofPieces([hat, bun, dress, trousers], 'down').map(p => p.entry.id), ['dress', 'bun']);
  const openHat = { entry: { ...hat.entry, hides: ['hairCrown'] } };
  assert.deepEqual(resolveProofPieces([openHat, hair], 'down').map(p => p.entry.id), ['waves', 'cap']);
});

test('approved and visually reviewed staging sheets pass every frame; the rejected backdrop still fails', async () => {
  const root = resolve(import.meta.dirname, '..'), catalogue = JSON.parse(await readFile(resolve(root, 'art/source/character-kit/catalogue.json')));
  const load = path => sharp(resolve(root, path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const entry of catalogue.entries.filter(entry => entry.status === 'approved' || entry.review?.result === 'approved')) {
    const build = buildReferences(catalogue, entry.build, entry.poseSet);
    const registration = JSON.parse(await readFile(resolve(root, build.registration))), specs = JSON.parse(await readFile(resolve(root, build.masks)));
    const base = await load(entry.slot === 'body' ? build.master : build.mannequin), locked = await load(entry.locked);
    const mask = makeMask(base.info, registration, specs[entry.mask]), report = checkPixels(base, locked, mask, registration, entry);
    assert.equal(report.valid, true, `${entry.id}: ${report.errors.join('\n')}`);
    assert.equal(report.frames.length, 36); assert.equal(report.protectedDrift, 0);
    if (entry.slot === 'body') {
      const rejected = await load('art/source/character-kit/body-regular-candidate-1.png');
      const bad = { info: base.info, data: lockPixels(base, rejected, mask, entry.materials, entry.lock, registration) };
      assert.equal(checkPixels(base, bad, mask, registration, entry).valid, false);
    }
  }
});

const run = promisify(execFile);
test('CLI lock/check keeps check read-only and rejects changed provenance', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'character-kit-test-'));
  try {
    const kit = resolve(root, 'art/source/character-kit'); await mkdir(kit, { recursive: true });
    const metadata = JSON.parse(await readFile(new URL('../web/public/assets/player-layers/manifest.json', import.meta.url), 'utf8'));
    const pixels = Buffer.alloc(1536 * 1024 * 4), candidate = Buffer.from(pixels);
    for (const f of metadata.frames) {
      const c = f.transform.sourceCell, x = c.left + 80, y = c.top + 40;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        const p = ((y + dy) * 1536 + x + dx) * 4; pixels.set([90, 90, 90, 255], p); candidate.set([122, 90, 154, 255], p);
      }
    }
    const save = (data, path) => sharp(data, { raw: { width: 1536, height: 1024, channels: 4 } }).png().toFile(resolve(root, path));
    await save(pixels, 'base.png'); await save(candidate, 'candidate.png');
    metadata.sourceSha256 = createHash('sha256').update(await readFile(resolve(root, 'base.png'))).digest('hex');
    await writeFile(resolve(root, 'manifest.json'), JSON.stringify(metadata));
    const catalogue = { slots: [{id: 'headwear'}], promptVersion: 1, registration: 'manifest.json', builds: { regular: { master: 'base.png', mannequin: 'base.png' } }, entries: [{ ...entry, build: 'regular', mask: 'headwear', prompt: 'Cap', locked: 'locked.png', candidate: 'candidate.png' }] };
    await writeFile(resolve(kit, 'catalogue.json'), JSON.stringify(catalogue));
    await writeFile(resolve(kit, 'masks.json'), JSON.stringify({ headwear: { slot: 'headwear', anchor: 'head', paddingX: 1.15, paddingTop: .75, reach: .15, region: 'the crown' } }));
    const cli = async args => run(process.execPath, ['--input-type=module', '-e', `import {main} from ${JSON.stringify(new URL('./character-kit.mjs', import.meta.url).href)}; await main(${JSON.stringify(args)}, ${JSON.stringify(root)});`]);
    await cli(['kit', '--slot', 'headwear', '--rows']);
    const rows = JSON.parse(await readFile(resolve(kit, 'kits/regular/headwear/rows.json'), 'utf8'));
    assert.deepEqual(rows.rows.map(row => row.height), [258, 254, 256, 256]);
    const rowImage = await sharp(resolve(kit, 'kits/regular/headwear/base-row-1.png')).metadata();
    assert.equal(rowImage.width, 1536); assert.equal(rowImage.height, 254);
    await cli(['lock', 'test']);
    const snapshot = async () => {
      const files = await readdir(root, { recursive: true, withFileTypes: true });
      return Promise.all(files.filter(f => f.isFile()).map(async f => [resolve(f.parentPath, f.name), createHash('sha256').update(await readFile(resolve(f.parentPath, f.name))).digest('hex')]));
    };
    const before = await snapshot(), report = JSON.parse((await cli(['check', 'test'])).stdout);
    assert.equal(report.valid, true); assert.deepEqual(await snapshot(), before);
    catalogue.promptVersion = 2; await writeFile(resolve(kit, 'catalogue.json'), JSON.stringify(catalogue));
    await assert.rejects(cli(['check', 'test']), /Stale provenance: promptSha256/);

    // A second build must use its own registration and masks in every command,
    // including kit/prompt. Invalid global fallbacks expose accidental reuse.
    catalogue.registration = 'missing-global-registration.json';
    catalogue.builds.broad = { master: 'base.png', mannequin: 'base.png', registration: 'manifest.json', masks: 'broad-masks.json' };
    catalogue.entries[0].build = 'broad';
    await writeFile(resolve(root, 'broad-masks.json'), await readFile(resolve(kit, 'masks.json')));
    await rm(resolve(kit, 'masks.json'));
    await writeFile(resolve(kit, 'catalogue.json'), JSON.stringify(catalogue));
    await cli(['kit', '--slot', 'headwear', '--build', 'broad']);
    assert.equal((await sharp(resolve(kit, 'kits/broad/headwear/base.png')).metadata()).width, 1536);
    assert.match((await cli(['prompt', 'test'])).stdout, /the crown/);
    await cli(['lock', 'test']);
    assert.equal(JSON.parse((await cli(['check', 'test'])).stdout).valid, true);
    const changedMasks = JSON.parse(await readFile(resolve(root, 'broad-masks.json')));
    changedMasks.headwear.paddingX = 2;
    await writeFile(resolve(root, 'broad-masks.json'), JSON.stringify(changedMasks));
    await assert.rejects(cli(['check', 'test']), /Stale provenance: maskSha256/);
    await assert.rejects(cli(['kit', '--slot', 'headwear', '--build', 'unknown']), /Unknown build/);
    // Action kits must use their own masks/master/grid, even with broken walk references.
    catalogue.poseSets={wave:{label:'Wave',rowDescription:'rest, lift, five waves, lower, rest',frameDurations:[650,130,130,130,130,130,130,130,650]}};
    catalogue.builds.broad.poseSets={wave:{master:'base.png',mannequin:'base.png',registration:'manifest.json',masks:'broad-masks.json'}};
    catalogue.builds.broad.registration='missing-walk-grid.json';
    catalogue.builds.broad.masks='missing-walk-masks.json';
    catalogue.entries[0].poseSet='wave';
    await writeFile(resolve(kit,'catalogue.json'),JSON.stringify(catalogue));
    await cli(['kit','--slot','headwear','--build','broad','--pose-set','wave']);
    const poseKit=resolve(kit,'kits/broad/wave/headwear');
    assert.equal((await sharp(resolve(poseKit,'base.png')).metadata()).width,1536);
    assert.match(await readFile(resolve(poseKit,'prompt.txt'),'utf8'),/five waves/);
    assert.doesNotMatch(await readFile(resolve(poseKit,'prompt.txt'),'utf8'),/walking poses/);
    await cli(['lock','test','--pose-set','wave']);
    assert.equal(JSON.parse((await cli(['check','test','--pose-set','wave'])).stdout).valid,true);
    await assert.rejects(cli(['check','test','--pose-set','walk']),/belongs to pose set wave/);
    await assert.rejects(cli(['kit','--slot','headwear','--build','broad','--pose-set','missing']),/Invalid pose set/);
    catalogue.poseSets.wave.rowDescription='a different wave sequence';
    await writeFile(resolve(kit,'catalogue.json'),JSON.stringify(catalogue));
    await assert.rejects(cli(['check','test','--pose-set','wave']),/Stale provenance: poseDefinitionSha256/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('optional occluded material can disappear behind the body without weakening visible facings', () => {
  const {base,edit,mask}=fixture();
  const apron={...entry,slot:'outer',materials:['primary','secondary'],validation:{optionalMaterialFacings:{primary:['up']},materialCountByFacing:['primary'],materialReason:'Rear cloth edges are fully occluded in some poses.'}};
  for(const f of frames){const c=f.transform.sourceCell;for(let y=2;y<6;y++)for(let x=2;x<6;x++)if(f.direction===2||x>=4)paint(edit,c.left+x,c.top+y,[90,154,106,255]);}
  const c=frames[18].transform.sourceCell;paint(edit,c.left+2,c.top+2,[122,90,154,255]);
  assert.deepEqual(checkPixels(base,edit,mask,manifest,apron).errors,[]);
  for(let y=2;y<6;y++)for(let x=2;x<4;x++)paint(edit,x,y,[90,154,106,255]);
  assert.match(checkPixels(base,edit,mask,manifest,apron).errors.join(),/Frame 0: missing primary/);
  assert.throws(()=>checkPixels(base,edit,mask,manifest,{...apron,slot:'body'}),/mannequins/);
  assert.throws(()=>checkPixels(base,edit,mask,manifest,{...apron,validation:{...apron.validation,optionalMaterialFacings:{primary:['unknown']}}}),/material visibility/);
});
