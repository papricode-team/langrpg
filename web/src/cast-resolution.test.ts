// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { npcs } from './content';
import { expeditionRegions } from './expeditions';
import { getInterior, interiors } from './interiors';
import { maps } from './maps';
import { sceneDocument } from './scene-data';
import { worldResidentSpecs } from './world-life';
import { castActor, castActors, castActorsForMap, castAssets, castAssetUrl, castAtlasUrl, castCell, CAST_ART, type CastAsset } from './character-cast';
import { characterCatalogue, normalizeAvatar } from './character-recipe.mjs';
import { MODULAR_ART, NATIVE_MODULAR_ART } from './avatar-options';
import * as avatarBaker from './avatar-baker';
import type { TextureLease } from './avatar-texture-cache';
import castData from './data/character-cast.json';
import { regionAssets } from './world-map-assets';
import { bootWorld } from './test-support/world-fixture';
import { seedTexture } from './test-support/phaser-harness';
import { conversationZoom, explorationZoom } from './world-camera';
import { SceneKeys } from './world-state';

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}
interface CastAtlas {
  frames: Record<string, AtlasFrame>;
  meta: { size: { w: number; h: number }; scale: string };
}
interface CastMultiAtlas {
  textures: {
    image: string;
    frames: (AtlasFrame & { filename: string })[];
    meta: CastAtlas['meta'];
  }[];
}
const publicAssetPath = (path: string): string => resolve(process.cwd(), 'public', `.${path}`);
const readAtlas = (asset: CastAsset): CastAtlas | CastMultiAtlas =>
  JSON.parse(readFileSync(publicAssetPath(asset.atlas), 'utf8'));
const atlasPages = (atlas: CastAtlas | CastMultiAtlas) => 'textures' in atlas
  ? atlas.textures.map(page => ({ meta: page.meta, frames: page.frames.map(frame => [frame.filename, frame] as const), image: `/assets/character-cast/${page.image.split('?')[0]}` }))
  : [{ meta: atlas.meta, frames: Object.entries(atlas.frames), image: undefined }];

function checkPackedAsset(asset: CastAsset, cell: readonly [number, number]): void {
  const atlas = readAtlas(asset), pages = atlasPages(atlas);
  expect('textures' in atlas, asset.key).toBe(!!asset.multiAtlas);
  expect(pages.flatMap(page => page.frames.map(([name]) => name)).sort((a, b) => Number(a) - Number(b)), asset.key)
    .toEqual(Array.from({ length: 36 }, (_, frame) => String(frame)));
  expect(asset.textureBytes, asset.key).toBe(pages.reduce((bytes, page) => bytes + page.meta.size.w * page.meta.size.h * 4, 0));
  for (const page of pages) {
    expect(page.meta.scale, asset.key).toBe('1');
    expect(page.meta.size.w, asset.key).toBeLessThanOrEqual(2048);
    expect(page.meta.size.h, asset.key).toBeLessThanOrEqual(4096);
    expect(statSync(publicAssetPath(page.image ?? asset.image)).size, asset.key)
      .toBeLessThanOrEqual(2 * 1024 * 1024);
    for (const [, frame] of page.frames) {
      expect(frame.sourceSize, asset.key).toEqual({ w: cell[0], h: cell[1] });
      expect(frame.trimmed, asset.key).toBe(true);
      expect(frame.spriteSourceSize.w, asset.key).toBe(frame.frame.w);
      expect(frame.spriteSourceSize.h, asset.key).toBe(frame.frame.h);
      expect(frame.spriteSourceSize.x + frame.spriteSourceSize.w, asset.key).toBeLessThanOrEqual(cell[0]);
      expect(frame.spriteSourceSize.y + frame.spriteSourceSize.h, asset.key).toBeLessThanOrEqual(cell[1]);
      expect(frame.frame.x + frame.frame.w, asset.key).toBeLessThanOrEqual(page.meta.size.w);
      expect(frame.frame.y + frame.frame.h, asset.key).toBeLessThanOrEqual(page.meta.size.h);
    }
  }
}

