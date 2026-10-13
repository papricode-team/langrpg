import * as Phaser from 'phaser';
import type { MapPoint } from './navigation';
import { getMap, type MapId } from './maps';
import { characterFrame } from './avatar-options';
import { paintCharacter } from './modular-character';
import { normalizeScreenFilterSettings, type ScreenFilterSettings } from './screen-filter-settings';
import { canvasSize } from './world-camera';
import { WorldAudio } from './world-audio';
import { CutsceneScene, type CutsceneKind } from './cutscene';
import { WorldClock, type WorldTimeOptions, type WorldTimeState, type WorldPeriod } from './world-clock';
import type { InteriorId } from './interiors';
import type { ActivityResidentSample } from './resident-activities';
import type { WorldWeatherMode } from './world-weather';
import type { RoutineLexeme, WorldBark } from './world-routines';
import type { Progress } from './api';
import { BootScene } from './boot-scene';
import { WorldScene } from './world-scene';
import { InteriorScene } from './interior-scene';
import { TravelScene, raiseTravelCurtain } from './travel-scene';
import type { ExploreScene } from './explore-scene';
import { readWorld, SceneKeys, WorldEvents, writeWorld, type Avatar, type WorldMotion, type WorldPlayer, type WorldPresentation, type WorldRegistry, type WorldStoryState } from './world-state';

export type { Avatar, WorldPlayer, WorldMotion, WorldStoryState, WorldPresentation } from './world-state';

export interface WorldOptions {
  motion?: WorldMotion;
  time?: WorldTimeOptions;
  onTimeChange?: (state: WorldTimeState) => void;
  onNpc: (id: string) => void;
  onMove: (x: number, y: number) => void;
  onReady?: () => void;
  onNearby?: (id: string | undefined) => void;
  onObject?: (id: string) => void;
  onMiniGame?: (id: string) => void;
  onMapReady?: (id: MapId) => void;
  onInteriorChange?: (id: InteriorId | undefined) => void;
  onInteriorInteract?: (id: string) => void;
  onBarkShown?: (bark: WorldBark) => void;
  onCinematicLine?: (speaker: string, german: string, clipId: string) => void;
  onCinematicEnd?: () => void;
}

const DEFAULT_AVATAR: Avatar = { hair: '#4d3229', skin: '#dfad85', outfit: '#497d75' };
type WorldStats = { objects: number; animated: number; residents: number; seconds: number; period: WorldPeriod; fps: number; frameMs: number; p95FrameMs: number };

/**
 * The page's handle on the Phaser game. State goes into the registry, which scenes follow;
 * commands go to whichever explore scene is active; scene events come back as callbacks.
 */
export class World {
  private game: Phaser.Game;
  private observer: ResizeObserver;
  private clock: WorldClock;
  private audio: WorldAudio;
  private alive = true;
  private presentation: WorldPresentation = 'live';
  private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private motionMode: WorldMotion;
  private size = '';
  /** Commands for a scene that is still loading or asleep run as soon as it can take them. */
  private pending: ((scene: ExploreScene) => void)[] = [];
  private handleMotionPreference = () => this.set('reducedMotion', this.reducedMotion);

