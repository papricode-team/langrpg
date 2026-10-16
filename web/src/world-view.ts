/**
 * Draws one town region with the play renderers and nothing else: the painted ground, its features and the
 * scenery, as a player sees them. Tools screenshot it to check world edits (`tools/world-mcp`, `world:view`).
 *
 *   /world-view.html?town=lindenhafen&x=0&y=0&width=1152&height=768&scale=1&period=day&hour=12
 *
 * The world comes from `window.__WORLD_DOCUMENT__` when a tool injects a draft, otherwise from the server.
 * `window.__WORLD_VIEW__` reports `{ready, error}`.
 */
import * as Phaser from 'phaser';
import {GroundTerrain} from './ground-terrain';
import {getMap,type MapId} from './maps';
import {getWorldScene,loadPublishedWorld,replacePublishedWorld} from './scene-data';
import type {WorldSceneDocument} from './scene-schema';
import {WorldAnimationAssets} from './world-animation-assets';
import {WorldMapAssets} from './world-map-assets';
import {timeAmbient} from './world-lighting';
import {WorldScenery} from './world-scenery';

declare global {
  interface Window {
    __WORLD_DOCUMENT__?: WorldSceneDocument;
    __WORLD_VIEW__?: {ready: boolean; error?: string};
  }
}

const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => {
  const value = Number(params.get(name));
  return params.has(name) && Number.isFinite(value) ? value : fallback;
};
const status = window.__WORLD_VIEW__ = {ready: false} as {ready: boolean; error?: string};

class WorldViewScene extends Phaser.Scene {
  constructor() { super('world-view'); }
  async create(): Promise<void> {
    const mapId = (params.get('town') ?? 'lindenhafen') as MapId;
    const period = params.get('period') === 'night' ? 'night' : 'day';
    const town = getWorldScene(mapId);
    const region = {x: number('x', 0), y: number('y', 0), width: number('width', town.width), height: number('height', town.height)};
    const camera = this.cameras.main;
    camera.setZoom(this.scale.width / region.width).centerOn(region.x + region.width / 2, region.y + region.height / 2);
    await new Promise<void>(resolve => new WorldMapAssets(this, true).load(getMap(mapId), resolve));
    await new Promise<void>(resolve => new WorldAnimationAssets(this).load(mapId, period, () => resolve()));
    // The ground takes the hour's ambient light, as in play: noon by day, late evening by night.
    const hour = number('hour', period === 'night' ? 22 : 12);
    const terrain = new GroundTerrain(this, town, period).setDepth(-1e6).setTint(timeAmbient(mapId, hour, period).terrain);
    new WorldScenery(this, mapId, period);
    // Materials, features and object art load after construction; report ready once nothing is pending.
    let quiet = 0;
    this.events.on(Phaser.Scenes.Events.UPDATE, () => {
      quiet = terrain.ready && !this.load.isLoading() ? quiet + 1 : 0;
      if (quiet === 10) status.ready = true;
    });
  }
}

async function start(): Promise<void> {
  if (window.__WORLD_DOCUMENT__) replacePublishedWorld(window.__WORLD_DOCUMENT__, 'draft');
  else await loadPublishedWorld();
  const town = getWorldScene(params.get('town') ?? 'lindenhafen');
  const width = number('width', town.width), height = number('height', town.height), scale = number('scale', 1);
  new Phaser.Game({type: Phaser.WEBGL, parent: 'view', width: Math.round(width * scale), height: Math.round(height * scale),
    backgroundColor: '#000000', banner: false, audio: {noAudio: true}, scene: [WorldViewScene]});
}

start().catch(error => { status.error = error instanceof Error ? error.message : String(error); });
