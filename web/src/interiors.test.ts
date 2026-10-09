import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { npcs, quests } from './content';
import { buildingEntrances, createInteriorNavigation, getInterior, getInteriorObject, interiorExercises, interiors, type InteriorId } from './interiors';
import { getMap, storyMaps as maps } from './maps';
import { createMapNavigation, MAP_HEIGHT, MAP_WIDTH, NavigationGrid, type MapPoint } from './navigation';
import type { SceneryAnimationManifest } from './scenery-animation';
import { INTERIOR_CHARACTER_HEIGHT } from './character-art';

const pixels = (point: MapPoint): MapPoint => ({ x: point.x * MAP_WIDTH, y: point.y * MAP_HEIGHT });

function expectReachable(navigation: NavigationGrid, start: MapPoint, destination: MapPoint, label: string): void {
  expect(navigation.isWalkable(destination.x, destination.y), `${label} approach is blocked; nearest pavement ${JSON.stringify(navigation.closestPoint(destination.x, destination.y))}`).toBe(true);
  const route = navigation.findPath(start, destination);
  expect(route.length, `${label} has no route from the entrance`).toBeGreaterThan(0);
  expect(route.at(-1)).toEqual(destination);
  let previous = start;
  for (const point of route) {
    const samples = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y)));
    for (let sample = 0; sample <= samples; sample++) {
      const ratio = sample / samples;
      expect(navigation.isWalkable(previous.x + (point.x - previous.x) * ratio, previous.y + (point.y - previous.y) * ratio), `${label} path crosses furniture or walls`).toBe(true);
    }
    previous = point;
  }
}

