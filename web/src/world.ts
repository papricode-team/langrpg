import * as Phaser from 'phaser';
import { npcs } from './content';
import { createMapNavigation, NavigationGrid } from './navigation';
import type { MapPoint } from './navigation';
import { getMap, maps, type MapId, type WorldObjectSpec, type WorldMapSpec } from './maps';
import { NPC_ART, PLAYER_ART, PLAYER_LAYERS, INTERIOR_CHARACTER_HEIGHT, characterArtScale, paintAvatarPreview, playerMaterialShadows, prepareCharacterArt } from './character-art';
import { createWorldResidents, sampleResidentMotion } from './world-life';
import { WorldScenery } from './world-scenery';
import { createScreenFilter, type ScreenFilterController } from './screen-filters';
import { normalizeScreenFilterSettings, type ScreenFilterSettings } from './screen-filter-settings';
import { WorldMapAssets, regionPeopleKey, hasRegionPeople } from './world-map-assets';
import { getExpeditionNpc } from './expeditions';
import { worldAmbient } from './world-lighting';
import { sceneryAnimationManifestKey, sceneryAnimationTextureKeys, sceneryTerrainKey, sampleSceneryFrame, type SceneryAnimation, type SceneryAnimationManifest } from './scenery-animation';
import { WorldClock, type WorldPeriod, type WorldTimeOptions, type WorldTimeState } from './world-clock';
import { buildingEntrances, createInteriorNavigation, getInterior, interiors, type InteriorId, type InteriorSpec } from './interiors';
import { WorldInterior } from './world-interior';

export interface Avatar {
  hair: string;
  skin: string;
  outfit: string;
}

export interface WorldPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  avatar: Avatar;
  mapId?: MapId;
}

export type WorldMotion = 'auto' | 'full' | 'reduced';

export interface WorldOptions {
  motion?: WorldMotion;
  time?: WorldTimeOptions;
  onTimeChange?: (state: WorldTimeState) => void;
  onNpc: (id: string) => void;
  onMove: (x: number, y: number) => void;
  onReady?: () => void;
  onNearby?: (id: string | undefined) => void;
  onObject?: (id: string) => void;
  onMapReady?: (id: MapId) => void;
  onInteriorChange?: (id: InteriorId | undefined) => void;
  onInteriorInteract?: (id: string) => void;
}

interface Character {
  id: string;
  root: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Image;
  layers: Phaser.GameObjects.Image[];
  shadow: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  role?: Phaser.GameObjects.Text;
  marker?: Phaser.GameObjects.Text;
  halo?: Phaser.GameObjects.Ellipse;
  hint?: Phaser.GameObjects.Text;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  phase: number;
  facing: number;
  walkDistance: number;
  frame: number;
  npc: boolean;
  artScale: number;
  avatar: Avatar;
  hovered?: boolean;
  interactionId?: string;
  idleAnimation?: SceneryAnimation;
  idleFrame?: string;
  localArtVariant?: number;
}

interface WorldObject {
  spec: WorldObjectSpec;
  x: number;
  y: number;
  root: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Ellipse;
  marker: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  hovered: boolean;
  activatedUntil: number;
  interactionId: string;
}

interface WorldPortal {
  id: string;
  x: number;
  y: number;
  root: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  hovered: boolean;
}

const WIDTH = 1536;
const HEIGHT = 1024;
const WALK_SPEED = 225;
const INTERACTION_DISTANCE = 140;
const DEFAULT_AVATAR: Avatar = { hair: '#4d3229', skin: '#dfad85', outfit: '#497d75' };
const COLORS: Record<string, string> = {
  chestnut: '#62412f', brown: '#62412f', black: '#302b2d', blonde: '#d7ae61', auburn: '#9e543f',
  silver: '#d0c9b9', fair: '#ecc4a2', light: '#ecc4a2', medium: '#c18b60', tan: '#b07a55',
  dark: '#744c38', teal: '#477e77', sage: '#75855f', blue: '#4e729a', green: '#59704f',
  purple: '#797197', red: '#a55c50', gold: '#b18b4d', ivory: '#e6d5b0',
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const color = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : COLORS[value] || fallback;
const avatarKey = (avatar: Avatar) => `${color(avatar.hair, DEFAULT_AVATAR.hair)}:${color(avatar.skin, DEFAULT_AVATAR.skin)}:${color(avatar.outfit, DEFAULT_AVATAR.outfit)}`;
const isTyping = () => {
  const focused = document.activeElement;
  return focused instanceof HTMLElement && (focused.matches('input, textarea, select') || focused.isContentEditable);
};

/** Canvas renderer. All public coordinates are normalized to the shared map. */
export class World {
  private game: Phaser.Game;
  private scene: HarborScene;
  private observer: ResizeObserver;
  private pendingPlayers: WorldPlayer[] = [];
  private selfId = '';
  private avatar: Avatar = DEFAULT_AVATAR;
  private mapId: MapId = 'lindenhafen';
  private objective?: string;
  private alive = true;
  private visible = true;
  private inputEnabled = true;
  private joystick: MapPoint = { x: 0, y: 0 };
  private windowFocused = document.hasFocus();
  private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private motionMode: WorldMotion = 'auto';
  private screenFilterSettings = normalizeScreenFilterSettings(undefined);
  private watching = false;
  private terrainOnly = false;
  private pendingInterior?: InteriorId;
  private handleMotionPreference = () => {
    if (this.scene.ready) this.scene.setReducedMotion(this.motionMode === 'reduced'
      || this.motionMode === 'auto' && this.motionPreference.matches);
  };
  private handleVisibility = () => {
    if (document.hidden) this.clearHeldInput();
    if (this.scene.ready) this.scene.setInputEnabled(this.inputEnabled && this.visible && !document.hidden);
  };
  private handleBlur = () => {
    this.windowFocused = false;
    this.clearHeldInput();
    if (this.scene.ready) this.scene.setWindowFocused(false);
  };
  private handleFocus = () => {
    this.windowFocused = true;
    if (this.scene.ready) this.scene.setWindowFocused(true);
  };

  constructor(private container: HTMLElement, private options: WorldOptions) {
    this.motionMode = options.motion ?? 'auto';
    this.scene = new HarborScene(this, options.time);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
      backgroundColor: '#283e36',
      scene: [this.scene],
      antialias: true,
      transparent: false,
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      fps: { target: 60, smoothStep: true },
      input: { activePointers: 2 },
      audio: { noAudio: true },
      banner: false,
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('focus', this.handleFocus);
    this.motionPreference.addEventListener('change', this.handleMotionPreference);
  }

  setPlayers(players: WorldPlayer[], selfId: string): void {
    this.pendingPlayers = players;
    this.selfId = selfId;
    if (this.scene.ready) this.scene.syncPlayers(players, selfId);
  }

  setAvatar(avatar: Avatar): void {
    this.avatar = avatar;
    if (this.scene.ready) this.scene.changeAvatar(avatar);
  }

  setMotionPreference(mode: WorldMotion): void {
    this.motionMode = mode;
    this.handleMotionPreference();
  }

  setScreenFilter(settings: ScreenFilterSettings): void {
    this.screenFilterSettings = normalizeScreenFilterSettings(settings);
    if (this.scene.ready) this.scene.setScreenFilter(this.screenFilterSettings);
  }

  screenFiltersSupported(): boolean {
    return this.game.renderer?.type === Phaser.WEBGL;
  }

  /** A quiet camera tour; scenery and residents use the same runtime as play. */
  setWatchMode(watching: boolean): void {
    this.watching = watching;
    this.clearHeldInput();
    if (this.scene.ready) this.scene.setWatchMode(watching);
  }

  /** Development art inspection without replacing the live scene. */
  setTerrainOnly(terrainOnly: boolean): void {
    this.terrainOnly = terrainOnly;
    if (this.scene.ready) this.scene.setTerrainOnly(terrainOnly);
  }

  getWorldStats(): { objects: number; animated: number; residents: number; seconds: number; period: WorldPeriod } {
    return this.scene.worldStats;
  }

  setTimePreference(options: WorldTimeOptions): void { this.scene.setTimePreference(options); }
  getWorldTime(): WorldTimeState { return this.scene.worldTime; }
  timeChanged(state: WorldTimeState): void { this.options.onTimeChange?.(state); }

  /** Draw the same painted south-facing avatar used in the game, CPU only. */
  renderAvatarPreview(canvas: HTMLCanvasElement, avatar: Avatar): boolean {
    return this.scene.ready && this.scene.renderAvatarPreview(canvas, avatar);
  }

  focusNpc(id: string): void {
    if (this.scene.ready) this.scene.approachNpc(id);
  }

  /** Switch after the server acknowledges travel; snapshots restore saved positions. */
  setMap(id: MapId): void {
    this.mapId = getMap(id).id;
    this.pendingInterior = undefined;
    // The acknowledgement is followed by a fresh player snapshot. Replaying an
    // old same-map snapshot here would consume its authoritative first snap.
    this.pendingPlayers = [];
    this.clearHeldInput();
    if (this.scene.ready) this.scene.switchMap(this.mapId);
  }

  focusObject(id: string): void {
    if (this.scene.ready) this.scene.approachObject(id);
  }

  /** Walk to the real doorway selected from the places panel. */
  focusBuilding(id: InteriorId): void {
    if (this.scene.ready) this.scene.approachBuilding(id);
  }

  enterInterior(id: InteriorId): void {
    this.pendingInterior = id;
    this.clearHeldInput();
    if (this.scene.ready) this.scene.enterInterior(id);
  }

  leaveInterior(): void {
    this.pendingInterior = undefined;
    this.clearHeldInput();
    if (this.scene.ready) this.scene.leaveInterior();
  }

  getInteriorId(): InteriorId | undefined {
    return this.scene.ready ? this.scene.interiorId : this.pendingInterior;
  }

  /** Only the active story character keeps a distant navigation star. */
  setObjective(npcId: string | undefined): void {
    this.objective = npcId;
    if (this.scene.ready) this.scene.setObjective(npcId);
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) this.clearHeldInput();
    if (this.scene.ready) this.scene.setInputEnabled(enabled && this.visible && !document.hidden);
  }

  /** Virtual stick: x points right, y points down; release/cancel with (0, 0). */
  setJoystick(x: number, y: number): void {
    const active = this.inputEnabled && this.visible && this.windowFocused && !document.hidden;
    this.joystick = {
      x: active && Number.isFinite(x) ? clamp(x, -1, 1) : 0,
      y: active && Number.isFinite(y) ? clamp(y, -1, 1) : 0,
    };
    if (this.scene.ready) this.scene.setJoystick(this.joystick.x, this.joystick.y);
  }

  /** Returns true only when an enabled nearby conversation or discovery starts. */
  interactNearest(): boolean {
    return this.scene.ready && this.scene.interactNearest();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      if (this.scene.ready) this.scene.setInputEnabled(this.inputEnabled && !document.hidden);
      this.resize();
      this.game.loop.wake(true);
    } else {
      this.clearHeldInput();
      if (this.scene.ready) this.scene.setInputEnabled(false);
      this.game.loop.sleep();
    }
  }

  resize(): void {
    if (!this.alive || !this.visible) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.game.scale.resize(width, height);
    if (this.scene.ready) this.scene.fitCamera(width, height);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('focus', this.handleFocus);
    this.motionPreference.removeEventListener('change', this.handleMotionPreference);
    this.game.destroy(true);
  }

  boot(): void {
    this.handleMotionPreference();
    this.scene.setScreenFilter(this.screenFilterSettings);
    this.scene.switchMap(this.mapId);
    this.scene.setObjective(this.objective);
    this.scene.changeAvatar(this.avatar);
    this.scene.syncPlayers(this.pendingPlayers, this.selfId);
    this.scene.setWindowFocused(this.windowFocused);
    this.scene.setInputEnabled(this.inputEnabled && this.visible && !document.hidden);
    this.scene.setJoystick(this.joystick.x, this.joystick.y);
    this.scene.setWatchMode(this.watching);
    this.scene.setTerrainOnly(this.terrainOnly);
    if (this.pendingInterior) this.scene.enterInterior(this.pendingInterior);
    this.resize();
    this.game.canvas.setAttribute('aria-label', 'Lantern Atlas game world. Use WASD, arrow keys, the touch joystick, or tap a destination. Press E or the action button to speak or investigate nearby.');
    this.game.canvas.setAttribute('role', 'application');
    this.options.onReady?.();
  }

  move(x: number, y: number): void { this.options.onMove(x, y); }
  interact(id: string): void { this.options.onNpc(id); }
  investigate(id: string): void { this.options.onObject?.(id); }
  mapReady(id: MapId): void { this.options.onMapReady?.(id); }
  nearby(id: string | undefined): void { this.options.onNearby?.(id); }
  interiorChanged(id: InteriorId | undefined): void {
    this.pendingInterior = id;
    this.options.onInteriorChange?.(id);
  }
  interiorInteract(id: string): void { this.options.onInteriorInteract?.(id); }

  private clearHeldInput(): void {
    this.joystick = { x: 0, y: 0 };
    if (this.scene.ready) this.scene.clearControls();
  }
}