describe('complete native-detail in-game cast', () => {
  it('covers every story character, expedition character, background resident and authored resident', () => {
    const expected = [
      ...npcs.map(actor => ({ ...actor, mapId: null })),
      ...expeditionRegions.flatMap(region => region.npcs.map(actor => ({ ...actor, mapId: region.id }))),
      ...Object.entries(worldResidentSpecs).flatMap(([mapId, residents]) => residents.map(actor => ({ ...actor, mapId }))),
      ...Object.entries(sceneDocument.maps).flatMap(([mapId, scene]) => (scene.residents ?? []).map(actor => ({ ...actor, mapId }))),
    ];
    expect(expected).toHaveLength(192);
    expect(new Set(expected.map(actor => actor.id)).size).toBe(expected.length);
    expect(castActors.map(actor => actor.id).sort()).toEqual(expected.map(actor => actor.id).sort());
    for (const person of expected) {
      expect(castActor(person.id), person.id).toMatchObject({ name: person.name, mapId: person.mapId });
    }
    for (const room of interiors) for (const person of room.npcs) {
      expect(castActorsForMap(null).some(actor => actor.id === person.id), `${room.id}/${person.id}`).toBe(true);
    }
  });

  it('publishes the same native-detail component revision as the customizable player', () => {
    expect(castCell).toEqual([384, 576]);
    expect(castData.assetVersion).toBe(characterCatalogue.assetVersion);
    expect(CAST_ART.bodyHeight).toBeGreaterThanOrEqual(404);
    for (const actor of castActors) expect(actor.recipe, actor.id).toBeDefined();
  });

  it('streams every local walk and action asset before creating playable destination residents', () => {
    for (const map of maps) {
      const loaded = new Set(regionAssets(map).map(asset => asset.key));
      for (const actor of castActorsForMap(map.id)) for (const asset of castAssets(actor)) {
        expect(loaded.has(asset.key), `${map.id}/${asset.key}`).toBe(true);
      }
    }
  });

  it('retains full frame geometry and all facings when transparent padding is packed away', () => {
    for (const actor of castActors) for (const asset of castAssets(actor)) {
      checkPackedAsset(asset, castCell);
    }
  });

  it('uses the original canvas for Phaser origins and hit targets across differently trimmed poses', async () => {
    const actor = castActor('marta')!;
    const atlas = readAtlas(actor), pages = atlasPages(atlas);
    const { town } = await bootWorld({ seed: game => {
      const images = pages.map(page => Object.assign(document.createElement('canvas'), {
        width: page.meta.size.w, height: page.meta.size.h,
      }));
      // Real Phaser parses either JSON-hash or multi-atlas metadata, including
      // the source index and transparent offsets of every packed frame.
      game.textures.addAtlas(actor.key, images as unknown as HTMLImageElement[], atlas);
    } });
    const person = town.characters.get(actor.id);
    expect(person.componentCast).toBe(true);
    for (const frame of [0, 9, 18, 27, 35]) {
      town.setCharacterFrame(person, frame);
      expect(person.figure.width).toBe(CAST_ART.width);
      expect(person.figure.height).toBe(CAST_ART.height);
      expect(person.figure.displayOriginX).toBe(CAST_ART.width / 2);
      expect(person.figure.displayOriginY).toBeCloseTo(CAST_ART.height * CAST_ART.footY);
      expect(person.figure.displayHeight).toBeCloseTo(CAST_ART.height * person.artScale);
      expect(person.figure.frame.sourceIndex).toBe(pages.findIndex(page => page.frames.some(([name]) => name === String(frame))));
    }
    town.resizeHitTargets();
    expect(person.figure.input.hitArea.bottom).toBeCloseTo(CAST_ART.height * CAST_ART.footY);
  });

  it('composes a failed offline NPC from its exact HD recipe while preserving current facing and room scale', async () => {
    const { town, game } = await bootWorld();
    let finish!: (lease: TextureLease<string>) => void;
    const baker = vi.mocked(avatarBaker.bakeAvatarTexture);
    baker.mockClear().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const actor = castActor('greta')!;
    const person = town.createCharacter(actor.id, actor.name, 300, 300, town.local.avatar, 'Inn host');
    expect(person.npc).toBe(true);
    expect(person.modularNpc).toBe(true);
    expect(person.componentCast).toBe(false);
    expect(person.figure.visible).toBe(false);
    expect(person.figure.texture.key).toBe('__WHITE');
    expect(baker).toHaveBeenCalledWith(town, normalizeAvatar(actor.recipe), { resolution: 'runtime' });
    person.facing = 3;
    town.setCharacterFrame(person, 27);
    Object.defineProperty(town, 'indoor', { value: true, configurable: true });
    town.fitCharacterToRoom(person);
    const scale = person.artScale;
    const lease = { value: 'hd-greta-fallback', release: vi.fn() };
    seedTexture(game, lease.value, Array.from({ length: 36 }, (_, frame) => frame), MODULAR_ART.width, MODULAR_ART.height);
    finish(lease);
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
    expect(person.figure.texture.key).toBe(lease.value);
    expect(person.figure.visible).toBe(true);
    expect(person.figure.frame.name).toBe(27);
    expect(person.figure.originY).toBe(MODULAR_ART.footY);
    expect(person.figure.scaleY).toBe(scale);
    expect(person.figure.height).toBe(MODULAR_ART.height);
    person.root.destroy();
    expect(lease.release).toHaveBeenCalledWith(true);
  });

  it('keeps future regional residents on the HD compositor and retries failed component downloads', async () => {
    const { town, game } = await bootWorld();
    const baker = vi.mocked(avatarBaker.bakeAvatarTexture);
    baker.mockClear().mockRejectedValueOnce(new Error('Temporary component download failure'));
    const suppliedAvatar = { hair: '#714830', skin: '#c99167', outfit: '#b38b3f' };
    const person = town.createCharacter('future-regional-neighbor', 'Neighbor', 300, 300, suppliedAvatar, 'Neighbor', 8, 8);
    expect(person.npc).toBe(true);
    expect(person.modularNpc).toBe(true);
    expect(person.walkingAnimation).toBeUndefined();
    expect(person.figure.visible).toBe(false);
    expect(baker).toHaveBeenCalledWith(town, normalizeAvatar(suppliedAvatar), { resolution: 'runtime' });
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
    expect(person.avatarPending).toBe(false);
    expect(person.avatarRetryAt).toBeGreaterThan(town.time.now);
    expect(person.figure.visible).toBe(false);
    const lease = { value: 'hd-neighbor-retry', release: vi.fn() };
    seedTexture(game, lease.value, Array.from({ length: 36 }, (_, frame) => frame), MODULAR_ART.width, MODULAR_ART.height);
    baker.mockResolvedValue(lease);
    person.avatarRetryAt = town.time.now;
    town.animateCharacter(person, 1, 0, 1);
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
    expect(baker).toHaveBeenCalledTimes(2);
    expect(person.figure.texture.key).toBe(lease.value);
    expect(person.figure.visible).toBe(true);
    expect(Math.floor(Number(person.figure.frame.name) / 9)).toBe(1);
    person.root.destroy();
    expect(lease.release).toHaveBeenCalledWith(true);
  });

  it('releases a fallback NPC bake that completes after the character leaves', async () => {
    const { town } = await bootWorld();
    let finish!: (lease: TextureLease<string>) => void;
    vi.mocked(avatarBaker.bakeAvatarTexture).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const person = town.createCharacter('future-departed-neighbor', 'Neighbor', 300, 300, town.local.avatar, undefined, 3, 3);
    expect(person.npc).toBe(true);
    person.root.destroy();
    const lease = { value: 'late-hd-npc', release: vi.fn() };
    finish(lease);
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
    expect(lease.release).toHaveBeenCalledWith(true);
    expect(person.avatarLease).toBeUndefined();
  });

  it('keeps activity residents hidden while their HD walk bake is pending', async () => {
    const { town } = await bootWorld();
    const person = town.activityResidents[0].character;
    const previous = person.avatarLease;
    previous?.release(true);
    person.avatarLease = undefined;
    person.avatarPending = true;
    person.figure.setTexture('__WHITE').setVisible(false);
    town.cameras.main.worldView.setTo(0, 0, town.worldWidth, town.worldHeight);
    town.updateActivityResidents();
    expect(person.figure.visible).toBe(false);
    expect(person.modularNpc).toBe(true);
  });

  it('provides native indoor aliases for all shared characters and every room resident', () => {
    expect(castActorsForMap(null)).toHaveLength(9);
    for (const actor of castActorsForMap(null)) {
      expect(actor.native, actor.id).toBeDefined();
      const asset = actor.native!;
      expect(asset.cell, actor.id).toEqual([512, 768]);
      checkPackedAsset(asset, asset.cell);
    }
    for (const room of interiors) for (const person of room.npcs) {
      expect(castActor(person.id)?.native?.cell, `${room.id}/${person.id}`).toEqual([512, 768]);
    }
    const inn = getInterior('inn');
    const zoom = conversationZoom(explorationZoom(1440 * 2, 900 * 2, 2, true, inn.characterHeight,
      { width: inn.width, height: inn.height }).zoom, true);
    expect(NATIVE_MODULAR_ART.bodyHeight).toBeGreaterThanOrEqual(inn.characterHeight! * zoom);
  });

  it('uses native cast and player frames in the inn and releases the native room atlas on exit', async () => {
    const actor = castActor('greta')!;
    const fixture = await bootWorld({ motion: 'reduced', seed: game => {
      const frames = Array.from({ length: 36 }, (_, frame) => frame);
      seedTexture(game, actor.key, frames, CAST_ART.width, CAST_ART.height);
      seedTexture(game, actor.native!.key, frames, NATIVE_MODULAR_ART.width, NATIVE_MODULAR_ART.height);
    } });
    fixture.world.enterInterior('inn');
    await fixture.until(() => fixture.room().ready && !!fixture.room().local.avatarLease);
    const room = fixture.room(), host = room.characters.get(actor.id);
    expect(host.componentCast).toBe(true);
    expect(host.nativePixels).toBe(true);
    expect(host.figure.texture.key).toBe(actor.native!.key);
    for (const person of [host, room.local]) {
      expect(person.figure.width).toBe(512);
      expect(person.figure.height).toBe(768);
      expect(person.figure.displayOriginY).toBeCloseTo(768 * NATIVE_MODULAR_ART.footY);
      expect(person.artScale * NATIVE_MODULAR_ART.bodyHeight).toBeCloseTo(getInterior('inn').characterHeight!);
    }
    fixture.world.leaveInterior();
    await fixture.until(() => fixture.game.scene.getScene(SceneKeys.World).sys.isActive());
    expect(fixture.game.textures.exists(actor.native!.key)).toBe(false);
    expect(fixture.game.textures.exists(actor.key)).toBe(true);
    expect(fixture.town.local.figure.height).toBe(MODULAR_ART.height);
  });

  it('composes native indoor fallback frames when the room cast download fails', async () => {
    const fixture = await bootWorld({ motion: 'reduced' });
    const actor = castActor('greta')!;
    const atlasLoad = vi.spyOn(fixture.room().load, 'atlas');
    const multiAtlasLoad = vi.spyOn(fixture.room().load, 'multiatlas');
    fixture.world.enterInterior('inn');
    await fixture.until(() => fixture.room().ready && !!fixture.room().characters.get(actor.id)?.avatarLease);
    const room = fixture.room(), host = room.characters.get(actor.id);
    expect(host.componentCast).toBe(false);
    expect(host.modularNpc).toBe(true);
    expect(host.nativePixels).toBe(true);
    expect(host.figure.visible).toBe(true);
    expect(host.figure.texture.key).toContain(':editor');
    expect(host.figure.height).toBe(768);
    expect(host.figure.width).toBe(512);
    expect(host.artScale * NATIVE_MODULAR_ART.bodyHeight).toBeCloseTo(getInterior('inn').characterHeight!);
    expect(avatarBaker.bakeAvatarTexture).toHaveBeenCalledWith(room, normalizeAvatar(actor.recipe), { resolution: 'editor' });
    if (actor.native!.multiAtlas) {
      expect(multiAtlasLoad).toHaveBeenCalledWith(actor.native!.key, castAtlasUrl(actor.native!), '/assets/character-cast/');
    } else {
      expect(atlasLoad).toHaveBeenCalledWith(actor.native!.key, castAssetUrl(actor.native!), castAtlasUrl(actor.native!));
    }
  });
});