  constructor(private container: HTMLElement, private options: WorldOptions) {
    this.motionMode = options.motion ?? 'auto';
    this.clock = new WorldClock(options.time);
    const size = canvasSize(container.clientWidth, container.clientHeight, window.devicePixelRatio);
    this.size = `${size.width}x${size.height}@${size.density}`;
    // The sound manager exists only after boot; read it from the game when audio first plays.
    this.audio = new WorldAudio({ get sound() { return game.sound; }, get cache() { return game.cache; } });
    const seed = (target: Phaser.Game) => {
      const initial: WorldRegistry = {
        mapId: 'lindenhafen', interiorId: undefined, players: { players: [], selfId: '' }, avatar: DEFAULT_AVATAR,
        objective: undefined, storyState: { completedQuestIds: [], bellCount: 0 }, conversationTarget: undefined, cinematicBeat: undefined,
        inputEnabled: true, windowFocused: typeof document === 'undefined' || document.hasFocus(), reducedMotion: this.reducedMotion,
        watching: false, terrainOnly: false, screenFilter: normalizeScreenFilterSettings(undefined),
        learning: { lexicon: [], progress: { words: {} } }, weatherPreview: 'regional', observedResident: undefined,
        density: size.density, clock: this.clock, audio: this.audio,
      };
      for (const [key, value] of Object.entries(initial)) target.registry.set(key, value);
    };
    const game: Phaser.Game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: size.width,
      height: size.height,
      scale: { zoom: 1 / size.density },
      backgroundColor: '#283e36',
      scene: [BootScene, WorldScene, InteriorScene, TravelScene,
        new CutsceneScene(beat => this.set('cinematicBeat', beat), (speaker, german, clipId) => options.onCinematicLine?.(speaker, german, clipId))],
      antialias: true,
      transparent: false,
      // Painted, linearly filtered art: whole-pixel snapping only adds shimmer against a fractional camera.
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
      fps: { target: 60, smoothStep: true },
      input: { activePointers: 2, gamepad: true },
      audio: { disableWebAudio: false },
      banner: false,
      callbacks: { preBoot: seed },
    });
    this.game = game;
    if (!game.registry.has('mapId')) seed(game);
    // Development builds expose the game for inspection from the browser console.
    if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { atlasGame: game, atlasWorld: this });
    this.bindEvents();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.motionPreference.addEventListener('change', this.handleMotionPreference);
  }

  private bindEvents(): void {
    const events = this.game.events, options = this.options;
    events.on(WorldEvents.Move, (x: number, y: number) => options.onMove(x, y));
    events.on(WorldEvents.Npc, (id: string) => options.onNpc(id));
    events.on(WorldEvents.Object, (id: string) => options.onObject?.(id));
    events.on(WorldEvents.MiniGame, (id: string) => options.onMiniGame?.(id));
    events.on(WorldEvents.Nearby, (id: string | undefined) => options.onNearby?.(id));
    events.on(WorldEvents.MapReady, (id: MapId) => options.onMapReady?.(id));
    events.on(WorldEvents.InteriorInteract, (id: string) => options.onInteriorInteract?.(id));
    events.on(WorldEvents.Bark, (bark: WorldBark) => options.onBarkShown?.(bark));
    events.on(WorldEvents.Time, (state: WorldTimeState) => options.onTimeChange?.(state));
    events.on(WorldEvents.InteriorChange, (id: InteriorId | undefined) => { options.onInteriorChange?.(id); });
    events.on(WorldEvents.ExploreReady, () => { this.flush(); this.applyPresentation(); });
    events.on(WorldEvents.Ready, () => {
      this.game.canvas?.setAttribute('aria-label', 'Lantern Atlas game world. Use WASD, arrow keys, the touch joystick, or tap a destination. Press E or the action button to speak or investigate nearby.');
      this.game.canvas?.setAttribute('role', 'application');
      options.onReady?.();
    });
    events.on(Phaser.Core.Events.BLUR, () => this.set('windowFocused', false));
    events.on(Phaser.Core.Events.FOCUS, () => this.set('windowFocused', true));
  }

  private get reducedMotion(): boolean {
    return this.motionMode === 'reduced' || this.motionMode === 'auto' && this.motionPreference.matches;
  }
  private set<K extends keyof WorldRegistry>(key: K, value: WorldRegistry[K]): void {
    if (this.alive) writeWorld(this.game.registry, key, value);
  }
  private get world(): WorldScene { return this.game.scene.getScene(SceneKeys.World) as WorldScene; }
  private get interior(): InteriorScene { return this.game.scene.getScene(SceneKeys.Interior) as InteriorScene; }
  private get activeKey(): typeof SceneKeys.World | typeof SceneKeys.Interior {
    return readWorld(this.game.registry, 'interiorId') ? SceneKeys.Interior : SceneKeys.World;
  }
  /** The scene the player is in, once it can take commands. */
  private get explore(): ExploreScene | undefined {
    const scene = this.activeKey === SceneKeys.Interior ? this.interior : this.world;
    return scene?.ready && scene.sys.isActive() ? scene : undefined;
  }
  private withExplore(command: (scene: ExploreScene) => void): void {
    const scene = this.explore;
    if (scene) command(scene); else this.pending.push(command);
  }
  private flush(): void {
    const scene = this.explore;
    if (!scene) return;
    const commands = this.pending; this.pending = [];
    for (const command of commands) command(scene);
  }
  private get townReady(): WorldScene | undefined {
    const world = this.world;
    return world?.ready ? world : undefined;
  }

  // State --------------------------------------------------------------------

  setPlayers(players: WorldPlayer[], selfId: string): void { this.set('players', { players, selfId }); }
  setAvatar(avatar: Avatar): void { this.set('avatar', avatar); }
  setMotionPreference(mode: WorldMotion): void { this.motionMode = mode; this.handleMotionPreference(); }
  setScreenFilter(settings: ScreenFilterSettings): void { this.set('screenFilter', normalizeScreenFilterSettings(settings)); }
  screenFiltersSupported(): boolean { return this.game.renderer?.type === Phaser.WEBGL; }
  /** A quiet camera tour; scenery and residents use the same runtime as play. */
  setWatchMode(watching: boolean): void { this.set('watching', watching); }
  /** Development art inspection without replacing the live scene. */
  setTerrainOnly(terrainOnly: boolean): void { this.set('terrainOnly', terrainOnly); }
  setConversationTarget(id: string | undefined): void { this.set('conversationTarget', id); }
  setStoryState(state: WorldStoryState): void { this.set('storyState', state); }
  setObjective(npcId: string | undefined): void { this.set('objective', npcId); }
  setInputEnabled(enabled: boolean): void { this.set('inputEnabled', enabled); }
  setAudioPreferences(preferences: { silent: boolean; muted: boolean }): void { this.audio.setPreferences(preferences); }
  setNarrationActive(active: boolean): void { if (this.alive) this.audio.setNarration(active); }
  setSharedClock(state: Parameters<WorldClock['setSharedTime']>[0]): void { this.clock.setSharedTime(state); }
  setLearningContext(lexicon: readonly RoutineLexeme[], progress: Pick<Progress, 'words'>, introduced?: ReadonlySet<string>, lineAllowed?: (german: string) => boolean): void {
    this.set('learning', { lexicon, progress, introduced, lineAllowed });
  }
  setTimePreference(options: WorldTimeOptions): void { this.clock.configure(options); }
  getWorldTime(): WorldTimeState { return this.clock.advance(0); }
  observeResident(id?: string): void { this.set('observedResident', id); }
  /** Editor/QA weather changes cannot override a connected simulation. */
  setWeatherPreview(mode: WorldWeatherMode): void { if (import.meta.env.DEV) this.set('weatherPreview', mode); }

  /**
   * How the scene behind the DOM layers is shown: live, paused (still drawn, nothing advances)
   * or hidden (paused and not drawn, for full-screen activities).
   */
  setPresentation(presentation: WorldPresentation): void {
    this.presentation = presentation;
    this.applyPresentation();
  }
  private applyPresentation(): void {
    if (!this.alive) return;
    const manager = this.game.scene, key = this.activeKey, scene = manager.getScene(key);
    this.audio.setVisible(this.presentation === 'live');
    if (!scene || !(scene as ExploreScene).ready) return;
    const status = scene.sys.settings.status;
    if (status !== Phaser.Scenes.RUNNING && status !== Phaser.Scenes.PAUSED) return;
    if (this.presentation === 'live') { if (status === Phaser.Scenes.PAUSED) manager.resume(key); scene.sys.setVisible(true); }
    else { if (status === Phaser.Scenes.RUNNING) manager.pause(key); scene.sys.setVisible(this.presentation === 'paused'); }
  }

  // Inspection ---------------------------------------------------------------

  getWorldStats(): WorldStats {
    const interior = this.activeKey === SceneKeys.Interior && this.interior?.ready ? this.interior : undefined;
    const stats = interior?.worldStats ?? this.townReady?.worldStats;
    return stats ?? { objects: 0, animated: 0, residents: 0, seconds: 0, period: this.clock.advance(0).period, fps: 0, frameMs: 0, p95FrameMs: 0 };
  }
  getTerrainStats(): { width: number; height: number; pixelZoom: number; textures: number; pixels: number; pending: number; failed: number } {
    return this.townReady?.terrainStats ?? { width: 0, height: 0, pixelZoom: 0, textures: 0, pixels: 0, pending: 0, failed: 0 };
  }
  getActivityResidents(): { id: string; name: string; state: ActivityResidentSample }[] { return this.townReady?.activityResidentStates ?? []; }
  getWeather(): number { return this.townReady?.rainIntensity() ?? 0; }

  // Story beats --------------------------------------------------------------

  playCutscene(kind: CutsceneKind, ending?: string): Promise<void> {
    if (!this.townReady || this.reducedMotion) return Promise.resolve();
    if (this.game.scene.isActive(SceneKeys.Cinematic)) return Promise.resolve();
    const mapId = readWorld(this.game.registry, 'mapId');
    return new Promise(resolve => this.game.scene.run(SceneKeys.Cinematic, { kind, mapId, ending, complete: () => {
      this.options.onCinematicEnd?.();
      resolve();
    } }));
  }

  /** Draw the same painted south-facing avatar used in the game, CPU only. */
  renderAvatarPreview(canvas: HTMLCanvasElement, avatar: Avatar, facing = 0, phase?: number): boolean {
    void paintCharacter(canvas, avatar, characterFrame(facing, phase)).catch(() => canvas.setAttribute('aria-label', 'Character artwork could not load'));
    return true;
  }

  // Commands -----------------------------------------------------------------

  focusNpc(id: string): void { this.withExplore(scene => scene.approachNpc(id)); }
  focusObject(id: string): void { this.withExplore(scene => scene.approachObject(id)); }
  /** Walk to the real doorway selected from the places panel. */
  focusBuilding(id: InteriorId): void {
    const current = readWorld(this.game.registry, 'interiorId');
    if (current === id) return;
    if (current) this.leaveInterior();
    this.withExplore(scene => (scene as WorldScene).approachBuilding?.(id));
  }
  /** Returns true only when an enabled nearby conversation or discovery starts. */
  interactNearest(): boolean { return this.explore?.interactNearest() ?? false; }
  /** Virtual stick: x points right, y points down; release/cancel with (0, 0). */
  setJoystick(x: number, y: number): void {
    const active = readWorld(this.game.registry, 'inputEnabled');
    this.explore?.setJoystick(active && Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0, active && Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0);
  }

  /** Switch after the server acknowledges travel; snapshots restore saved positions. */
  setMap(id: MapId): void {
    const map = getMap(id).id;
    const previous = readWorld(this.game.registry, 'mapId');
    const interior = this.interior;
    if (readWorld(this.game.registry, 'interiorId') || interior?.sys.isActive()) {
      this.set('interiorId', undefined);
      this.game.scene.stop(SceneKeys.Interior);
      this.game.events.emit(WorldEvents.InteriorChange, undefined);
    }
    this.set('mapId', map);
    // The acknowledgement is followed by a fresh player snapshot. Replaying an
    // old same-map snapshot here would consume its authoritative first snap.
    this.set('players', { players: [], selfId: readWorld(this.game.registry, 'players').selfId });
    this.pending = [];
    const world = this.townReady;
    if (!world) {
      // Still booting; the boot scene starts whichever map the registry names.
      const scene = this.world;
      if (scene && scene.sys.settings.status >= Phaser.Scenes.START && previous !== map) scene.scene.restart({ mapId: map });
      return;
    }
    if (world.mapSpec.id === map) {
      if (world.scene.isSleeping()) world.scene.wake(SceneKeys.World, { instant: true });
      world.returnToSpawn();
      return;
    }
    raiseTravelCurtain(world, getMap(map).name);
    world.scene.restart({ mapId: map });
  }

  enterInterior(id: InteriorId): void { this.townReady?.enterInterior(id); }

  leaveInterior(): void {
    const status = this.interior?.sys.settings.status ?? Phaser.Scenes.PENDING;
    if (readWorld(this.game.registry, 'interiorId') && status >= Phaser.Scenes.START && status <= Phaser.Scenes.SLEEPING) this.interior.leave();
    else this.townReady?.cancelEntrance();
  }

  getInteriorId(): InteriorId | undefined { return readWorld(this.game.registry, 'interiorId'); }

  /** Apply a room the server confirmed, without the doorway walk, then accept its next player snapshot. */
  confirmInterior(id: InteriorId | undefined): void {
    const current = readWorld(this.game.registry, 'interiorId');
    if (id === current) { this.withExplore(scene => scene.resetPlayerPosition()); return; }
    if (current) this.interior.leave(true);
    if (id) this.townReady?.openInterior(id, true);
  }

  // Delivery run -------------------------------------------------------------

  getPlayerPosition(): MapPoint | undefined { const scene = this.explore; return scene instanceof WorldScene ? scene.playerPosition() : undefined; }
  deliveryRoute(): { recipient: string; points: MapPoint[] } | undefined { const scene = this.explore; return scene instanceof WorldScene ? scene.deliveryRoute() : undefined; }
  deliveryChoices(origin: MapPoint, target: MapPoint): MapPoint[] { return this.townReady?.deliveryChoices(origin, target) ?? [target]; }
  showDeliveryCheckpoints(points: readonly MapPoint[], lit: number): void { this.townReady?.showDeliveryCheckpoints(points, lit); }
  showDeliveryArrival(recipient: string): void { this.townReady?.showDeliveryArrival(recipient); }
  /** Run a callback each frame the town scene advances; paused or sleeping scenes skip it. Returns the unsubscribe. */
  onFrame(callback: (deltaMs: number) => void): () => void {
    const handler = (_time: number, delta: number) => { if (this.townReady?.sys.isActive()) callback(delta); };
    this.game.events.on(Phaser.Core.Events.POST_STEP, handler);
    return () => this.game.events.off(Phaser.Core.Events.POST_STEP, handler);
  }

  // Canvas -------------------------------------------------------------------

  /** Physical pixels track the container and device ratio; scenes refit their cameras on the scale event. */
  resize(): void {
    if (!this.alive) return;
    const size = canvasSize(Math.max(this.container.clientWidth, 1), Math.max(this.container.clientHeight, 1), window.devicePixelRatio);
    const key = `${size.width}x${size.height}@${size.density}`;
    if (key === this.size) return;
    this.size = key;
    this.set('density', size.density);
    this.game.scale.resize(size.width, size.height);
    // Refresh zoom after the backing size: Phaser leaves the previous inline
    // CSS dimensions in place when resize runs at zoom=1.
    this.game.scale.setZoom(1 / size.density);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.observer.disconnect();
    this.motionPreference.removeEventListener('change', this.handleMotionPreference);
    this.audio.destroy();
    this.game.destroy(true);
  }
}