class HarborScene extends Phaser.Scene {
  ready = false;
  private local!: Character;
  private peers = new Map<string, Character>();
  private characters = new Map<string, Character>();
  private objects = new Map<string, WorldObject>();
  private scenery?: WorldScenery;
  private interior?: WorldInterior;
  private interiorSpec?: InteriorSpec;
  private portals = new Map<string, WorldPortal>();
  private outdoors?: {
    x: number; y: number; facing: number; navigation: NavigationGrid;
    characters: Map<string, Character>; objects: Map<string, WorldObject>; portals: Map<string, WorldPortal>;
  };
  private deferredPlayers?: { players: WorldPlayer[]; selfId: string };
  private interiorPropTargets: Phaser.GameObjects.Zone[] = [];
  private roomRevision = 0;
  private residents: { character: Character; motion: ReturnType<typeof createWorldResidents>[number]; sample: ReturnType<typeof sampleResidentMotion> }[] = [];
  private reducedMotion = false;
  private navigation!: NavigationGrid;
  private mapSpec = getMap('lindenhafen');
  private background?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private objective?: string;
  private mapRevision = 0;
  private mapVisualsReady = false;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private target?: { x: number; y: number };
  private waypoints: MapPoint[] = [];
  private pendingInteraction?: string;
  private marker!: Phaser.GameObjects.Container;
  private lastSent = 0;
  private lastX = -1;
  private lastY = -1;
  private initializedSelf = false;
  private fitZoom = 1;
  private elapsed = 0;
  private decorativeElapsed = 0;
  private controlsEnabled = true;
  private windowFocused = true;
  private joystick: MapPoint = { x: 0, y: 0 };
  private smoothJoystick: MapPoint = { x: 0, y: 0 };
  private nearbyInteraction?: string;
  private mobileCamera = false;
  private cameraLead: MapPoint = { x: 0, y: 0 };
  private playerArtReady = false;
  private screenFilter?: ScreenFilterController;
  private watching = false;
  private terrainOnly = false;
  private tourTime = 0;
  private animationRequests = new Map<string, (() => void)[]>();
  private regionAssets = new WorldMapAssets(this);
  private clock: WorldClock;
  private period: WorldPeriod;
  private pendingPeriod?: string;
  private lastClockLabel = '';
  get worldTime(): WorldTimeState { return this.clock.advance(0); }
  get interiorId(): InteriorId | undefined { return this.interiorSpec?.id; }
  setTimePreference(options: WorldTimeOptions): void { this.clock.configure(options); if (this.ready) this.updateWorldTime(0); }

  get worldStats(): { objects: number; animated: number; residents: number; seconds: number; period: WorldPeriod } {
    return { objects: this.interior?.objectCount ?? this.scenery?.objectCount ?? 0,
      residents: this.interior ? this.characters.size : this.residents.length,
      animated: this.interior?.animatedObjectCount ?? this.scenery?.animatedObjectCount ?? 0, seconds: this.decorativeElapsed, period: this.period };
  }

  constructor(private owner: World, time?: WorldTimeOptions) { super({ key: 'lindenhafen' }); this.clock = new WorldClock(time); this.period = this.clock.advance(0).period; }

  preload(): void {
    this.regionAssets.load(getMap('lindenhafen'), undefined, false);
    this.loadAnimationAssets('lindenhafen', this.period);
    for (const room of interiors) this.load.image(`interior-${room.id}-room`, room.asset);
    for (const sheet of ['cafe-objects', 'bakery-objects', 'supermarket-objects', 'decor', 'furniture']) {
      this.load.atlas(`interior-${sheet}`, `/assets/interior-${sheet}.webp`, `/assets/interior-${sheet}.json`);
    }
    this.load.json('interior-animations', '/assets/interior-animations.json');
    this.load.atlas('interior-effects', '/assets/interior-effects.webp', '/assets/interior-effects.json');
    this.load.json('interior-effect-animations', '/assets/interior-effect-animations.json');
    this.load.atlas('interior-proportioned', '/assets/interior-proportioned.webp', '/assets/interior-proportioned.json');
    this.load.json('interior-stills', '/assets/interior-stills.json');
    this.load.once('filecomplete-json-residents-animations', (_key: string, _type: string, manifest: SceneryAnimationManifest) => {
      for (const page of sceneryAnimationTextureKeys(manifest)) this.load.atlas(page, `/assets/${page}.webp`, `/assets/${page}.json`);
    });
    this.load.json('residents-animations', '/assets/residents-animations.json');
    this.load.spritesheet(NPC_ART.key, '/assets/characters.webp', { frameWidth: NPC_ART.width, frameHeight: NPC_ART.height });
    this.load.image(PLAYER_ART.source, '/assets/player-walk.webp');
  }