describe('enterable learning spaces', () => {
  it.each(maps)('offers all three stores on connected streets in $name', map => {
      const navigation = createMapNavigation(map.id);
      const start = pixels(getMap(map.id).spawn);
      const entrances = buildingEntrances(map.id);
      expect(entrances.map(entrance => entrance.interiorId)).toEqual(['cafe', 'bakery', 'supermarket']);
      expect(new Set(entrances.map(entrance => entrance.id)).size).toBe(3);
      for (const entrance of entrances) {
        expect(entrance.id).toBe(`building:${entrance.interiorId}`);
        expectReachable(navigation, start, pixels(entrance), `${map.name} ${entrance.label}`);
      }
  });

  it('keeps room arrival, every conversation, every station, and the exit connected', () => {
    for (const interior of interiors) {
      const navigation = createInteriorNavigation(interior.id);
      const start = pixels(interior.spawn);
      expect(navigation.isWalkable(start.x, start.y)).toBe(true);
      expectReachable(navigation, start, pixels(interior.exit), `${interior.name} exit`);
      for (const object of interior.objects) expectReachable(navigation, start, pixels(object), object.label);
      for (const npc of interior.npcs) expectReachable(navigation, start, pixels(npc), `${interior.name} ${npc.id}`);
      const backWallY = interior.id === 'cafe' ? 200 : interior.id === 'bakery' ? 120 : 180;
      expect(navigation.isWalkable(768, backWallY), `${interior.name} back wall must block movement`).toBe(false);
      expect(navigation.isWalkable(80, 650), `${interior.name} side wall must block movement`).toBe(false);
    }
  });

  it('routes around solid furniture while leaving the central aisle open', () => {
    const aisle: Record<InteriorId, MapPoint> = {
      cafe: { x: 500, y: 785 }, bakery: { x: 950, y: 785 }, supermarket: { x: 1250, y: 785 },
    };
    for (const interior of interiors) {
      const navigation = createInteriorNavigation(interior.id);
      const start = pixels(interior.spawn);
      expectReachable(navigation, start, aisle[interior.id], `${interior.name} central aisle`);
      const architecture = new NavigationGrid(interior.walkableAreas, interior.barriers);
      for (const prop of interior.props) {
        if (!prop.collision) continue;
        const { x, y, width, height } = prop.collision;
        // Ground furniture on the painted floor, rather than accidentally
        // treating a wall or a void as a furniture collision that passes QA.
        for (const [cornerX, cornerY] of [[x,y],[x+width,y],[x+width,y+height],[x,y+height]]) {
          expect(architecture.isWalkable(cornerX, cornerY), `${prop.id} foundation leaves the architectural floor`).toBe(true);
        }
        const point = { x: x + width / 2, y: y + height / 2 };
        expect(navigation.isWalkable(point.x, point.y)).toBe(false);
        const edge = navigation.closestPoint(point.x, point.y);
        expectReachable(navigation, start, edge, `${prop.id} furniture edge`);
      }
    }
  });

  it('follows the café nook, bakery kitchen doorway, and supermarket stockroom walls', () => {
    const cafe = createInteriorNavigation('cafe');
    expect(cafe.isWalkable(1200, 400), 'the café cutout is outside its L-shaped floor').toBe(false);
    expect(cafe.isWalkable(1040, 450), 'the café northeast wall blocks feet').toBe(false);
    expect(cafe.isWalkable(500, 900), 'the café south wall blocks feet').toBe(false);
    expectReachable(cafe, pixels(getInterior('cafe').spawn), { x: 1250, y: 730 }, 'café window nook');
    const bakery = createInteriorNavigation('bakery');
    expect(bakery.isWalkable(300, 420), 'the retail wing does not extend behind the kitchen').toBe(false);
    expect(bakery.isWalkable(650, 460), 'the kitchen partition is solid').toBe(false);
    expect(bakery.isWalkable(905, 475), 'the partition doorway stays open').toBe(true);
    expect(bakery.isWalkable(600, 900), 'the bakery south wall blocks feet').toBe(false);
    expectReachable(bakery, pixels(getInterior('bakery').spawn), { x: 900, y: 240 }, 'bakery rear kitchen');
    const supermarket = createInteriorNavigation('supermarket');
    expect(supermarket.isWalkable(520, 350), 'stockroom east wall').toBe(false);
    expect(supermarket.isWalkable(200, 430), 'stockroom south wall').toBe(false);
    expect(supermarket.isWalkable(300, 435), 'stockroom doorway').toBe(true);
    expect(supermarket.isWalkable(700, 890), 'the supermarket south wall blocks feet').toBe(false);
    expectReachable(supermarket, pixels(getInterior('supermarket').spawn), { x: 290, y: 300 }, 'supermarket stockroom');
  });

  it('connects each animated learning prop and resident to a real encounter', () => {
    const npcIds = new Set(npcs.map(npc => npc.id));
    const allIds = interiors.flatMap(interior => interior.objects.map(object => object.id));
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const interior of interiors) {
      const objectIds = new Set(interior.objects.map(object => object.id));
      for (const prop of interior.props) if (prop.interactive) expect(objectIds.has(prop.interactive), `${prop.id} encounter`).toBe(true);
      for (const npc of interior.npcs) {
        expect(npcIds.has(npc.id)).toBe(true);
        expect(objectIds.has(npc.interactionId)).toBe(true);
        expect(getInteriorObject(npc.interactionId)?.npcId).toBe(npc.id);
      }
      expect(getInterior(interior.id)).toBe(interior);
    }
    expect(getInteriorObject('missing-object')).toBeUndefined();
  });

  it('builds short contextual sessions entirely from server-graded expressions', () => {
    const graded = new Set(quests.flatMap(quest => quest.exercises.map(exercise => exercise.id)));
    const exported = new Set(interiorExercises.map(exercise => exercise.id));
    expect(exported.size).toBe(interiorExercises.length);
    for (const interior of interiors) {
      expect(interior.objects.length).toBe(4);
      for (const object of interior.objects) {
        expect(object.exerciseIds.length).toBe(3);
        expect(new Set(object.exerciseIds).size).toBe(3);
        expect(object.vocabulary.length).toBeGreaterThanOrEqual(3);
        expect(object.sessionTitle.length).toBeGreaterThan(0);
        for (const id of object.exerciseIds) {
          expect(graded.has(id), `${object.id} uses an ungraded expression`).toBe(true);
          expect(exported.has(id)).toBe(true);
        }
        for (const word of object.vocabulary) {
          expect(['der', 'die', 'das']).toContain(word.article);
          expect(word.lemma.length).toBeGreaterThan(0);
          expect(word.plural.length).toBeGreaterThan(0);
          expect(word.english.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

interface InteriorAtlas {
  frames: Record<string, {
    frame: { x: number; y: number; w: number; h: number };
    rotated: boolean;
    trimmed: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number };
    sourceSize: { w: number; h: number };
  }>;
  meta: { image: string; size: { w: number; h: number } };
}

const artifactJson = import.meta.glob('../public/assets/interior*.json', { eager: true, import: 'default' });
const assetPath = (name: string): string => decodeURIComponent(new URL(`../public/assets/${name}`, import.meta.url).pathname);
const readJson = <T>(name: string): T => artifactJson[`../public/assets/${name}`] as T;

describe('authored interior artwork contract', () => {
  it('keeps counters, tables and tabletop goods below adult height using isolated corrected stills', async () => {
    const stills = readJson<SceneryAnimationManifest>('interior-stills.json');
    const original = readJson<SceneryAnimationManifest>('interior-animations.json');
    const atlas = readJson<InteriorAtlas>('interior-proportioned.json');
    expect(Object.keys(stills.assets)).toHaveLength(6);
    expect(Object.keys(atlas.frames)).toHaveLength(6);
    const image = await sharp(assetPath(atlas.meta.image)).raw().toBuffer({ resolveWithObject: true });
    expect(image.info.channels).toBe(4);
    for (const animation of Object.values(stills.assets)) {
      expect(animation.frames).toHaveLength(1);
      const frame = atlas.frames[animation.frames[0]].frame;
      expect([frame.w, frame.h]).toEqual([animation.width, animation.height]);
      expect([animation.originX, animation.originY].every(value => value >= 0 && value <= 1)).toBe(true);
      const rgba = await sharp(image.data, { raw: image.info }).extract({ left: frame.x, top: frame.y, width: frame.w, height: frame.h }).raw().toBuffer();
      expect(new Uint8Array(rgba).some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
      expect(new Uint8Array(rgba).some((value, index) => index % 4 === 3 && value > 100)).toBe(true);
    }
    for (const room of interiors) for (const prop of room.props) {
      const art = stills.assets[prop.asset] ?? original.assets[prop.asset];
      const height = prop.width * art.height / art.referenceWidth;
      if (['bakery-counter', 'checkout', 'pastry-case'].includes(prop.asset)) expect(height, `${prop.id} towers above people`).toBeLessThan(INTERIOR_CHARACTER_HEIGHT * .9);
      if (prop.asset === 'cafe-table') expect(height).toBeLessThan(INTERIOR_CHARACTER_HEIGHT * .8);
      if (prop.asset === 'cup') expect(height).toBeLessThan(INTERIOR_CHARACTER_HEIGHT * .12);
    }
  });

  it('keeps animated steam and flames separate from solid furniture with native alpha and shared emitter pivots', async () => {
    const manifest = readJson<SceneryAnimationManifest>('interior-effect-animations.json');
    const atlas = readJson<InteriorAtlas>('interior-effects.json');
    const { data, info } = await sharp(assetPath(atlas.meta.image)).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect([info.width, info.height]).toEqual([atlas.meta.size.w, atlas.meta.size.h]);
    expect(Object.keys(atlas.frames)).toHaveLength(8);
    expect(Object.keys(manifest.assets)).toEqual(['steam', 'flame']);
    for (const animation of Object.values(manifest.assets)) {
      expect([animation.originX, animation.originY].every(value => value >= 0 && value <= 1)).toBe(true);
      const hashes = new Set<string>();
      for (const frameName of animation.frames) {
        const frame = atlas.frames[frameName].frame;
        expect([frame.w, frame.h]).toEqual([animation.width, animation.height]);
        const pixels = await sharp(data, { raw: info }).extract({ left: frame.x, top: frame.y, width: frame.w, height: frame.h }).raw().toBuffer();
        let clear = 0, visible = 0, translucent = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] === 0) clear++;
          if (pixels[index] > 32) visible++;
          if (pixels[index] > 0 && pixels[index] < 255) translucent++;
        }
        expect(clear).toBeGreaterThan(0);
        expect(translucent).toBeGreaterThan(0);
        expect(visible).toBeGreaterThan(0);
        hashes.add(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)), byte => byte.toString(16).padStart(2, '0')).join(''));
      }
      expect(hashes.size).toBe(4);
    }
    for (const room of interiors) for (const prop of room.props) for (const effect of prop.effects ?? []) {
      expect(manifest.assets[effect.asset]).toBeDefined();
      expect(effect.width).toBeGreaterThan(0);
      expect(effect.alpha).toBeGreaterThan(0);
      expect(effect.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('resolves every placed prop to an available animated atlas and every room to a full painting', async () => {
    const manifest = readJson<SceneryAnimationManifest>('interior-animations.json');
    expect(manifest.version).toBe(1);
    expect(manifest.framesPerAsset).toBe(4);
    expect(Object.keys(manifest.assets)).toHaveLength(30);
    const props = interiors.flatMap(interior => [...interior.props]);
    expect(props.length).toBeGreaterThan(Object.keys(manifest.assets).length);
    expect(new Set(props.map(prop => prop.id)).size).toBe(props.length);
    expect([...new Set(props.map(prop => prop.asset))].every(asset => asset in manifest.assets)).toBe(true);
    const sheets = [...new Set(props.map(prop => prop.sheet))];
    expect(sheets).toHaveLength(5);
    const atlases = new Map(sheets.map(sheet => [sheet, readJson<InteriorAtlas>(`${sheet}.json`)]));
    for (const prop of props) {
      const animation = manifest.assets[prop.asset];
      expect(animation, `missing authored animation for ${prop.id}`).toBeDefined();
      expect(animation.key).toBe(prop.sheet);
      expect(animation.frames).toHaveLength(4);
      for (const frame of animation.frames) expect(atlases.get(prop.sheet)?.frames[frame], `${prop.id} missing ${frame}`).toBeDefined();
    }
    await Promise.all(interiors.map(async interior => {
      const metadata = await sharp(assetPath(interior.asset.split('/').at(-1)!)).metadata();
      expect([metadata.width, metadata.height], `${interior.name} room dimensions`).toEqual([1536, 1024]);
      expect(metadata.format).toBe('webp');
    }));
  });

  it('provides 120 distinct painted frames with native alpha and a fixed canvas and pivot per cycle', async () => {
    const manifest = readJson<SceneryAnimationManifest>('interior-animations.json');
    const sheets = [...new Set(Object.values(manifest.assets).map(animation => animation.key))];
    const loaded = await Promise.all(sheets.map(async sheet => {
      const atlas = readJson<InteriorAtlas>(`${sheet}.json`);
      expect(atlas.meta.image).toBe(`${sheet}.webp`);
      const image = await sharp(assetPath(atlas.meta.image)).raw().toBuffer({ resolveWithObject: true });
      expect(image.info.channels, `${sheet} needs native alpha`).toBe(4);
      expect([image.info.width, image.info.height]).toEqual([atlas.meta.size.w, atlas.meta.size.h]);
      expect(Object.keys(atlas.frames)).toHaveLength(24);
      return { sheet, atlas, image };
    }));
    const decoded = new Map(loaded.map(sheet => [sheet.sheet, sheet]));
    const allFrameNames = new Set<string>();
    const allFrameHashes = new Set<string>();
    for (const [asset, animation] of Object.entries(manifest.assets)) {
      const { atlas, image } = decoded.get(animation.key)!;
      expect(animation.frames).toHaveLength(4);
      expect(new Set(animation.frames).size).toBe(4);
      expect(animation.fps).toBeGreaterThan(0);
      expect(animation.fps).toBeLessThanOrEqual(3);
      expect(animation.referenceWidth).toBeGreaterThan(0);
      expect([animation.originX, animation.originY].every(value => Number.isFinite(value) && value >= 0 && value <= 1), `${asset} has an invalid shared pivot`).toBe(true);
      const cycleHashes = new Set<string>();
      for (const frameName of animation.frames) {
        const frame = atlas.frames[frameName];
        expect(frame, `${asset} missing ${frameName}`).toBeDefined();
        expect(frame.rotated).toBe(false);
        expect(frame.trimmed).toBe(false);
        expect(frame.sourceSize).toEqual({ w: animation.width, h: animation.height });
        expect(frame.spriteSourceSize).toEqual({ x: 0, y: 0, w: animation.width, h: animation.height });
        expect([frame.frame.w, frame.frame.h]).toEqual([animation.width, animation.height]);
        expect(frame.frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.frame.x + frame.frame.w).toBeLessThanOrEqual(image.info.width);
        expect(frame.frame.y + frame.frame.h).toBeLessThanOrEqual(image.info.height);
        // Hash only this frame's RGBA pixels. Atlas coordinates alone cannot
        // distinguish real painted animation from repeated copies of one pose.
        const rgba = new Uint8Array(frame.frame.w * frame.frame.h * 4);
        let transparent = 0, visible = 0;
        for (let y = 0; y < frame.frame.h; y++) {
          const start = ((frame.frame.y + y) * image.info.width + frame.frame.x) * 4;
          const row = image.data.subarray(start, start + frame.frame.w * 4);
          rgba.set(row, y * frame.frame.w * 4);
          for (let x = 3; x < row.length; x += 4) {
            if (row[x] === 0) transparent++;
            if (row[x] > 32) visible++;
          }
        }
        expect(transparent, `${frameName} lacks transparent surroundings`).toBeGreaterThan(0);
        expect(visible, `${frameName} is empty`).toBeGreaterThan(0);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba)), byte => byte.toString(16).padStart(2, '0')).join('');
        cycleHashes.add(digest);
        allFrameHashes.add(digest);
        allFrameNames.add(frameName);
      }
      expect(cycleHashes.size, `${asset} repeats painted frames`).toBe(4);
    }
    expect(allFrameNames.size).toBe(120);
    expect(allFrameHashes.size).toBe(120);
  });
});