  private loadAnimationAssets(id: MapId, period: WorldPeriod, onLoaded?: () => void): void {
    const key = sceneryAnimationManifestKey(id, period);
    const cached = this.cache.json.get(key) as SceneryAnimationManifest | undefined;
    if (cached && Object.values(cached.assets).length > 0 && sceneryAnimationTextureKeys(cached).every(page => this.textures.exists(page)) && (!sceneryTerrainKey(id, cached) || this.textures.exists(sceneryTerrainKey(id, cached)!))) {
      onLoaded?.();
      return;
    }
    const pending = this.animationRequests.get(key);
    if (pending) { if (onLoaded) pending.push(onLoaded); return; }
    this.animationRequests.set(key, onLoaded ? [onLoaded] : []);
    const enqueue = (manifest: SceneryAnimationManifest) => {
      for (const page of sceneryAnimationTextureKeys(manifest)) {
        if (!this.textures.exists(page)) this.load.atlas(page, `/assets/${page}.webp`, `/assets/${page}.json`);
      }
      const terrain = sceneryTerrainKey(id, manifest);
      if (terrain && !this.textures.exists(terrain)) this.load.image(terrain, `/assets/${manifest.terrain}.webp`);
    };
    if (cached) enqueue(cached);
    else {
      this.load.once(`filecomplete-json-${key}`, (_key: string, _type: string, manifest: SceneryAnimationManifest) => enqueue(manifest));
      this.load.json(key, `/assets/${id}-${period}-animations.json`);
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      const callbacks = this.animationRequests.get(key) ?? [];
      this.animationRequests.delete(key);
      if (this.ready && this.mapSpec.id !== id) this.releaseAnimationAssets(id, period);
      for (const callback of callbacks) callback();
    });
    if (this.ready && !this.load.isLoading()) this.load.start();
  }

  private releaseAnimationAssets(id: MapId, period: WorldPeriod): void {
    const key = sceneryAnimationManifestKey(id, period);
    // A partly loaded atlas must remain intact until its completion callbacks
    // decide whether to display it or release the stale request.
    if (this.animationRequests.has(key)) return;
    const manifest = this.cache.json.get(key) as SceneryAnimationManifest | undefined;
    const activeManifest = this.cache.json.get(sceneryAnimationManifestKey(this.mapSpec.id, this.period)) as SceneryAnimationManifest | undefined;
    const retainedPages = new Set(activeManifest ? sceneryAnimationTextureKeys(activeManifest) : []);
    if (manifest) for (const page of sceneryAnimationTextureKeys(manifest)) {
      // Expedition day/night periods can share one authored detail sheet.
      if (!retainedPages.has(page) && this.textures.exists(page)) this.textures.remove(page);
    }
    const terrain = sceneryTerrainKey(id, manifest);
    if (terrain && terrain !== this.mapSpec.id && this.textures.exists(terrain)) this.textures.remove(terrain);
  }

  private applyPeriod(period: WorldPeriod): void {
    const previous = this.period;
    this.scenery?.destroy();
    this.period = period;
    this.scenery = new WorldScenery(this, this.mapSpec.id, period);
    this.scenery.setReducedMotion(this.reducedMotion);
    this.scenery.setVisible(!this.terrainOnly && !this.interiorSpec);
    const manifest = this.cache.json.get(sceneryAnimationManifestKey(this.mapSpec.id, period)) as SceneryAnimationManifest | undefined;
    const requestedTerrain = sceneryTerrainKey(this.mapSpec.id, manifest);
    const terrain = requestedTerrain && this.textures.exists(requestedTerrain) ? requestedTerrain : this.mapSpec.id;
    if (this.background instanceof Phaser.GameObjects.Image) this.background.setTexture(terrain).setTint(worldAmbient(this.mapSpec.id,period).terrain);
    for (const character of this.characters.values()) this.setCharacterAmbient(character);
    for (const {character} of this.residents) this.setCharacterAmbient(character);
    if (previous !== period) this.releaseAnimationAssets(this.mapSpec.id, previous);
    this.pendingPeriod = undefined;
  }

  private updateWorldTime(seconds: number): void {
    const state = this.clock.advance(seconds);
    if (state.label + state.period + state.mode !== this.lastClockLabel) {
      this.lastClockLabel = state.label + state.period + state.mode;
      this.owner.timeChanged(state);
    }
    if (!this.mapVisualsReady) return;
    const request = `${this.mapSpec.id}-${state.period}`;
    if (state.period !== this.period && this.pendingPeriod !== request) {
      this.pendingPeriod = request;
      const id = this.mapSpec.id;
      this.loadAnimationAssets(id, state.period, () => {
        if (this.pendingPeriod === request) this.pendingPeriod = undefined;
        if (this.ready && this.mapVisualsReady && this.mapSpec.id === id && this.clock.advance(0).period === state.period) this.applyPeriod(state.period);
        else if (this.mapSpec.id !== id || this.period !== state.period) this.releaseAnimationAssets(id, state.period);
      });
    }
  }

  create(): void {
    this.navigation = createMapNavigation('lindenhafen');
    this.playerArtReady = prepareCharacterArt(this);
    this.screenFilter = createScreenFilter(this);
    this.createMarkerTexture();
    this.marker = this.add.container(0, 0, [
      this.add.ellipse(0, 0, 37, 18).setStrokeStyle(1.5, 0xf5e4ac, 0.8),
      this.add.ellipse(0, 0, 6, 3, 0xf5e4ac, 0.8),
    ]).setDepth(1).setVisible(false);

    const spawn = this.navigation.closestPoint(WIDTH * 0.52, HEIGHT * 0.61);
    this.local = this.createCharacter('self', 'You', spawn.x, spawn.y, DEFAULT_AVATAR);
    this.local.name.setColor('#fff2ca');
    this.local.root.addAt(this.add.ellipse(0, 1, 31, 15).setStrokeStyle(1, 0xf6dd9a, 0.55), 1);
    this.keys = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
      arrowUp: Phaser.Input.Keyboard.KeyCodes.UP, arrowDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
      arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT, arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
    }, false) as Record<string, Phaser.Input.Keyboard.Key> | undefined;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (!this.controlsEnabled || this.watching || !this.windowFocused || objects.length || pointer.rightButtonDown()) return;
      const destination = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.walkTo(destination.x, destination.y);
    });
    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.ready = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.scenery?.destroy();
      this.scenery = undefined;
      this.interior?.destroy();
      this.interior = undefined;
      this.residents = [];
    });
    this.owner.boot();
  }

  setScreenFilter(settings: ScreenFilterSettings): void {
    this.screenFilter?.configure(settings);
  }

  switchMap(id: MapId): void {
    if (this.interiorSpec) this.leaveInterior(false);
    const map = getMap(id);
    const revision = ++this.mapRevision;
    this.clearControls();
    this.initializedSelf = false;
    this.lastX = -1;
    this.lastY = -1;
    this.cameraLead = { x: 0, y: 0 };
    if (this.mapSpec.id !== map.id || !this.background || !this.mapVisualsReady) {
      const previous = this.mapSpec;
      this.background?.destroy();
      this.scenery?.destroy();
      this.scenery = undefined;
      this.mapVisualsReady = false;
      for (const npc of this.characters.values()) npc.root.destroy();
      for (const object of this.objects.values()) object.root.destroy();
      for (const portal of this.portals.values()) portal.root.destroy();
      for (const peer of this.peers.values()) peer.root.destroy();
      for (const resident of this.residents) resident.character.root.destroy();
      this.characters.clear();
      this.objects.clear();
      this.portals.clear();
      this.peers.clear();
      this.residents = [];
      this.mapSpec = map;
      this.pendingPeriod = undefined;
      this.navigation = createMapNavigation(map.id);
      if (previous.id !== map.id) {
        this.regionAssets.release(previous);
        for (const period of ['day', 'night'] as const) this.releaseAnimationAssets(previous.id, period);
      }
      // Travel coordinates and snapshots are ready immediately. Destination art
      // streams independently, so a network acknowledgement is never delayed.
      this.background = this.add.graphics().fillStyle(0x263b3c).fillRect(0, 0, WIDTH, HEIGHT).setDepth(-1000);
      this.period = this.clock.advance(0).period;
      this.regionAssets.load(map, () => {
        if (!this.ready || this.mapSpec.id !== map.id || revision !== this.mapRevision) {
          if (this.mapSpec.id !== map.id) this.regionAssets.release(map);
          return;
        }
        this.background?.destroy();
        this.background = this.textures.exists(map.id)
          ? this.add.image(0, 0, map.id).setOrigin(0).setDisplaySize(WIDTH, HEIGHT).setDepth(-1000).setTint(worldAmbient(map.id,this.period).terrain)
          : this.add.graphics().fillStyle(0x263b3c).fillRect(0, 0, WIDTH, HEIGHT).setDepth(-1000);
        this.scenery = new WorldScenery(this, map.id, this.period);
        this.scenery.setReducedMotion(this.reducedMotion);
        this.createMapCharacters(map);
        this.createMapObjects(map);
        this.createBuildingEntrances();
        this.createResidents();
        this.mapVisualsReady = true;
        this.setTerrainOnly(this.terrainOnly);
        const period = this.clock.advance(0).period;
        this.loadAnimationAssets(map.id, period, () => {
          if (this.ready && this.mapSpec.id === map.id && revision === this.mapRevision) {
            if (this.clock.advance(0).period === period) this.applyPeriod(period);
            queueMicrotask(() => { if (this.ready && revision === this.mapRevision) this.owner.mapReady(map.id); });
          } else if (this.mapSpec.id !== map.id || this.period !== period) this.releaseAnimationAssets(map.id, period);
        });
      });
    } else {
      queueMicrotask(() => { if (this.ready && revision === this.mapRevision) this.owner.mapReady(map.id); });
    }
    const spawn = this.navigation.closestPoint(map.spawn.x * WIDTH, map.spawn.y * HEIGHT);
    this.local.x = this.local.targetX = spawn.x;
    this.local.y = this.local.targetY = spawn.y;
    this.local.facing = 0;
    this.local.walkDistance = 0;
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.frameCamera(1);
  }

  enterInterior(id: InteriorId): void {
    if (this.interiorSpec?.id === id) return;
    if (this.interiorSpec) this.leaveInterior();
    const spec = getInterior(id);
    this.clearControls();
    this.outdoors = {
      x: this.local.x, y: this.local.y, facing: this.local.facing, navigation: this.navigation,
      characters: this.characters, objects: this.objects, portals: this.portals,
    };
    this.background?.setVisible(false);
    this.scenery?.setVisible(false);
    for (const character of this.characters.values()) character.root.setVisible(false);
    for (const object of this.objects.values()) object.root.setVisible(false);
    for (const portal of this.portals.values()) portal.root.setVisible(false);
    for (const peer of this.peers.values()) peer.root.setVisible(false);
    for (const resident of this.residents) resident.character.root.setVisible(false);
    this.characters = new Map();
    this.objects = new Map();
    this.portals = new Map();
    this.interiorSpec = spec;
    this.roomRevision++;
    this.navigation = createInteriorNavigation(id);
    this.interior = new WorldInterior(this, spec);
    this.interior.setReducedMotion(this.reducedMotion);
    this.interior.setVisible(!this.terrainOnly);
    this.createMapCharacters(spec, spec);
    this.createMapObjects({ objects: spec.objects.map(object => ({ ...object, kind: 'instrument' as const })) }, 'interior');
    this.createInteriorPropTargets(spec);
    this.createPortal(`exit:${id}`, spec.exit.x * WIDTH, spec.exit.y * HEIGHT, 'Return to town', true);
    const spawn = this.navigation.closestPoint(spec.spawn.x * WIDTH, spec.spawn.y * HEIGHT);
    this.local.x = this.local.targetX = spawn.x;
    this.local.y = this.local.targetY = spawn.y;
    this.local.facing = 2;
    this.local.walkDistance = 0;
    this.cameraLead = { x: 0, y: 0 };
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.frameCamera(1);
    this.transitionRoom();
    this.owner.interiorChanged(id);
    this.refreshNearby();
  }

  leaveInterior(restorePeers = true): void {
    if (!this.interiorSpec || !this.outdoors) return;
    this.clearControls();
    for (const character of this.characters.values()) character.root.destroy();
    for (const object of this.objects.values()) object.root.destroy();
    for (const portal of this.portals.values()) portal.root.destroy();
    for (const target of this.interiorPropTargets) target.destroy();
    this.interiorPropTargets = [];
    this.interior?.destroy();
    this.interior = undefined;
    this.interiorSpec = undefined;
    this.roomRevision++;
    const outdoors = this.outdoors;
    this.outdoors = undefined;
    this.navigation = outdoors.navigation;
    this.characters = outdoors.characters;
    this.objects = outdoors.objects;
    this.portals = outdoors.portals;
    this.local.x = this.local.targetX = outdoors.x;
    this.local.y = this.local.targetY = outdoors.y;
    this.local.facing = outdoors.facing;
    this.local.walkDistance = 0;
    this.cameraLead = { x: 0, y: 0 };
    this.background?.setVisible(true);
    this.scenery?.setVisible(!this.terrainOnly);
    for (const character of this.characters.values()) character.root.setVisible(!this.terrainOnly);
    for (const object of this.objects.values()) object.root.setVisible(!this.terrainOnly);
    for (const portal of this.portals.values()) portal.root.setVisible(!this.terrainOnly);
    for (const peer of this.peers.values()) peer.root.setVisible(!this.terrainOnly);
    const snapshot = this.deferredPlayers;
    this.deferredPlayers = undefined;
    if (restorePeers && snapshot) this.syncPlayers(snapshot.players, snapshot.selfId, true);
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.updateResidents();
    this.frameCamera(1);
    if (restorePeers) this.transitionRoom();
    this.owner.interiorChanged(undefined);
    this.refreshNearby();
  }

  private transitionRoom(): void {
    this.cameras.main.resetFX();
    if (!this.reducedMotion) this.cameras.main.fadeIn(220, 29, 35, 30);
  }

  setObjective(id: string | undefined): void { this.objective = id; }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.scenery?.setReducedMotion(reduced);
    this.interior?.setReducedMotion(reduced);
  }

  setWatchMode(watching: boolean): void {
    this.watching = watching;
    this.tourTime = 0;
    this.clearControls();
    this.local?.root.setVisible(!watching && !this.terrainOnly);
    this.frameCamera(1);
  }

  setTerrainOnly(terrainOnly: boolean): void {
    this.terrainOnly = terrainOnly;
    this.scenery?.setVisible(!terrainOnly && !this.interiorSpec);
    this.interior?.setVisible(!terrainOnly);
    for (const target of this.interiorPropTargets) target.setVisible(!terrainOnly);
    this.local?.root.setVisible(!terrainOnly && !this.watching);
    for (const character of this.characters.values()) character.root.setVisible(!terrainOnly);
    for (const character of this.peers.values()) character.root.setVisible(!terrainOnly && !this.interiorSpec);
  }

  private createResidents(): void {
    if (!this.playerArtReady) return;
    const localPeople = hasRegionPeople(this.mapSpec.id);
    let residentIndex = 0;
    for (const motion of createWorldResidents(this.mapSpec.id, this.navigation)) {
      const position = sampleResidentMotion(motion, this.decorativeElapsed);
      const variant = residentIndex++ % 4;
      const character = this.createCharacter(motion.id, motion.name, position.x, position.y, motion.avatar, undefined, localPeople ? variant : -1, localPeople ? variant : undefined);
      character.name.setColor('#ddd6b5').setVisible(false);
      this.residents.push({ character, motion, sample: position });
    }
  }

  private createMapCharacters(map: Pick<WorldMapSpec, 'npcs'>, interior?: InteriorSpec): void {
    for (const position of map.npcs) {
      const index = npcs.findIndex(npc => npc.id === position.id);
      const localNpc = getExpeditionNpc(position.id);
      const npc = localNpc ?? npcs[index];
      if (!npc) continue;
      const { x, y } = this.navigation.closestPoint(position.x * WIDTH, position.y * HEIGHT);
      const character = this.createCharacter(npc.id, npc.name, x, y, localNpc?.avatar ?? DEFAULT_AVATAR, npc.role.split('·')[0].trim(), localNpc ? localNpc.artVariant % 4 : index, localNpc?.artVariant);
      const interiorNpc = interior?.npcs.find(resident => resident.id === npc.id);
      if (interiorNpc) {
        character.interactionId = interiorNpc.interactionId;
        character.role?.setText(interiorNpc.role);
      }
      character.halo = this.add.ellipse(0, 2, 37, 17, 0xf5dda0, 0.08).setStrokeStyle(1, 0xf3d286, 0.6).setVisible(false);
      character.root.addAt(character.halo, 1);
      character.marker = this.add.text(0, -96, '✦', { fontFamily: 'Georgia, serif', fontSize: '17px', color: '#ffe3a3', stroke: '#68563c', strokeThickness: 2 }).setOrigin(.5).setVisible(false);
      character.hint = this.add.text(0, 30, this.mobileCamera ? 'TAP TO TALK' : 'TALK · E', { fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#fff2cf', backgroundColor: '#263e36', padding: { x: 7, y: 4 } }).setOrigin(.5).setVisible(false);
      character.root.add([character.marker, character.hint]);
      character.figure.setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(-40, 12, (character.idleAnimation?.width ?? NPC_ART.width) + 80, (character.idleAnimation?.height ?? NPC_ART.height) * (character.idleAnimation?.originY ?? NPC_ART.footY) - 12),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
      character.figure.on('pointerover', () => { character.hovered = true; });
      character.figure.on('pointerout', () => { character.hovered = false; });
      character.figure.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.approachInteraction(character.interactionId ?? npc.id);
      });
      this.characters.set(npc.id, character);
    }
    this.resizeHitTargets();
  }

  private createMapObjects(map: Pick<WorldMapSpec, 'objects'>, prefix = 'object'): void {
    for (const spec of map.objects) {
      const x = spec.x * WIDTH, y = spec.y * HEIGHT;
      const halo = this.add.ellipse(0, 0, 36, 17, 0xeecf8a, .06).setStrokeStyle(1, 0xf5d896, .35);
      const marker = this.add.image(0, -8, 'discovery').setScale(.8).setAlpha(.7);
      const label = this.add.text(0, -35, spec.label, { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff0d0', stroke: '#283b36', strokeThickness: 4 }).setOrigin(.5).setVisible(false);
      const hit = this.add.zone(0, -7, Math.max(52, 44 / this.fitZoom), Math.max(52, 44 / this.fitZoom)).setInteractive({ useHandCursor: true });
      const root = this.add.container(x, y, [halo, marker, label, hit]).setDepth(y + 8);
      const object: WorldObject = { spec, x, y, root, halo, marker, label, hovered: false, activatedUntil: 0,
        interactionId: spec.id.startsWith(`${prefix}:`) ? spec.id : `${prefix}:${spec.id}` };
      hit.on('pointerover', () => { object.hovered = true; });
      hit.on('pointerout', () => { object.hovered = false; });
      hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.approachInteraction(object.interactionId);
      });
      this.objects.set(spec.id, object);
    }
  }

  private createInteriorPropTargets(spec: InteriorSpec): void {
    const manifest = this.cache.json.get('interior-animations') as SceneryAnimationManifest | undefined;
    const stills = this.cache.json.get('interior-stills') as SceneryAnimationManifest | undefined;
    for (const prop of spec.props) {
      if (!prop.interactive) continue;
      const object = this.objects.get(prop.interactive);
      if (!object) continue;
      const animation = stills?.assets[prop.asset] ?? manifest?.assets[prop.asset];
      const height = prop.width * (animation ? animation.height / animation.referenceWidth : .75);
      const centerX = prop.x + (.5 - (animation?.originX ?? .5)) * prop.width;
      const centerY = prop.y + (.5 - (animation?.originY ?? .97)) * height;
      const hit = this.add.zone(centerX, centerY, prop.width, height * .9)
        .setDepth((prop.depth ?? prop.y) + 1).setInteractive({ useHandCursor: true }).setVisible(!this.terrainOnly);
      hit.on('pointerover', () => { object.hovered = true; });
      hit.on('pointerout', () => { object.hovered = false; });
      hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.approachInteraction(object.interactionId);
      });
      this.interiorPropTargets.push(hit);
    }
  }

  private createBuildingEntrances(): void {
    for (const entrance of buildingEntrances(this.mapSpec.id)) {
      this.createPortal(entrance.id, entrance.x * WIDTH, entrance.y * HEIGHT, entrance.label);
    }
  }

  private createPortal(id: string, x: number, y: number, label: string, exit = false): void {
    const halo = this.add.ellipse(0, 1, 56, 22, 0xffd996, .1).setStrokeStyle(1.5, 0xf5d5a0, .75);
    const glyph = this.add.text(0, -12, exit ? '↙' : '↗', {
      fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#fff1cd', stroke: '#3a4236', strokeThickness: 3,
    }).setOrigin(.5);
    const name = this.add.text(0, exit ? 24 : -42, label, {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#fff1cf', stroke: '#283c35', strokeThickness: 4,
    }).setOrigin(.5);
    const hit = this.add.zone(0, -14, 76, 76).setInteractive({ useHandCursor: true });
    const root = this.add.container(x, y, [halo, glyph, name, hit]).setDepth(y + 8);
    const portal: WorldPortal = { id, x, y, root, halo, label: name, hovered: false };
    hit.on('pointerover', () => { portal.hovered = true; });
    hit.on('pointerout', () => { portal.hovered = false; });
    hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.approachInteraction(id);
    });
    this.portals.set(id, portal);
  }

  private resizeHitTargets(): void {
    for (const npc of this.characters.values()) {
      const hit = npc.figure.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      const frameWidth = npc.idleAnimation?.width ?? NPC_ART.width;
      const frameHeight = npc.idleAnimation?.height ?? NPC_ART.height;
      const footY = npc.idleAnimation?.originY ?? NPC_ART.footY;
      const width = Math.max(frameWidth + 80, 44 / (npc.artScale * this.fitZoom));
      hit?.setTo((frameWidth - width) / 2, 12, width, frameHeight * footY - 12);
    }
    for (const object of this.objects.values()) {
      const hit = object.root.list.at(-1) as Phaser.GameObjects.Zone;
      const size = Math.max(52, 44 / this.fitZoom);
      hit.setSize(size, size, true);
    }
    for (const portal of this.portals.values()) {
      const hit = portal.root.list.at(-1) as Phaser.GameObjects.Zone;
      const size = Math.max(76, 44 / this.fitZoom);
      hit.setSize(size, size, true);
    }
  }

  fitCamera(width: number, height: number): void {
    // Cover the viewport, then pan within the map. Portrait screens explore
    // horizontally instead of shrinking the whole town into a letterbox.
    this.fitZoom = Math.max(width / WIDTH, height / HEIGHT);
    const previousMobile = this.mobileCamera;
    this.mobileCamera = width < 760 || (width < 1000 && height < 520);
    if (previousMobile !== this.mobileCamera) {
      for (const npc of this.characters.values()) npc.hint?.setText(this.mobileCamera ? 'TAP TO TALK' : 'TALK · E');
      if (this.mobileCamera) for (const map of maps) for (const period of ['day', 'night'] as const) {
        if (map.id !== this.mapSpec.id || period !== this.period) this.releaseAnimationAssets(map.id, period);
      }
    }
    this.cameras.main.setZoom(this.fitZoom);
    this.resizeHitTargets();
    this.frameCamera(1);
  }

  setInputEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    if (this.input.keyboard) this.input.keyboard.enabled = enabled && this.windowFocused;
    if (!enabled) this.clearControls();
    this.refreshNearby();
  }

  setWindowFocused(focused: boolean): void {
    this.windowFocused = focused;
    if (this.input.keyboard) this.input.keyboard.enabled = this.controlsEnabled && focused;
    if (!focused) this.clearControls();
    this.refreshNearby();
  }

  setJoystick(x: number, y: number): void {
    const length = Math.hypot(x, y);
    if (!this.controlsEnabled || !this.windowFocused || length <= 0.12) {
      this.joystick = { x: 0, y: 0 };
      this.smoothJoystick = { x: 0, y: 0 };
      return;
    }
    const strength = clamp((Math.min(length, 1) - 0.12) / 0.88, 0, 1);
    this.joystick = { x: x / length * strength, y: y / length * strength };
    this.cancelRoute();
  }

  clearControls(): void {
    this.joystick = { x: 0, y: 0 };
    this.smoothJoystick = { x: 0, y: 0 };
    this.input.keyboard?.resetKeys();
    this.cancelRoute();
    this.setNearby(undefined);
  }

  interactNearest(): boolean {
    if (!this.controlsEnabled || this.watching || !this.windowFocused || document.hidden) return false;
    const nearest = this.findNearestInteraction();
    if (!nearest) return false;
    this.approachInteraction(nearest.id);
    return true;
  }

  private cancelRoute(): void {
    this.target = undefined;
    this.waypoints = [];
    this.pendingInteraction = undefined;
    this.marker?.setVisible(false);
  }

  private findNearestInteraction(): { id: string; x: number; y: number } | undefined {
    let nearest: { id: string; x: number; y: number } | undefined;
    let distance = INTERACTION_DISTANCE;
    for (const npc of this.characters.values()) {
      const separation = Math.hypot(npc.x - this.local.x, npc.y - this.local.y);
      if (separation < distance) { distance = separation; nearest = { id: npc.interactionId ?? npc.id, x: npc.x, y: npc.y }; }
    }
    for (const object of this.objects.values()) {
      const separation = Math.hypot(object.x - this.local.x, object.y - this.local.y);
      if (separation < distance) { distance = separation; nearest = { id: object.interactionId, x: object.x, y: object.y }; }
    }
    for (const portal of this.portals.values()) {
      const separation = Math.hypot(portal.x - this.local.x, portal.y - this.local.y);
      if (separation < distance) { distance = separation; nearest = { id: portal.id, x: portal.x, y: portal.y }; }
    }
    return nearest;
  }

  private setNearby(id: string | undefined): void {
    if (id === this.nearbyInteraction) return;
    this.nearbyInteraction = id;
    this.owner.nearby(id);
  }

  private refreshNearby(): void {
    this.setNearby(this.controlsEnabled && !this.watching && this.windowFocused && !document.hidden ? this.findNearestInteraction()?.id : undefined);
  }

  changeAvatar(avatar: Avatar): void {
    if (!this.local || avatarKey(this.local.avatar) === avatarKey(avatar)) return;
    this.local.avatar = avatar;
    this.tintCharacter(this.local);
  }

  renderAvatarPreview(canvas: HTMLCanvasElement, avatar: Avatar): boolean {
    return paintAvatarPreview(this, canvas, this.avatarPalette(avatar));
  }

  syncPlayers(players: WorldPlayer[], selfId: string, preserveLocal = false): void {
    if (this.interiorSpec) {
      // Interiors are local focus sessions. Outdoor snapshots must never use
      // room coordinates for navigation, move the local player, or add peers.
      this.deferredPlayers = { players, selfId };
      const self = players.find(player => player.id === selfId);
      if (self) this.local.name.setText(self.name || 'You');
      return;
    }
    const present = new Set<string>();
    for (const player of players) {
      if ((player.mapId ?? 'lindenhafen') !== this.mapSpec.id) continue;
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
      const rawX = clamp(player.x, 0.04, 0.96) * WIDTH;
      const rawY = clamp(player.y, 0.08, 0.95) * HEIGHT;
      const { x, y } = this.navigation.closestPoint(rawX, rawY);
      if (player.id === selfId) {
        this.local.name.setText(player.name || 'You');
        if (preserveLocal) { this.initializedSelf = true; continue; }
        if (!this.initializedSelf) {
          this.local.x = x;
          this.local.y = y;
          this.local.root.setPosition(x, y);
          this.initializedSelf = true;
          this.frameCamera(1);
        } else if (Math.hypot(this.local.x - x, this.local.y - y) > 230) {
          this.local.x = x;
          this.local.y = y;
        }
        continue;
      }
      present.add(player.id);
      let peer = this.peers.get(player.id);
      if (!peer) {
        peer = this.createCharacter(player.id, player.name, x, y, player.avatar || DEFAULT_AVATAR);
        peer.name.setColor('#e1ecd9');
        this.peers.set(player.id, peer);
      }
      peer.targetX = x;
      peer.targetY = y;
      peer.name.setText(player.name);
      if (player.avatar && avatarKey(peer.avatar) !== avatarKey(player.avatar)) {
        peer.avatar = player.avatar;
        this.tintCharacter(peer);
      }
    }
    for (const [id, peer] of this.peers) {
      if (!present.has(id)) { peer.root.destroy(); this.peers.delete(id); }
    }
  }

  approachNpc(id: string): void {
    this.approachInteraction(this.characters.get(id)?.interactionId ?? id);
  }

  approachObject(id: string): void {
    this.approachInteraction(id.includes(':') ? id : `${this.interiorSpec ? 'interior' : 'object'}:${id}`);
  }

  approachBuilding(id: InteriorId): void {
    if (this.interiorSpec?.id === id) return;
    if (this.interiorSpec) this.leaveInterior();
    this.approachInteraction(`building:${id}`);
  }

  private interactionPosition(id: string): { x: number; y: number } | undefined {
    if (id.startsWith('building:') || id.startsWith('exit:')) return this.portals.get(id);
    if (id.startsWith('object:')) return this.objects.get(id.slice(7));
    if (id.startsWith('interior:')) {
      const station = this.objects.get(id);
      const resident = [...this.characters.values()].find(character => character.interactionId === id);
      if (!station) return resident;
      if (!resident) return station;
      return Math.hypot(resident.x - this.local.x, resident.y - this.local.y)
        < Math.hypot(station.x - this.local.x, station.y - this.local.y) ? resident : station;
    }
    return this.characters.get(id);
  }

  private triggerInteraction(id: string): void {
    this.cancelRoute();
    if (id.startsWith('building:')) {
      const entrance = buildingEntrances(this.mapSpec.id).find(building => building.id === id);
      if (entrance) this.enterInterior(entrance.interiorId);
    } else if (id.startsWith('exit:')) {
      this.leaveInterior();
    } else if (id.startsWith('interior:')) {
      const station = this.objects.get(id);
      if (!station || !this.interiorSpec) return;
      station.activatedUntil = this.elapsed + 4;
      this.owner.interiorInteract(station.spec.id);
    } else if (id.startsWith('object:')) {
      const object = this.objects.get(id.slice(7));
      if (!object) return;
      object.activatedUntil = this.elapsed + 4;
      this.owner.investigate(object.spec.id);
    } else this.owner.interact(id);
  }

  private approachInteraction(id: string): void {
    if (!this.controlsEnabled || this.watching || !this.windowFocused || document.hidden) return;
    const target = this.interactionPosition(id);
    if (!target) return;
    if (Math.hypot(target.x - this.local.x, target.y - this.local.y) <= INTERACTION_DISTANCE) {
      this.triggerInteraction(id);
      return;
    }
    const angle = Math.atan2(this.local.y - target.y, this.local.x - target.x);
    if (this.walkTo(target.x + Math.cos(angle) * 58, target.y + Math.sin(angle) * 58)) this.pendingInteraction = id;
  }

  private walkTo(x: number, y: number): boolean {
    this.pendingInteraction = undefined;
    const path = this.navigation.findPath(this.local, { x, y });
    if (!path.length) {
      this.target = undefined;
      this.waypoints = [];
      this.marker.setVisible(false);
      return false;
    }
    this.target = path[0];
    this.waypoints = path.slice(1);
    const destination = path[path.length - 1];
    this.marker.setPosition(destination.x, destination.y).setAlpha(0.9).setVisible(true);
    return true;
  }

  update(_time: number, delta: number): void {
    if (!this.ready) return;
    const roomRevision = this.roomRevision;
    const seconds = Math.min(delta, 50) / 1000;
    this.elapsed += seconds;
    if (!this.reducedMotion) this.decorativeElapsed += seconds;
    let vx = 0;
    let vy = 0;
    const previousX = this.local.x;
    const previousY = this.local.y;
    const keys = this.keys;
    const pressedInteract = keys ? Phaser.Input.Keyboard.JustDown(keys.interact) : false;
    if (this.controlsEnabled && this.windowFocused && keys && !isTyping()) {
      vx = Number(keys.right.isDown || keys.arrowRight.isDown) - Number(keys.left.isDown || keys.arrowLeft.isDown);
      vy = Number(keys.down.isDown || keys.arrowDown.isDown) - Number(keys.up.isDown || keys.arrowUp.isDown);
      if (vx || vy) {
        const length = Math.hypot(vx, vy);
        vx /= length;
        vy /= length;
        this.cancelRoute();
      }
      if (pressedInteract) {
        this.interactNearest();
      }
    }
    if (roomRevision !== this.roomRevision) return;
    if (this.controlsEnabled && this.windowFocused && !vx && !vy && (this.joystick.x || this.joystick.y)) {
      const smooth = 1 - Math.exp(-18 * seconds);
      this.smoothJoystick.x += (this.joystick.x - this.smoothJoystick.x) * smooth;
      this.smoothJoystick.y += (this.joystick.y - this.smoothJoystick.y) * smooth;
      vx = this.smoothJoystick.x;
      vy = this.smoothJoystick.y;
      this.cancelRoute();
    }
    if (!this.controlsEnabled || !this.windowFocused || this.watching) { vx = 0; vy = 0; }
    if (!vx && !vy && this.target) {
      const dx = this.target.x - this.local.x;
      const dy = this.target.y - this.local.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= WALK_SPEED * seconds + 1) {
        this.local.x = this.target.x;
        this.local.y = this.target.y;
        this.target = this.waypoints.shift();
        if (!this.target) this.marker.setVisible(false);
        if (!this.target && this.pendingInteraction) {
          const id = this.pendingInteraction;
          this.pendingInteraction = undefined;
          const target = this.interactionPosition(id);
          if (target && Math.hypot(target.x - this.local.x, target.y - this.local.y) <= INTERACTION_DISTANCE) this.triggerInteraction(id);
        }
      } else { vx = dx / distance; vy = dy / distance; }
    }
    if (roomRevision !== this.roomRevision) return;
    const nextX = this.local.x + vx * WALK_SPEED * seconds;
    const nextY = this.local.y + vy * WALK_SPEED * seconds;
    if (this.navigation.canWalkSegment(this.local.x, this.local.y, nextX, nextY)) {
      this.local.x = nextX;
      this.local.y = nextY;
    } else {
      // Let keyboard movement slide gently along walls and planting beds.
      if (this.navigation.canWalkSegment(this.local.x, this.local.y, nextX, this.local.y)) this.local.x = nextX;
      if (this.navigation.canWalkSegment(this.local.x, this.local.y, this.local.x, nextY)) this.local.y = nextY;
    }
    const localDx = this.local.x - previousX;
    const localDy = this.local.y - previousY;
    const moving = Math.hypot(localDx, localDy) > 0.05;
    this.animateCharacter(this.local, localDx, localDy, this.elapsed);

    if (!this.interiorSpec && this.elapsed - this.lastSent > 1 / 15) {
      const x = this.local.x / WIDTH;
      const y = this.local.y / HEIGHT;
      if (Math.abs(x - this.lastX) + Math.abs(y - this.lastY) > 0.0003) {
        this.lastSent = this.elapsed;
        this.lastX = x;
        this.lastY = y;
        this.owner.move(x, y);
      }
    }
    const characterView = this.cameras.main.worldView;
    for (const npc of this.characters.values()) {
      const visible = npc.x >= characterView.x - 100 && npc.x <= characterView.right + 100
        && npc.y >= characterView.y - 110 && npc.y <= characterView.bottom + 100;
      npc.root.setVisible(visible && !this.terrainOnly);
      if (!visible) continue;
      this.animateCharacter(npc, 0, 0, this.elapsed + npc.phase);
      const near = this.controlsEnabled && this.windowFocused && Math.hypot(npc.x - this.local.x, npc.y - this.local.y) < INTERACTION_DISTANCE;
      const show = this.controlsEnabled && this.windowFocused && (near || !!npc.hovered);
      npc.halo?.setVisible(show).setAlpha(near ? 1 : .65);
      npc.name.setVisible(show);
      npc.role?.setVisible(show && !this.mobileCamera);
      npc.hint?.setVisible(show);
      if (npc.marker) {
        npc.marker.setVisible(!this.watching && this.objective === npc.id && !show);
        npc.marker.y = -96 + (this.reducedMotion ? 0 : Math.sin(this.elapsed * 2 + npc.phase) * 1.5);
      }
    }
    const interpolation = 1 - Math.exp(-12 * seconds);
    for (const peer of this.peers.values()) {
      const dx = peer.targetX - peer.x;
      const dy = peer.targetY - peer.y;
      peer.x += dx * interpolation;
      peer.y += dy * interpolation;
      this.animateCharacter(peer, dx * interpolation, dy * interpolation, this.elapsed + peer.phase);
      peer.name.setVisible(Math.hypot(peer.x - this.local.x, peer.y - this.local.y) < 180 || !!peer.hovered);
    }
    this.updateWorldTime(seconds);
    if (!this.interiorSpec) this.updateResidents();
    this.updateObjects(this.elapsed);
    this.updatePortals();
    if (this.interior) this.interior.update(this.decorativeElapsed, this.cameras.main.worldView);
    else this.scenery?.update(this.decorativeElapsed, this.cameras.main.worldView);
    if (this.watching && !this.reducedMotion) this.tourTime += seconds;
    this.refreshNearby();
    if (this.marker.visible) this.marker.setScale(this.reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 4) * 0.04);
    const lead = 1 - Math.exp(-5 * seconds);
    this.cameraLead.x += ((moving ? vx * (this.mobileCamera ? 55 : 24) : 0) - this.cameraLead.x) * lead;
    this.cameraLead.y += ((moving ? vy * (this.mobileCamera ? 36 : 18) : 0) - this.cameraLead.y) * lead;
    this.frameCamera(1 - Math.exp(-5 * seconds));
  }

  private frameCamera(follow: number): void {
    const camera = this.cameras.main;
    if (this.watching) {
      // A slow, continuous tour. Motion stays on the artwork when the camera rests.
      const zoom = this.fitZoom * (1.12 + Math.sin(this.tourTime * .045) * .04);
      camera.setZoom(zoom);
      const centerX = 768 + Math.sin(this.tourTime * .036) * 440;
      const centerY = 540 + Math.sin(this.tourTime * .027) * 155;
      const targetX = clamp(centerX - camera.width / zoom / 2, 0, Math.max(0, WIDTH - camera.width / zoom));
      const targetY = clamp(centerY - camera.height / zoom / 2, 0, Math.max(0, HEIGHT - camera.height / zoom));
      camera.scrollX += (targetX - camera.scrollX) * follow;
      camera.scrollY += (targetY - camera.scrollY) * follow;
      return;
    }
    camera.setZoom(this.fitZoom);
    const viewWidth = camera.width / camera.zoom;
    const viewHeight = camera.height / camera.zoom;
    const targetScrollX = clamp(this.local.x + this.cameraLead.x - viewWidth / 2, 0, Math.max(0, WIDTH - viewWidth));
    const targetScrollY = clamp(this.local.y + this.cameraLead.y - viewHeight * (this.mobileCamera ? 0.56 : 0.54), 0, Math.max(0, HEIGHT - viewHeight));
    camera.scrollX += (targetScrollX - camera.scrollX) * follow;
    camera.scrollY += (targetScrollY - camera.scrollY) * follow;
  }

  private animateCharacter(character: Character, dx: number, dy: number, time: number): void {
    this.fitCharacterToRoom(character);
    character.root.setPosition(character.x, character.y).setDepth(character.y + 10);
    const distance = Math.hypot(dx, dy);
    if (!character.npc && this.playerArtReady) {
      if (distance > 0.05) {
        // Keep the facing stable around diagonal direction boundaries.
        const horizontal = Math.abs(dx) > Math.abs(dy) * (character.facing % 2 ? 0.88 : 1.12);
        character.facing = horizontal ? (dx >= 0 ? 1 : 3) : (dy >= 0 ? 0 : 2);
        character.walkDistance = (character.walkDistance + distance) % 150;
        const frame = character.facing * PLAYER_ART.columns + Math.floor(character.walkDistance / 150 * PLAYER_ART.columns);
        this.setCharacterFrame(character, frame);
      } else {
        character.walkDistance = 0;
        this.setCharacterFrame(character, PLAYER_ART.idle + character.facing);
      }
    }
    if (character.idleAnimation) {
      if (character.localArtVariant !== undefined && distance > .05) character.figure.setFlipX(dx < -.05);
      const frame = this.interiorSpec ? character.idleAnimation.frames[0]
        : sampleSceneryFrame(character.idleAnimation, character.id, this.decorativeElapsed);
      if (frame !== character.idleFrame) { character.figure.setFrame(frame); character.idleFrame = frame; }
      return;
    }
    // The ground pivot never moves. Breathing is deliberately smaller than a
    // pixel, with no spinning, bobbing, detached feet or stretched strides.
    const breathe = distance > 0.05 || this.reducedMotion ? 1 : 1 + Math.sin(time * 1.7 + character.phase) * 0.002;
    for (const layer of character.layers) layer.setScale(character.artScale, character.artScale * breathe);
  }

  private updateResidents(): void {
    const view = this.cameras.main.worldView;
    for (const { character, motion, sample } of this.residents) {
      const position = sampleResidentMotion(motion, this.decorativeElapsed, sample);
      const dx = position.x - character.x;
      const dy = position.y - character.y;
      character.x = position.x;
      character.y = position.y;
      const visible = character.x >= view.x - 90 && character.x <= view.right + 90
        && character.y >= view.y - 100 && character.y <= view.bottom + 100;
      character.root.setVisible(visible && !this.terrainOnly);
      if (!visible) continue;
      this.animateCharacter(character, this.reducedMotion ? 0 : dx, this.reducedMotion ? 0 : dy, this.elapsed);
      // Passing locals have no quest markers or player labels to crowd the map.
      character.name.setVisible(!position.moving && this.controlsEnabled
        && Math.hypot(character.x - this.local.x, character.y - this.local.y) < 100);
    }
  }

  private setCharacterFrame(character: Character, frame: number): void {
    if (character.frame === frame) return;
    character.frame = frame;
    for (const layer of character.layers) layer.setFrame(frame);
  }

  private fitCharacterToRoom(character: Character): void {
    const art = character.npc || !this.playerArtReady ? NPC_ART : PLAYER_ART;
    const canvasHeight = character.idleAnimation?.height ?? art.height;
    const bodyHeight = character.idleAnimation ? canvasHeight - 6 : art.bodyHeight;
    const indoors = !!this.interiorSpec;
    const scale = characterArtScale(bodyHeight, canvasHeight, indoors);
    if (character.artScale === scale) return;
    character.artScale = scale;
    for (const layer of character.layers) layer.setScale(scale);
    character.shadow.setDisplaySize(indoors ? 43 : 31, indoors ? 17 : 12);
    character.name.setY(indoors ? -INTERIOR_CHARACTER_HEIGHT - 12 : -79);
  }

  private avatarPalette(avatar: Avatar): { outfit: number; hair: number; skin: number } {
    const tint = (value: string, fallback: string) => parseInt(color(value, fallback).slice(1), 16);
    return { outfit: tint(avatar.outfit, DEFAULT_AVATAR.outfit), hair: tint(avatar.hair, DEFAULT_AVATAR.hair), skin: tint(avatar.skin, DEFAULT_AVATAR.skin) };
  }

  private tintCharacter(character: Character): void {
    if (character.npc || character.layers.length !== 4) return;
    const palette = this.avatarPalette(character.avatar);
    const shadows = playerMaterialShadows(palette);
    const tints = [0xffffff, palette.outfit, palette.hair, palette.skin];
    for (let layer = 1; layer < character.layers.length; layer++) {
      character.layers[layer].setTint(tints[layer]).setTint2(shadows[layer]).setTintMode(Phaser.TintModes.MULTIPLY_TWO);
    }
  }

  private setCharacterAmbient(character: Character): void {
    if (character.localArtVariant !== undefined) character.figure.setTint(worldAmbient(this.mapSpec.id,this.period).people);
  }

  private createCharacter(id: string, name: string, x: number, y: number, avatar: Avatar, role?: string, npcFrame = -1, localArtVariant?: number): Character {
    const npc = npcFrame >= 0;
    const shadow = this.add.image(0, 2, 'character-shadow').setDisplaySize(31, 12);
    const frame = npc ? npcFrame : PLAYER_ART.idle;
    const art = npc || !this.playerArtReady ? NPC_ART : PLAYER_ART;
    const keys = !npc && this.playerArtReady ? PLAYER_LAYERS : [NPC_ART.key];
    const idleManifest = this.cache.json.get('residents-animations') as SceneryAnimationManifest | undefined;
    const localKey = regionPeopleKey(this.mapSpec.id);
    const variant = (localArtVariant ?? 0) % 4;
    const localFrame = `person-${variant}-0`;
    const hasLocalArt = localArtVariant !== undefined && this.textures.exists(localKey) && this.textures.get(localKey).has(localFrame);
    const localFrameSize = hasLocalArt ? this.textures.get(localKey).get(localFrame) : undefined;
    const authoredIdle: SceneryAnimation | undefined = hasLocalArt ? {
      key: localKey, frames: Array.from({ length: 4 }, (_, frame) => `person-${variant}-${frame}`), fps: 3,
      width: localFrameSize!.width, height: localFrameSize!.height, referenceWidth: localFrameSize!.width, originX: .5, originY: 1,
    } : npc ? idleManifest?.assets[id] : undefined;
    const idleAnimation = authoredIdle && this.textures.exists(authoredIdle.key) ? authoredIdle : undefined;
    const idleFrame = idleAnimation ? sampleSceneryFrame(idleAnimation, id, this.decorativeElapsed) : undefined;
    const artScale = 82 / (idleAnimation?.height ?? art.height);
    const layers = idleAnimation ? [this.add.image(0, 0, idleAnimation.key, idleFrame).setOrigin(idleAnimation.originX, idleAnimation.originY).setScale(artScale)] : keys.map(key => this.add.image(0, 0, key, npc ? frame : this.playerArtReady ? frame : 7).setOrigin(0.5, art.footY).setScale(artScale));
    const figure = layers[0];
    const nameText = this.add.text(0, -79, name, { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff6e2', stroke: '#25362d', strokeThickness: 3 }).setOrigin(0.5).setVisible(!npc);
    const root = this.add.container(x, y, [shadow, ...layers, nameText]).setDepth(y + 10);
    let roleText: Phaser.GameObjects.Text | undefined;
    if (role) {
      roleText = this.add.text(0, 13, role, { fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#f4e6c2', stroke: '#263a31', strokeThickness: 2 }).setOrigin(0.5).setVisible(false);
      root.add(roleText);
    }
    const character: Character = { id, root, figure, layers, shadow, name: nameText, role: roleText, x, y, targetX: x, targetY: y, phase: Math.random() * 6.28, facing: 0, walkDistance: 0, frame, npc, artScale, avatar, idleAnimation, idleFrame, localArtVariant };
    this.fitCharacterToRoom(character);
    this.tintCharacter(character);
    this.setCharacterAmbient(character);
    return character;
  }

  private updatePortals(): void {
    const view = this.cameras.main.worldView;
    for (const portal of this.portals.values()) {
      const visible = portal.x >= view.x - 100 && portal.x <= view.right + 100
        && portal.y >= view.y - 100 && portal.y <= view.bottom + 100;
      portal.root.setVisible(visible && !this.terrainOnly);
      const near = this.controlsEnabled && this.windowFocused
        && Math.hypot(portal.x - this.local.x, portal.y - this.local.y) < INTERACTION_DISTANCE;
      portal.halo.setAlpha(near || portal.hovered ? .95 : .45);
      portal.label.setAlpha(near || portal.hovered ? 1 : .8);
    }
  }

  private updateObjects(time: number): void {
    const view = this.cameras.main.worldView;
    const nearestId = this.interiorSpec ? this.findNearestInteraction()?.id : undefined;
    for (const object of this.objects.values()) {
      const visible = object.x >= view.x - 100 && object.x <= view.right + 100 && object.y >= view.y - 100 && object.y <= view.bottom + 100;
      object.root.setVisible(visible && !this.terrainOnly && !this.watching);
      if (!visible) continue;
      const near = this.controlsEnabled && this.windowFocused && Math.hypot(object.x - this.local.x, object.y - this.local.y) < INTERACTION_DISTANCE;
      const highlighted = this.controlsEnabled && this.windowFocused && (near || object.hovered);
      const active = Math.max(0, object.activatedUntil - time) / 4;
      const phase = (this.reducedMotion ? 0 : time * 2) + object.x / 170;
      object.label.setVisible(highlighted && (!this.interiorSpec || object.hovered || nearestId === object.interactionId));
      object.halo.setAlpha(highlighted ? .9 : .32 + active * .5).setScale(this.reducedMotion ? 1 : 1 + active * Math.sin(time * 8) * .15);
      // The clue flares on discovery; fountains/lanterns also animate in place.
      object.marker.setAlpha(highlighted ? .95 : .5 + Math.sin(phase) * .12 + active * .3);
      object.marker.setScale(.65 + active * .4 + Math.sin(phase) * .055);
      object.marker.y = -8 + (this.reducedMotion ? 0 : Math.sin(phase) * 1.5);
    }
  }

  private createMarkerTexture(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffe5ab, .8).fillPoints([new Phaser.Math.Vector2(16, 2), new Phaser.Math.Vector2(20, 12), new Phaser.Math.Vector2(30, 16), new Phaser.Math.Vector2(20, 20), new Phaser.Math.Vector2(16, 30), new Phaser.Math.Vector2(12, 20), new Phaser.Math.Vector2(2, 16), new Phaser.Math.Vector2(12, 12)], true);
    graphics.fillStyle(0xfff6d9, 1).fillCircle(16, 16, 2);
    graphics.generateTexture('discovery', 32, 32);
    graphics.destroy();

  }

}
