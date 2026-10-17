import { BuildingDoorEffect, type BuildingDoorGeometry } from './building-door';
import * as Phaser from 'phaser';
import { npcs } from './content';
import type { NavigationGrid, MapPoint } from './navigation';
import { castPresent } from './cast-presence';
import type { WorldObjectSpec, WorldMapSpec } from './maps';
import { NPC_ART, INTERIOR_CHARACTER_HEIGHT, characterArtScale, createContactShadow } from './character-art';
import { characterFrame, MODULAR_ART, NATIVE_MODULAR_ART } from './avatar-options';
import { advanceWalkDistance, WALK_POSE_COLUMNS, walkSpeedForHeight } from './walk-animation';
import { normalizeAvatar, avatarTextureKey } from './character-recipe.mjs';
import { acquireAvatarTexture, bakeAvatarTexture } from './avatar-baker';
import type { TextureLease } from './avatar-texture-cache';
import { castActor, CAST_ART } from './character-cast';
import { residentWalkFrame } from './resident-animation';
import { setDepthIfChanged, worldDepth } from './world-depth';
import { getExpeditionNpc } from './expeditions';
import { explorationZoom, conversationZoom, CameraRig } from './world-camera';
import type { WorldAudio } from './world-audio';
import { gamepadInput, type PadInput } from './world-gamepad';
import { FrameTelemetry } from './world-performance';
import { sampleSceneryFrame, type SceneryAnimation } from './scenery-animation';
import type { WorldClock, WorldTimeState } from './world-clock';
import type { CameraBeat } from './cutscene';
import { createScreenFilter, type ScreenFilterController } from './screen-filters';
import { emitWorld, followWorld, readWorld, WorldEvents, type Avatar, type WorldPlayer, type WorldStoryState } from './world-state';
import { onGraphicsQualityChange } from './quality-state';

export interface Character {
  id: string;
  root: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  layers: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[];

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
  lastWalkTime?: number;
  frame: number;
  npc: boolean;
  artScale: number;
  breathe: number;
  avatar: Avatar;
  hovered?: boolean;
  interactionId?: string;
  idleAnimation?: SceneryAnimation;
  walkingAnimation?: SceneryAnimation;
  idleFrame?: string;
  localArtVariant?: number;
  castRow?: number;
  componentCast?: boolean;
  /** Native avatar bake for an NPC whose offline atlas is unavailable. */
  modularNpc?: boolean;
  nativePixels?: boolean;
  componentPoseSet?: string;
  avatarLease?: TextureLease<string>;
  avatarRevision?: number;
  avatarPending?: boolean;
  avatarRetryAt?: number;
  avatarDisposed?: boolean;
  ambientTint?: number;
}

export interface WorldObject {
  spec: WorldObjectSpec;
  x: number;
  y: number;
  root: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Ellipse;
  marker: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Zone;
  hovered: boolean;
  activatedUntil: number;
  interactionId: string;
}

export interface WorldPortal {
  id: string;
  x: number;
  y: number;
  root: Phaser.GameObjects.Container;
  halo?: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  glyph?: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Zone;
  hovered: boolean;
  door?: BuildingDoorGeometry;
  effect?: BuildingDoorEffect;
}

export interface ResidentGait { moving: boolean; distance: number; velocityX: number; velocityY: number; facingLeft?: boolean }

/** Pip is twelve: the shared adult mannequin is drawn smaller for him. */
export const childScale = (id: string): number => id === 'pip' ? .8 : 1;
export const INTERACTION_DISTANCE = 140;
export const DEFAULT_AVATAR: Avatar = { hair: '#4d3229', skin: '#dfad85', outfit: '#497d75' };
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const avatarKey = (avatar: Avatar) => avatarTextureKey(normalizeAvatar(avatar));
const typingElement = (focused: Element | null): boolean =>
  typeof HTMLElement !== 'undefined' && focused instanceof HTMLElement && (focused.matches('input, textarea, select') || focused.isContentEditable);
/** Focus changes invalidate the cached answer; a removed field (which may not fire focusout) is rechecked. */
let typingCache: { element: Element | null; typing: boolean } | undefined;
let typingListeners = false;
export const isTyping = (): boolean => {
  if (typeof document === 'undefined') return false;
  if (!typingListeners) {
    typingListeners = true;
    const invalidate = () => { typingCache = undefined; };
    document.addEventListener('focusin', invalidate, true);
    document.addEventListener('focusout', invalidate, true);
  }
  if (typingCache && (!typingCache.element || typingCache.element.isConnected)) return typingCache.typing;
  const element = document.activeElement;
  typingCache = { element, typing: typingElement(element) };
  return typingCache.typing;
};

/** Walking, talking and the camera: everything an outdoor map and a room share. */
export abstract class ExploreScene extends Phaser.Scene {
  ready = false;
  protected local!: Character;
  protected peers = new Map<string, Character>();
  protected characters = new Map<string, Character>();
  protected objects = new Map<string, WorldObject>();
  protected portals = new Map<string, WorldPortal>();
  protected navigation!: NavigationGrid;
  /** In edit mode the pointer selects objects instead of walking or talking. */
  protected editing = false;
  protected clock!: WorldClock;
  protected audio?: WorldAudio;
  protected storyState: WorldStoryState = { completedQuestIds: [], bellCount: 0 };
  protected conversationTarget?: string;
  protected cinematicTarget?: CameraBeat;
  protected objective?: string;
  protected density = 1;
  protected coverZoom = 1;
  protected fitZoom = 1;
  protected mobileCamera = false;
  protected elapsed = 0;
  protected decorativeElapsed = 0;
  protected controlsEnabled = false;
  protected inputAllowed = false;
  protected windowFocused = true;
  protected queuedKeyboardInteraction = false;
  protected joystick: MapPoint = { x: 0, y: 0 };
  protected smoothJoystick: MapPoint = { x: 0, y: 0 };
  protected nearbyInteraction?: string;
  protected cameraLead: MapPoint = { x: 0, y: 0 };
  protected playerArtReady = false;
  protected screenFilter?: ScreenFilterController;
  protected watching = false;
  protected terrainOnly = false;
  protected tourTime = 0;
  protected reducedMotion = false;
  protected keys?: Record<string, Phaser.Input.Keyboard.Key>;
  protected target?: MapPoint;
  protected waypoints: MapPoint[] = [];
  protected pendingInteraction?: string;
  protected marker!: Phaser.GameObjects.Container;
  protected lastX = -1;
  protected lastY = -1;
  protected initializedSelf = false;
  protected frames = new FrameTelemetry();
  /** Set while another scene takes over (a room opening); cleared when this scene resumes. */
  protected suspended = false;
  /** Smoothed camera centre and zoom; each mode decides where it should aim. */
  protected cameraRig = new CameraRig();
  private padMove: PadInput = { x: 0, y: 0, interact: false };
  private readonly padList: (Gamepad | null)[] = [null];
  private markerTweens: Phaser.Tweens.Tween[] = [];
  /** Resolution the scene's text labels were last rasterised at; only a density change re-renders them. */
  protected labelDensity = 0;
  private nextSendAt = 0;
  private lastClockLabel = '';

  abstract get worldWidth(): number;
  abstract get worldHeight(): number;
  /** The region whose painted locals and props this scene shows. */
  protected regionId = 'lindenhafen';
  /** Prefix for objects addressed by bare ID from menus and quest leads. */
  protected abstract readonly objectPrefix: 'object' | 'interior';
  protected abstract createNavigation(): NavigationGrid;
  protected abstract spawnPoint(): MapPoint;
  protected abstract spawnFacing(): number;
  /** Build the room or map once its assets are loaded. */
  protected abstract buildScene(): void;
  /** A portal was reached: a doorway outdoors, the exit indoors. */
  protected abstract usePortal(id: string): void;
  /** Subclasses add their own per-frame systems after shared movement. */
  protected abstract updateScene(seconds: number): void;
  /** Bodies inside rooms use the room painting's adult height. */
  protected get indoor(): boolean { return false; }
  protected get indoorCharacterHeight(): number { return INTERIOR_CHARACTER_HEIGHT; }

  /** Scenes restart on travel; reset everything the constructor would otherwise keep. */
  init(_data?: unknown): void {
    this.ready = false;
    this.peers = new Map(); this.characters = new Map(); this.objects = new Map(); this.portals = new Map();
    this.target = undefined; this.waypoints = []; this.pendingInteraction = undefined; this.nearbyInteraction = undefined;
    this.lastX = this.lastY = -1; this.initializedSelf = false; this.elapsed = 0; this.decorativeElapsed = 0;
    this.queuedKeyboardInteraction = false; this.joystick = { x: 0, y: 0 }; this.smoothJoystick = { x: 0, y: 0 };
    this.cameraLead = { x: 0, y: 0 }; this.tourTime = 0; this.markerTweens = []; this.frames = new FrameTelemetry(); this.suspended = false;
    // Field initialisers run once per scene instance; a restart (travel, a second room visit) must not
    // inherit the previous run's timers, which are measured against the `elapsed` reset above.
    this.nextSendAt = 0; this.lastClockLabel = ''; this.labelDensity = 0; this.frameClock = undefined;
    this.padMove = { x: 0, y: 0, interact: false }; this.cameraRig = new CameraRig();
    this.controlsEnabled = false; this.editing = false; this.mobileCamera = false;
    this.conversationTarget = undefined; this.cinematicTarget = undefined; this.keys = undefined;
  }

  create(): void {
    const registry = this.registry;
    this.clock = readWorld(registry, 'clock');
    this.audio = readWorld(registry, 'audio');
    this.density = readWorld(registry, 'density') ?? 1;
    // Labels built below take this resolution; fitCamera re-renders them only when it changes.
    this.labelDensity = this.density;
    this.storyState = readWorld(registry, 'storyState');
    this.objective = readWorld(registry, 'objective');
    this.reducedMotion = readWorld(registry, 'reducedMotion');
    this.watching = readWorld(registry, 'watching');
    this.terrainOnly = readWorld(registry, 'terrainOnly');
    this.inputAllowed = readWorld(registry, 'inputEnabled');
    this.windowFocused = readWorld(registry, 'windowFocused');
    this.cinematicTarget = readWorld(registry, 'cinematicBeat');
    this.navigation = this.createNavigation();
    createContactShadow(this);
    createDiscoveryTexture(this);
    this.playerArtReady = true;
    this.screenFilter = createScreenFilter(this);
    this.screenFilter?.configure(readWorld(registry, 'screenFilter'));
    this.marker = this.add.container(0, 0, [
      this.add.ellipse(0, 0, 37, 18).setStrokeStyle(1.5, 0xf5e4ac, 0.8),
      this.add.ellipse(0, 0, 6, 3, 0xf5e4ac, 0.8),
    ]).setDepth(1).setVisible(false);
    const spawn = this.spawnPoint();
    this.navigation.prepareReachability(spawn);
    this.local = this.createCharacter('self', 'You', spawn.x, spawn.y, readWorld(registry, 'avatar') ?? DEFAULT_AVATAR);
    this.local.facing = this.spawnFacing();
    this.local.name.setColor('#fff2ca');
    this.local.root.addAt(this.add.ellipse(0, 1, 31, 15).setStrokeStyle(1, 0xf6dd9a, 0.55), 1);
    this.bindInput();
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.buildScene();
    this.followRegistry();
    this.applyConversationTarget(readWorld(registry, 'conversationTarget'));
    const snapshot = readWorld(registry, 'players');
    if (snapshot) this.syncPlayers(snapshot.players, snapshot.selfId);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    // Baked avatars follow the graphics quality; a cached bake for the new tier applies at once.
    const stopQuality = onGraphicsQualityChange(() => {
      for (const character of this.actors()) if (character?.avatarLease && !character.avatarDisposed) this.tintCharacter(character);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopQuality();
      this.ready = false;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
      this.input.gamepad?.off('down', this.handlePadDown, this);
    });
    this.refreshControls();
    this.applyMarkerMotion();
    this.fitCamera(this.scale.width, this.scale.height, this.density);
    this.ready = true;
    // Subclasses finish their own create first; announce on the next tick of this scene's clock.
    this.time.delayedCall(0, () => emitWorld(this.game, WorldEvents.ExploreReady, this.sys.settings.key));
  }

  private followRegistry(): void {
    followWorld(this, 'players', snapshot => this.syncPlayers(snapshot.players, snapshot.selfId));
    followWorld(this, 'avatar', avatar => this.changeAvatar(avatar));
    followWorld(this, 'objective', id => { this.objective = id; });
    followWorld(this, 'storyState', state => this.setStoryState(state));
    followWorld(this, 'conversationTarget', id => this.applyConversationTarget(id));
    // With reduced motion the camera cuts to each story beat (and back to the player) instead of panning.
    followWorld(this, 'cinematicBeat', beat => { this.cinematicTarget = beat; this.refreshControls(); if (this.reducedMotion) this.snapCamera(); });
    followWorld(this, 'inputEnabled', enabled => { this.inputAllowed = enabled; this.refreshControls(); });
    followWorld(this, 'windowFocused', focused => { this.windowFocused = focused; this.refreshControls(); });
    followWorld(this, 'reducedMotion', reduced => this.setReducedMotion(reduced));
    followWorld(this, 'watching', watching => this.setWatchMode(watching));
    followWorld(this, 'terrainOnly', terrainOnly => this.setTerrainOnly(terrainOnly));
    followWorld(this, 'screenFilter', settings => this.screenFilter?.configure(settings));
    followWorld(this, 'density', density => { this.density = density; });
  }

  private bindInput(): void {
    this.keys = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
      arrowUp: Phaser.Input.Keyboard.KeyCodes.UP, arrowDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
      arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT, arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
    }, false) as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    // A key event keeps a short tap that ends before the next frame polls it.
    this.keys?.interact.on('down', (_key: Phaser.Input.Keyboard.Key, event?: KeyboardEvent) => {
      if (!event?.repeat && !isTyping()) this.queueKeyboardInteraction();
    });
    this.input.gamepad?.on('down', this.handlePadDown, this);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (!this.controlsEnabled || this.watching || this.editing || objects.length || pointer.rightButtonDown()) return;
      const destination = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.walkTo(destination.x, destination.y);
    });
  }

  private handlePadDown(_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button): void {
    if (button.index === 0) this.queueKeyboardInteraction();
  }

  /** A live resize (a phone's URL bar, rotation) eases the camera to its new framing instead of jumping. */
  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.fitCamera(gameSize.width, gameSize.height, this.density, false);
  }

  /** The registry permission, window focus and transient scene states all gate control. */
  protected refreshControls(): void {
    const enabled = this.inputAllowed && this.windowFocused && !this.cinematicTarget && !this.controlsHeld();
    if (enabled === this.controlsEnabled) { if (!enabled) this.clearControls(); return; }
    this.controlsEnabled = enabled;
    if (this.input.keyboard) this.input.keyboard.enabled = enabled;
    if (!enabled) this.clearControls();
    this.refreshNearby();
  }
  /** Doorway walk-ins and similar short transitions hold input. */
  protected controlsHeld(): boolean { return false; }

  setJoystick(x: number, y: number): void {
    const length = Math.hypot(x, y);
    if (!this.controlsEnabled || length <= 0.12) {
      this.joystick = { x: 0, y: 0 };
      this.smoothJoystick = { x: 0, y: 0 };
      return;
    }
    const strength = clamp((Math.min(length, 1) - 0.12) / 0.88, 0, 1);
    this.joystick = { x: x / length * strength, y: y / length * strength };
    this.cancelRoute();
  }

  clearControls(): void {
    this.queuedKeyboardInteraction = false;
    this.joystick = { x: 0, y: 0 };
    this.smoothJoystick = { x: 0, y: 0 };
    this.input?.keyboard?.resetKeys();
    this.cancelRoute();
    this.setNearby(undefined);
  }

  interactNearest(): boolean {
    if (!this.controlsEnabled || this.watching) return false;
    const nearest = this.findNearestInteraction();
    if (!nearest) return false;
    this.approachInteraction(nearest.id);
    return true;
  }

  queueKeyboardInteraction(): void {
    if (this.controlsEnabled) this.queuedKeyboardInteraction = true;
  }

  protected cancelRoute(): void {
    this.target = undefined;
    this.waypoints = [];
    this.pendingInteraction = undefined;
    this.marker?.setVisible(false);
  }

  protected characterRevealed(character: Character): boolean {
    if (character.id === this.conversationTarget) return true; // A reader can finish after visiting hours.
    return castPresent(character.id, this.regionId, this.storyState);
  }
  protected objectAvailable(_object: WorldObject): boolean { return true; }

  protected findNearestInteraction(): { id: string; x: number; y: number } | undefined {
    let nearest: { id: string; x: number; y: number } | undefined;
    let distance = INTERACTION_DISTANCE;
    for (const npc of this.characters.values()) {
      if (!this.characterRevealed(npc)) continue;
      const separation = Math.hypot(npc.x - this.local.x, npc.y - this.local.y);
      if (separation < distance) { distance = separation; nearest = { id: npc.interactionId ?? npc.id, x: npc.x, y: npc.y }; }
    }
    for (const object of this.objects.values()) {
      if (!this.objectAvailable(object)) continue;
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
    emitWorld(this.game, WorldEvents.Nearby, id);
  }

  protected refreshNearby(): void {
    if (!this.local) return;
    this.setNearby(this.controlsEnabled && !this.watching ? this.findNearestInteraction()?.id : undefined);
  }

  changeAvatar(avatar: Avatar): void {
    if (!this.local || avatarKey(this.local.avatar) === avatarKey(avatar)) return;
    this.local.avatar = avatar;
    this.tintCharacter(this.local);
  }

  setStoryState(state: WorldStoryState): void {
    this.storyState = state;
    for (const npc of this.characters.values()) if (!this.characterRevealed(npc)) npc.root.setVisible(false);
    this.refreshNearby();
  }

  protected applyConversationTarget(id: string | undefined): void {
    const npc = id ? this.characters.get(id) : undefined;
    this.conversationTarget = npc && this.characterRevealed(npc) ? id : undefined;
    if (npc && this.local && this.characterRevealed(npc)) this.faceCharacters(this.local, npc);
  }

  protected faceCharacters(player: Character, npc: Character): void {
    const dx = npc.x - player.x, dy = npc.y - player.y;
    player.facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 0 : 2;
    if (!player.npc && this.playerArtReady) this.setCharacterFrame(player, characterFrame(player.facing));
    npc.facing = (player.facing + 2) % 4;
    if (npc.componentCast || npc.modularNpc || !npc.npc && this.playerArtReady) this.setCharacterFrame(npc, characterFrame(npc.facing));
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.applyMarkerMotion();
  }

  setWatchMode(watching: boolean): void {
    this.watching = watching;
    this.tourTime = 0;
    this.clearControls();
    this.local?.root.setVisible(!watching && !this.terrainOnly);
    this.snapCamera();
  }

  setTerrainOnly(terrainOnly: boolean): void {
    this.terrainOnly = terrainOnly;
    this.local?.root.setVisible(!terrainOnly && !this.watching);
    for (const character of this.characters.values()) character.root.setVisible(!terrainOnly && this.characterRevealed(character));
    for (const character of this.peers.values()) character.root.setVisible(!terrainOnly);
  }

  /** A snapshot is authoritative for peers; the local player only snaps on first sight or large drift. */
  syncPlayers(players: readonly WorldPlayer[], selfId: string): void {
    const present = new Set<string>();
    for (const player of players) {
      if (!this.ownsPlayer(player)) continue;
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
      const rawX = clamp(player.x * this.worldWidth, 14, this.worldWidth - 14);
      const rawY = clamp(player.y * this.worldHeight, 14, this.worldHeight - 14);
      const { x, y } = this.navigation.closestPoint(rawX, rawY);
      if (player.id === selfId) {
        this.local.name.setText(player.name || 'You');
        if (!this.initializedSelf) {
          this.local.x = x;
          this.local.y = y;
          this.local.root.setPosition(x, y);
          this.initializedSelf = true;
          this.snapCamera();
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
        peer.root.setVisible(!this.terrainOnly);
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
  /** Each scene shows only the players standing in its own map and room. */
  protected abstract ownsPlayer(player: WorldPlayer): boolean;

  resetPlayerPosition(): void {
    this.initializedSelf = false;
    this.lastX = this.lastY = -1;
  }

  approachNpc(id: string): void {
    this.approachInteraction(this.characters.get(id)?.interactionId ?? id);
  }

  approachObject(id: string): void {
    this.approachInteraction(id.includes(':') ? id : `${this.objectPrefix}:${id}`);
  }

  protected interactionPosition(id: string): MapPoint | undefined {
    const portal = this.portals.get(id);
    if (portal) return portal;
    if (id.startsWith('object:')) return this.objects.get(id.slice(7));
    const character = this.characters.get(id);
    return character && this.characterRevealed(character) ? character : undefined;
  }

  protected triggerInteraction(id: string): void {
    this.cancelRoute();
    if (this.portals.has(id)) { this.usePortal(id); return; }
    if (id.startsWith('object:')) {
      const object = this.objects.get(id.slice(7));
      if (!object) return;
      object.activatedUntil = this.elapsed + 4;
      emitWorld(this.game, WorldEvents.Object, object.spec.id);
      return;
    }
    const npc = this.characters.get(id);
    if (!npc || !this.characterRevealed(npc)) return;
    this.faceCharacters(this.local, npc);
    emitWorld(this.game, WorldEvents.Npc, id);
  }

  protected approachInteraction(id: string): void {
    if (!this.controlsEnabled || this.watching) return;
    const target = this.interactionPosition(id);
    if (!target) return;
    if (Math.hypot(target.x - this.local.x, target.y - this.local.y) <= INTERACTION_DISTANCE) {
      this.triggerInteraction(id);
      return;
    }
    const angle = Math.atan2(this.local.y - target.y, this.local.x - target.x);
    // Prefer the offset on this side of the target, else any connected ground within speaking distance.
    let approach = this.navigation.closestPoint(target.x + Math.cos(angle) * 58, target.y + Math.sin(angle) * 58, this.local);
    if (Math.hypot(approach.x - target.x, approach.y - target.y) > INTERACTION_DISTANCE) approach = this.navigation.closestPoint(target.x, target.y, this.local);
    if (Math.hypot(approach.x - target.x, approach.y - target.y) > INTERACTION_DISTANCE) { this.cancelRoute(); return; }
    if (this.walkTo(approach.x, approach.y)) this.pendingInteraction = id;
  }

  protected walkTo(x: number, y: number): boolean {
    this.pendingInteraction = undefined;
    const requested = this.navigation.closestPoint(x, y, this.local);
    const path = this.navigation.findPath(this.local, requested);
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
    if (!this.ready || this.suspended) return;
    this.frames.add(delta);
    const seconds = Math.min(delta, 50) / 1000;
    this.elapsed += seconds;
    if (!this.reducedMotion) this.decorativeElapsed += seconds;
    const step = this.movePlayer(seconds);
    this.audio?.footsteps(Math.hypot(step.dx, step.dy), this.indoor);
    this.audio?.update(seconds);
    // The final walk frame must be painted before the conversation turns both
    // people toward each other; otherwise that step overwrites their facing.
    if (step.arrived) {
      const target = this.interactionPosition(step.arrived);
      if (target && Math.hypot(target.x - this.local.x, target.y - this.local.y) <= INTERACTION_DISTANCE) this.triggerInteraction(step.arrived);
    }
    // An interaction can hand the frame to another scene; this one stops for the rest of it.
    if (!this.ready || this.suspended) return;
    this.sendPosition();
    const labelScale = this.labelScale;
    this.local.name.setScale(labelScale).setVisible(this.controlsEnabled && !this.conversationTarget && !this.cinematicTarget);
    this.updateCharacters(seconds);
    this.updatePeers(seconds);
    this.tickClock(seconds);
    this.updateScene(seconds);
    this.updateObjects(this.elapsed);
    this.updatePortals(seconds);
    if (this.watching && !this.reducedMotion) this.tourTime += seconds;
    this.refreshNearby();
    const lead = 1 - Math.exp(-2.5 * seconds);
    this.cameraLead.x += ((step.moving ? step.vx * 80 : 0) - this.cameraLead.x) * lead;
    this.cameraLead.y += ((step.moving ? step.vy * 48 : 0) - this.cameraLead.y) * lead;
    this.frameCamera(seconds);
  }

  protected get labelScale(): number { return this.density / (this.cameras.main.zoom || 1); }

  /** Keyboard, pad, stick and click-to-walk resolve into one step against the navigation grid. */
  private movePlayer(seconds: number): { dx: number; dy: number; vx: number; vy: number; moving: boolean; arrived?: string } {
    let vx = 0, vy = 0, arrived: string | undefined;
    const speed = walkSpeedForHeight(this.indoor ? this.indoorCharacterHeight : MODULAR_ART.worldHeight);
    const previousX = this.local.x, previousY = this.local.y;
    const keys = this.keys;
    const pad1 = this.input.gamepad?.pad1;
    this.padList[0] = pad1 ? pad1.pad : null;
    gamepadInput(this.padList, this.padMove);
    const pressedInteract = this.queuedKeyboardInteraction;
    this.queuedKeyboardInteraction = false;
    const typing = isTyping();
    if (this.controlsEnabled && keys && !typing) {
      vx = Number(keys.right.isDown || keys.arrowRight.isDown) - Number(keys.left.isDown || keys.arrowLeft.isDown);
      vy = Number(keys.down.isDown || keys.arrowDown.isDown) - Number(keys.up.isDown || keys.arrowUp.isDown);
      if (vx || vy) {
        const length = Math.hypot(vx, vy);
        vx /= length; vy /= length;
        this.cancelRoute();
      }
    }
    if (this.controlsEnabled && !typing) {
      if (!vx && !vy && (this.padMove.x || this.padMove.y)) { vx = this.padMove.x; vy = this.padMove.y; this.cancelRoute(); }
      if (pressedInteract) this.interactNearest();
    }
    if (this.controlsEnabled && !vx && !vy && (this.joystick.x || this.joystick.y)) {
      const smooth = 1 - Math.exp(-18 * seconds);
      this.smoothJoystick.x += (this.joystick.x - this.smoothJoystick.x) * smooth;
      this.smoothJoystick.y += (this.joystick.y - this.smoothJoystick.y) * smooth;
      vx = this.smoothJoystick.x; vy = this.smoothJoystick.y;
      this.cancelRoute();
    }
    if (!this.controlsEnabled || this.watching) { vx = 0; vy = 0; }
    if (vx || vy) {
      const next = this.navigation.move(this.local, { x: vx * speed * seconds, y: vy * speed * seconds });
      this.local.x = next.x; this.local.y = next.y;
    } else if (this.controlsEnabled && !this.watching && this.target) {
      // Spend the same movement budget across waypoints, including the final
      // short step. Every route step uses the same swept body as held input.
      let remaining = speed * seconds;
      while (this.target && remaining > 0) {
        const dx = this.target.x - this.local.x, dy = this.target.y - this.local.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 1e-6) {
          const step = Math.min(distance, remaining);
          const expected = { x: this.local.x + dx / distance * step, y: this.local.y + dy / distance * step };
          const next = this.navigation.move(this.local, { x: expected.x - this.local.x, y: expected.y - this.local.y });
          this.local.x = next.x; this.local.y = next.y;
          remaining -= step;
          // A changed map can invalidate an active route. Clear its marker and
          // interaction instead of retrying a blocked waypoint forever.
          if (Math.hypot(next.x - expected.x, next.y - expected.y) > 0.1) { this.cancelRoute(); break; }
          if (Math.hypot(this.target.x - next.x, this.target.y - next.y) > 1e-6) break;
        }
        this.target = this.waypoints.shift();
        if (!this.target) {
          this.marker.setVisible(false);
          arrived = this.pendingInteraction;
          this.pendingInteraction = undefined;
        }
      }
    }
    const dx = this.local.x - previousX, dy = this.local.y - previousY;
    // Camera anticipation follows actual wall sliding rather than the part of
    // the input vector stopped by a wall.
    vx = seconds ? dx / (speed * seconds) : 0;
    vy = seconds ? dy / (speed * seconds) : 0;
    const moving = Math.hypot(dx, dy) > 0.05;
    this.animateCharacter(this.local, dx, dy, this.elapsed);
    return { dx, dy, vx, vy, moving, arrived };
  }

  private sendPosition(): void {
    if (this.elapsed < this.nextSendAt) return;
    const x = this.local.x / this.worldWidth, y = this.local.y / this.worldHeight;
    if (Math.hypot((x - this.lastX) * this.worldWidth, (y - this.lastY) * this.worldHeight) <= 0.4) return;
    this.nextSendAt = this.elapsed + 1 / 15;
    this.lastX = x; this.lastY = y;
    emitWorld(this.game, WorldEvents.Move, x, y);
  }

  /** Story characters; the outdoor map adds daily routines through this hook. */
  protected routineStep(_npc: Character, _seconds: number): MapPoint { return { x: 0, y: 0 }; }
  protected afterCharacter(_npc: Character): void {}

  private updateCharacters(seconds: number): void {
    const view = this.cameras.main.worldView, labelScale = this.labelScale;
    for (const npc of this.characters.values()) {
      const step = npc.id === this.conversationTarget ? { x: 0, y: 0 } : this.routineStep(npc, seconds);
      const visible = npc.x >= view.x - 100 && npc.x <= view.right + 100 && npc.y >= view.y - 110 && npc.y <= view.bottom + 100;
      const revealed = this.characterRevealed(npc);
      npc.root.setVisible(visible && revealed && !this.terrainOnly);
      if (!visible || !revealed) continue;
      this.animateCharacter(npc, step.x, step.y, this.elapsed + npc.phase);
      const near = this.controlsEnabled && Math.hypot(npc.x - this.local.x, npc.y - this.local.y) < INTERACTION_DISTANCE;
      const show = this.controlsEnabled && (near || !!npc.hovered);
      npc.halo?.setVisible(show).setAlpha(near ? 1 : .65);
      npc.name.setScale(labelScale).setVisible(show);
      npc.role?.setScale(labelScale).setVisible(show && !this.mobileCamera);
      npc.hint?.setScale(labelScale).setVisible(show);
      npc.marker?.setVisible(!this.watching && !this.indoor && this.objective === npc.id && !show);
      this.afterCharacter(npc);
    }
  }

  private updatePeers(seconds: number): void {
    const interpolation = 1 - Math.exp(-12 * seconds), labelScale = this.labelScale;
    for (const peer of this.peers.values()) {
      const dx = (peer.targetX - peer.x) * interpolation, dy = (peer.targetY - peer.y) * interpolation;
      peer.x += dx; peer.y += dy;
      this.animateCharacter(peer, dx, dy, this.elapsed + peer.phase);
      peer.name.setScale(labelScale).setVisible(this.controlsEnabled && (Math.hypot(peer.x - this.local.x, peer.y - this.local.y) < 180 || !!peer.hovered));
    }
  }

  /** This frame's clock state, so per-frame systems need not advance the clock again. */
  protected frameClock?: WorldTimeState;
  /** One shared clock; each label change is announced once for the HUD. */
  protected tickClock(seconds: number): WorldTimeState {
    const state = this.frameClock = this.clock.advance(seconds);
    this.audio?.setHour(state.hour);
    const label = state.label + state.period + state.mode;
    if (label !== this.lastClockLabel) {
      this.lastClockLabel = label;
      emitWorld(this.game, WorldEvents.Time, state);
    }
    return state;
  }

  private updatePortals(seconds: number): void {
    const view = this.cameras.main.worldView, scale = Math.min(2, this.density) / this.cameras.main.zoom;
    for (const portal of this.portals.values()) {
      const bounds = portal.door?.hit;
      const visible = bounds
        ? portal.x + bounds.x + bounds.width / 2 >= view.x && portal.x + bounds.x - bounds.width / 2 <= view.right
          && portal.y + bounds.y + bounds.height / 2 >= view.y && portal.y + bounds.y - bounds.height / 2 <= view.bottom
        : portal.x >= view.x - 100 && portal.x <= view.right + 100 && portal.y >= view.y - 100 && portal.y <= view.bottom + 100;
      portal.root.setVisible(visible && !this.terrainOnly);
      const near = Math.hypot(portal.x - this.local.x, portal.y - this.local.y) < INTERACTION_DISTANCE;
      const lit = this.controlsEnabled && !this.editing && (near || portal.hovered && this.input.isOver);
      portal.effect?.update(lit && visible && !this.terrainOnly, seconds, this.decorativeElapsed, this.reducedMotion);
      // Interior exits retain their existing marker; outdoor rooms light their painted door.
      if (portal.halo && portal.halo.getData('lit') !== lit) {
        portal.halo.setData('lit', lit);
        this.tweens.killTweensOf(portal.halo);
        portal.halo.setAlpha(lit ? .42 : .12);
        if (lit && !this.reducedMotion) this.tweens.add({ targets: portal.halo, alpha: .5, duration: 1050, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      portal.glyph?.setVisible(lit);
      portal.label.setVisible(lit && !this.conversationTarget);
      portal.label.setScale(scale);
    }
  }

  private updateObjects(time: number): void {
    const view = this.cameras.main.worldView, scale = Math.min(2, this.density) / this.cameras.main.zoom;
    const nearestId = this.indoor ? this.findNearestInteraction()?.id : undefined;
    for (const object of this.objects.values()) {
      const visible = object.x >= view.x - 100 && object.x <= view.right + 100 && object.y >= view.y - 100 && object.y <= view.bottom + 100;
      const available = this.objectAvailable(object);
      object.root.setVisible(visible && available && !this.terrainOnly && !this.watching);
      if (!visible || !available) continue;
      const near = this.controlsEnabled && Math.hypot(object.x - this.local.x, object.y - this.local.y) < INTERACTION_DISTANCE;
      const highlighted = this.controlsEnabled && (near || object.hovered);
      const objective = this.objective === object.spec.id || this.objective === `object:${object.spec.id}`;
      const active = Math.max(objective ? .6 : 0, Math.max(0, object.activatedUntil - time) / 4);
      object.label.setVisible(highlighted && (!this.indoor || object.hovered || nearestId === object.interactionId));
      object.label.setScale(scale);
      object.halo.setAlpha(highlighted ? .9 : .32 + active * .5).setScale(this.reducedMotion ? 1 : 1 + active * Math.sin(time * 8) * .15);
      // The idle bob and glow run as tweens on the marker's container; state adds emphasis.
      object.marker.setAlpha(highlighted ? .95 : .58 + active * .3);
      object.marker.setScale(.65 + active * .4);
    }
  }

  /** Idle ambient motion is tween-driven so it pauses with the scene and stops for reduced motion. */
  protected applyMarkerMotion(): void {
    for (const tween of this.markerTweens) tween.remove();
    this.markerTweens = [];
    if (!this.marker) return;
    this.marker.setScale(1);
    for (const object of this.objects.values()) object.marker.setY(-8);
    for (const npc of this.characters.values()) npc.marker?.setY(-96);
    if (this.reducedMotion) return;
    this.markerTweens.push(this.tweens.add({ targets: this.marker, scale: 1.04, duration: 785, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    for (const object of this.objects.values()) {
      this.markerTweens.push(this.tweens.add({ targets: object.marker, y: -6.5, duration: 1570, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (object.x / 170 % 3.14) * 500 }));
    }
    for (const npc of this.characters.values()) {
      if (npc.marker) this.markerTweens.push(this.tweens.add({ targets: npc.marker, y: -94.5, duration: 1570, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: npc.phase * 250 }));
    }
  }

  // Camera ------------------------------------------------------------------

  fitCamera(width: number, height: number, density = this.density, snap = true): void {
    this.density = density;
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.coverZoom = Math.max(width / this.worldWidth, height / this.worldHeight);
    this.fitZoom = explorationZoom(width, height, density, this.indoor, this.indoorCharacterHeight, { width: this.worldWidth, height: this.worldHeight }).zoom;
    const previousMobile = this.mobileCamera;
    this.mobileCamera = explorationZoom(width, height, density).mobile;
    if (previousMobile !== this.mobileCamera) {
      for (const npc of this.characters.values()) npc.hint?.setText(this.mobileCamera ? 'SPRECHEN' : 'SPRECHEN · E');
      this.mobileCameraChanged();
    }
    // Setting a text's resolution re-rasterises it, so only a real density change touches the labels.
    if (density !== this.labelDensity) {
      this.labelDensity = density;
      this.applyLabelDensity(density);
    }
    this.resizeHitTargets();
    // A scene that is not advancing cannot ease, so it takes its new framing at once.
    if (snap || !this.sys.isActive()) this.snapCamera();
  }
  protected applyLabelDensity(density: number): void {
    for (const actor of this.actors()) {
      actor?.name.setResolution(density); actor?.role?.setResolution(density); actor?.hint?.setResolution(density); actor?.marker?.setResolution(density);
    }
    for (const object of this.objects.values()) object.label.setResolution(density);
    for (const portal of this.portals.values()) { portal.label.setResolution(density); portal.glyph?.setResolution(density); }
  }
  protected mobileCameraChanged(): void {}
  protected actors(): Character[] { return [this.local, ...this.characters.values(), ...this.peers.values()]; }

  /** Zoom and focus for the current mode: cinematic beat, quiet tour, conversation or play. */
  protected cameraTarget(): { x: number; y: number; zoom: number; deadzone: boolean; ratio: number; settle: number } {
    if (this.cinematicTarget) {
      const beat = this.cinematicTarget;
      return { x: beat.x, y: beat.y, zoom: Math.max(this.coverZoom, beat.zoom * this.density), deadzone: false, ratio: .5, settle: .7 };
    }
    if (this.watching) {
      const width = this.worldWidth, height = this.worldHeight;
      return { x: width / 2 + Math.sin(this.tourTime * .036) * width * .286, y: height * .527 + Math.sin(this.tourTime * .027) * height * .151,
        zoom: this.coverZoom * (1.12 + Math.sin(this.tourTime * .045) * .04), deadzone: false, ratio: .5, settle: .3 };
    }
    const npc = this.conversationTarget ? this.characters.get(this.conversationTarget) : undefined;
    const observed = this.observedCharacter();
    const zoom = conversationZoom(this.fitZoom, !!npc);
    if (observed) return { x: observed.x, y: observed.y, zoom, deadzone: false, ratio: .54, settle: .6 };
    if (npc) return { x: (this.local.x + npc.x) / 2, y: (this.local.y + npc.y) / 2, zoom, deadzone: false, ratio: .38, settle: .6 };
    return { x: this.local.x + this.cameraLead.x, y: this.local.y + this.cameraLead.y, zoom, deadzone: true, ratio: this.mobileCamera ? .56 : .54, settle: .45 };
  }
  protected observedCharacter(): Character | undefined { return undefined; }

  /** The rig smooths centre and zoom; Phaser only receives the result, so no follow or dead-zone state fights it. */
  protected frameCamera(seconds: number, snap = false): void {
    const camera = this.cameras.main;
    const target = this.cameraTarget();
    const viewWidth = camera.width / target.zoom, viewHeight = camera.height / target.zoom;
    // The player sits slightly below centre so the path ahead stays in view.
    const goal = { x: target.x, y: target.y - viewHeight * (target.ratio - .5), zoom: target.zoom, settle: target.settle,
      deadzone: target.deadzone ? { width: viewWidth * .14, height: viewHeight * .11 } : undefined };
    const screen = { width: camera.width, height: camera.height }, world = { width: this.worldWidth, height: this.worldHeight };
    if (snap) this.cameraRig.snap(goal, screen, world);
    else this.cameraRig.step(goal, seconds, screen, world);
    camera.setZoom(this.cameraRig.zoom).centerOn(this.cameraRig.x, this.cameraRig.y);
  }

  snapCamera(): void {
    if (!this.local || !this.cameras?.main) return;
    this.frameCamera(0, true);
  }

  protected resizeHitTargets(): void {
    for (const npc of this.characters.values()) {
      const hit = npc.figure.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      const animation = npc.walkingAnimation ?? npc.idleAnimation;
      const art = npc.nativePixels ? NATIVE_MODULAR_ART : npc.componentCast ? CAST_ART : npc.modularNpc ? MODULAR_ART : NPC_ART;
      const frameWidth = animation?.width ?? art.width;
      const frameHeight = animation?.height ?? art.height;
      const footY = animation?.originY ?? art.footY;
      const width = Math.max(frameWidth + art.width / NPC_ART.width * 80, 44 / (npc.artScale * this.fitZoom));
      const top = art.width / NPC_ART.width * 12;
      hit?.setTo((frameWidth - width) / 2, top, width, frameHeight * footY - top);
    }
    for (const object of this.objects.values()) { const size = Math.max(52, 44 / this.fitZoom); object.hit.setSize(size, size, true); }
    for (const portal of this.portals.values()) {
      const size = Math.max(76, 44 / this.fitZoom);
      portal.hit.setSize(portal.door?.hit.width ?? size, portal.door?.hit.height ?? size, true);
    }
  }

  // Content -----------------------------------------------------------------

  protected createMapCharacters(map: Pick<WorldMapSpec, 'npcs'>, configure?: (character: Character) => void): void {
    for (const position of map.npcs) {
      if (!position) continue;
      const index = npcs.findIndex(npc => npc?.id === position.id);
      const localNpc = getExpeditionNpc(position.id);
      const npc = localNpc ?? npcs[index];
      if (!npc) continue;
      const { x, y } = this.navigation.closestPoint(position.x * this.worldWidth, position.y * this.worldHeight);
      const special = npc.id === 'inspector' || npc.id === 'elise';
      const avatar = npc.id === 'inspector' ? { hair: '#68656a', skin: '#d6a07d', outfit: '#80612e', hairstyle: 'bald', pants: '#383438' } : npc.id === 'elise' ? { hair: '#c8c5bf', skin: '#bb825a', outfit: '#596d86' } : DEFAULT_AVATAR;
      const character = this.createCharacter(npc.id, npc.name, x, y, localNpc?.avatar ?? avatar, npc.role.split('·')[0].trim(), special ? -1 : localNpc ? localNpc.artVariant : index, localNpc?.artVariant);
      configure?.(character);
      character.halo = this.add.ellipse(0, 2, 37, 17, 0xf5dda0, 0.08).setStrokeStyle(1, 0xf3d286, 0.6).setVisible(false);
      character.root.addAt(character.halo, 1);
      character.marker = this.add.text(0, -96, '✦', { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '17px', color: '#ffe3a3', stroke: '#68563c', strokeThickness: 2 }).setOrigin(.5).setVisible(false);
      character.hint = this.add.text(0, 30, this.mobileCamera ? 'SPRECHEN' : 'SPRECHEN · E', { resolution: this.density, fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#fff2cf', backgroundColor: '#263e36', padding: { x: 7, y: 4 } }).setOrigin(.5).setVisible(false);
      character.root.add([character.marker, character.hint]);
      const animation = character.walkingAnimation ?? character.idleAnimation;
      const hitArt = character.nativePixels ? NATIVE_MODULAR_ART : character.componentCast ? CAST_ART : character.modularNpc ? MODULAR_ART : NPC_ART;
      const hitPadding = hitArt.width / NPC_ART.width * 40, hitTop = hitArt.width / NPC_ART.width * 12;
      character.figure.setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(-hitPadding, hitTop, (animation?.width ?? hitArt.width) + hitPadding * 2, (animation?.height ?? hitArt.height) * (animation?.originY ?? hitArt.footY) - hitTop),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
      character.figure.on('pointerover', () => { character.hovered = true; });
      character.figure.on('pointerout', () => { character.hovered = false; });
      character.figure.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        if (this.editing) return;
        event.stopPropagation();
        this.approachInteraction(character.interactionId ?? npc.id);
      });
      this.characters.set(npc.id, character);
      character.root.setVisible(this.characterRevealed(character) && !this.terrainOnly);
    }
    this.resizeHitTargets();
  }

  protected createMapObjects(specs: readonly WorldObjectSpec[], prefix: 'object' | 'interior' = 'object'): void {
    for (const spec of specs) {
      const x = spec.x * this.worldWidth, y = spec.y * this.worldHeight;
      const halo = this.add.ellipse(0, 0, 36, 17, 0xeecf8a, .06).setStrokeStyle(1, 0xf5d896, .35);
      const marker = this.add.image(0, -8, 'discovery').setScale(.8).setAlpha(.7);
      const label = this.add.text(0, -35, spec.label, { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff0d0', stroke: '#283b36', strokeThickness: 4 }).setOrigin(.5).setVisible(false);
      const hit = this.add.zone(0, -7, Math.max(52, 44 / this.fitZoom), Math.max(52, 44 / this.fitZoom)).setInteractive({ useHandCursor: true });
      const root = this.add.container(x, y, [halo, marker, label, hit]).setDepth(worldDepth(y, 'shadow'));
      const object: WorldObject = { spec, x, y, root, halo, marker, label, hit, hovered: false, activatedUntil: 0,
        interactionId: spec.id.startsWith(`${prefix}:`) ? spec.id : `${prefix}:${spec.id}` };
      this.bindHover(hit, object, () => this.approachInteraction(object.interactionId));
      this.objects.set(spec.id, object);
      root.setVisible(!this.terrainOnly && this.objectAvailable(object));
    }
  }

  protected bindHover(hit: Phaser.GameObjects.Zone, target: { hovered: boolean }, activate: () => void): void {
    hit.on('pointerover', () => { target.hovered = true; });
    hit.on('pointerout', () => { target.hovered = false; });
    hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (this.editing) return;
      event.stopPropagation();
      activate();
    });
  }

  protected createPortal(id: string, x: number, y: number, label: string, door?: BuildingDoorGeometry, exit = false): void {
    const effect = door ? new BuildingDoorEffect(this, door) : undefined;
    const halo = exit ? this.add.ellipse(0, 6, 44, 16, 0xffd996, .24) : undefined;
    const mat = exit ? this.add.rectangle(0, 7, 38, 11, 0x685442, .8).setStrokeStyle(1, 0xe4c185, .5) : undefined;
    const glyph = exit ? this.add.text(0, -29, 'Exit', {
      resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '9px', color: '#fff1cd', backgroundColor: '#594a36', padding: { x: 5, y: 3 },
    }).setOrigin(.5).setVisible(false) : undefined;
    const name = this.add.text(0, exit ? 24 : -(door?.height ?? 34) - 16, label, {
      resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '14px', color: '#fff1cf', stroke: '#283c35', strokeThickness: 4,
    }).setOrigin(.5).setVisible(false);
    const hit = this.add.zone(door?.hit.x ?? 0, door?.hit.y ?? -14, door?.hit.width ?? 76, door?.hit.height ?? 76).setInteractive({ useHandCursor: true });
    const root = this.add.container(x, y, [...(mat && halo ? [mat, halo] : []), ...(effect ? [effect.root] : []), ...(glyph ? [glyph] : []), name, hit])
      .setDepth(worldDepth(door?.depth ?? y, 'label'));
    const portal: WorldPortal = { id, x, y, root, halo, label: name, glyph, hit, hovered: false, door, effect };
    this.bindHover(hit, portal, () => this.approachInteraction(id));
    this.portals.set(id, portal);
  }

  // Characters --------------------------------------------------------------

  protected animateCharacter(character: Character, dx: number, dy: number, time: number, residentGait?: ResidentGait): void {
    this.fitCharacterToRoom(character);
    character.root.setPosition(character.x, character.y);
    setDepthIfChanged(character.root, worldDepth(character.y, 'character'));
    if ((!character.npc || character.modularNpc) && !character.avatarPending && (!character.avatarLease || character.avatarRetryAt) && this.time.now >= (character.avatarRetryAt ?? 0)) this.tintCharacter(character);
    const distance = Math.hypot(dx, dy);
    if(character.componentCast || character.modularNpc){
      if(this.reducedMotion)return;
      // Slow NPC steps must not alternate with idle as frame duration varies.
      const moving=residentGait?.moving??distance>(character.npc?1e-6:.05);
      if(moving){
        const vx=residentGait?.velocityX??dx,vy=residentGait?.velocityY??dy;
        const horizontal=Math.abs(vx)>Math.abs(vy)*(character.facing%2?.88:1.12);
        character.facing=horizontal?(vx>=0?1:3):(vy>=0?0:2);
        character.walkDistance=residentGait?.distance??character.walkDistance+distance;
      }else if(this.characters.has(character.id)&&(this.conversationTarget===character.id||Math.hypot(character.x-this.local.x,character.y-this.local.y)<170)){
        const vx=this.local.x-character.x,vy=this.local.y-character.y;
        character.facing=Math.abs(vx)>Math.abs(vy)?(vx>0?1:3):(vy>0?0:2);
      }
      const art = character.nativePixels ? NATIVE_MODULAR_ART : character.modularNpc ? MODULAR_ART : CAST_ART;
      this.setCharacterFrame(character,characterFrame(character.facing,moving?character.walkDistance/(art.cycleDistance*character.artScale)*WALK_POSE_COLUMNS.length:undefined));
      return;
    }
    if (!character.npc && this.playerArtReady) {
      if (distance > 0.05) {
        // Keep the facing stable around diagonal direction boundaries.
        const horizontal = Math.abs(dx) > Math.abs(dy) * (character.facing % 2 ? 0.88 : 1.12);
        character.facing = horizontal ? (dx >= 0 ? 1 : 3) : (dy >= 0 ? 0 : 2);
        const cycleDistance = (character.nativePixels ? NATIVE_MODULAR_ART : MODULAR_ART).cycleDistance * character.artScale;
        character.walkDistance = advanceWalkDistance(character.walkDistance, distance, cycleDistance);
        character.lastWalkTime = time;
        this.setCharacterFrame(character, characterFrame(character.facing, character.walkDistance / cycleDistance * WALK_POSE_COLUMNS.length));
      } else if (!this.controlsEnabled || this.watching || time - (character.lastWalkTime ?? -Infinity) >= .1) {
        // A single-frame click still needs a visible step. Idle pauses retain
        // distance so repeated short clicks advance through the painted gait.
        this.setCharacterFrame(character, characterFrame(character.facing));
      }
    }
    if (character.castRow !== undefined) {
      if (residentGait?.moving ?? distance > 1e-6) {
        const vx = residentGait?.velocityX ?? dx, vy = residentGait?.velocityY ?? dy;
        const horizontal = Math.abs(vx) > Math.abs(vy) * (character.facing % 2 ? .88 : 1.12);
        character.facing = horizontal ? (vx >= 0 ? 1 : 3) : (vy >= 0 ? 0 : 2);
      } else if (Math.hypot(character.x - this.local.x, character.y - this.local.y) < 170 || this.conversationTarget === character.id) {
        // Passers-by can draw a glance without changing the player's gait.
        const lookX = this.local.x - character.x, lookY = this.local.y - character.y;
        character.facing = Math.abs(lookX) > Math.abs(lookY) ? lookX > 0 ? 1 : 3 : lookY > 0 ? 0 : 2;
      }
      character.figure.setFrame(character.castRow * 4 + character.facing);
      character.figure.setScale(character.artScale, character.artScale * (this.reducedMotion ? 1 : 1 + Math.sin(time * 1.7 + character.phase) * .0015));
      return;
    }
    if (character.walkingAnimation) {
      // Still-world mode holds the currently planted pose and facing. Regional
      // paintings are walking poses; stationary neighbors keep one painting.
      if (this.reducedMotion) return;
      const moving = residentGait?.moving ?? distance > 1e-6;
      if (residentGait?.facingLeft !== undefined) character.figure.setFlipX(residentGait.facingLeft);
      if (moving) {
        character.walkDistance = residentGait?.distance ?? character.walkDistance + distance;
        const velocityX = residentGait?.velocityX ?? dx;
        const velocityY = residentGait?.velocityY ?? dy;
        // Near-vertical travel has no authored direction; retain the last
        // horizontal facing instead of flipping for small lateral drift.
        if (residentGait?.facingLeft === undefined && Math.abs(velocityX) > Math.abs(velocityY) * .25 && Math.abs(velocityX) > .05) character.figure.setFlipX(velocityX < 0);
      } else character.walkDistance = 0;
      const frame = residentWalkFrame(character.walkingAnimation.frames, character.walkDistance, moving);
      if (frame !== character.idleFrame) { character.figure.setFrame(frame); character.idleFrame = frame; }
      return;
    }
    if (character.idleAnimation) {
      const frame = this.indoor ? character.idleAnimation.frames[0] : sampleSceneryFrame(character.idleAnimation, character.id, this.decorativeElapsed);
      if (frame !== character.idleFrame) { character.figure.setFrame(frame); character.idleFrame = frame; }
      return;
    }
    // The ground pivot never moves. Breathing is deliberately smaller than a
    // pixel, with no spinning, bobbing, detached feet or stretched strides.
    const breathe = distance > 0.05 || this.reducedMotion ? 1 : 1 + Math.sin(time * 1.7 + character.phase) * 0.002;
    if (Math.abs(breathe - character.breathe) < .0002) return;
    character.breathe = breathe;
    character.layers.forEach(layer => layer.setScale(character.artScale, character.artScale * breathe));
  }

  protected setCharacterFrame(character: Character, frame: number): void {
    if (character.frame === frame) return;
    character.frame = frame;
    if ((!character.npc || character.modularNpc) && !character.avatarLease) return;
    for (const layer of character.layers) layer.setFrame(frame);
  }

  protected fitCharacterToRoom(character: Character): void {
    const art = character.nativePixels ? NATIVE_MODULAR_ART : character.componentCast ? CAST_ART : character.modularNpc || !character.npc && this.playerArtReady ? MODULAR_ART : NPC_ART;
    const animation = character.walkingAnimation ?? character.idleAnimation;
    const canvasHeight = animation?.height ?? art.height;
    const bodyHeight = animation ? canvasHeight - 6 : art.bodyHeight;
    const indoors = this.indoor;
    const indoorHeight = this.indoorCharacterHeight;
    const scale = ((character.componentCast || character.modularNpc || !character.npc && this.playerArtReady) && !indoors ? MODULAR_ART.worldHeight / bodyHeight : characterArtScale(bodyHeight, canvasHeight, indoors, indoorHeight)) * childScale(character.id);
    if (character.artScale === scale) return;
    character.artScale = scale;
    character.breathe = 1;
    character.layers.forEach(layer => layer.setScale(scale, scale));
    const groundScale = indoorHeight / INTERIOR_CHARACTER_HEIGHT;
    character.shadow.setDisplaySize(indoors ? 43 * groundScale : 31, indoors ? 17 * groundScale : 12);
    character.name.setY(indoors ? -indoorHeight - 12 : -79);
  }

  protected tintCharacter(character: Character): void {
    if (character.npc && !character.modularNpc || character.avatarDisposed) return;
    const revision = (character.avatarRevision ?? 0) + 1;
    character.avatarRevision = revision; character.avatarPending = true;
    const recipe = normalizeAvatar(character.avatar), nativePixels = this.indoor;
    const options = { resolution: nativePixels ? 'editor' as const : 'runtime' as const };
    const cached = acquireAvatarTexture(this, recipe, options);
    if (cached) {
      this.applyAvatarTexture(character, cached, nativePixels);
      character.avatarPending = false; character.avatarRetryAt = 0;
      return;
    }
    // A first indoor visit can show the town's existing avatar while its native
    // frames bake. Later visits use the native texture immediately.
    if (!character.avatarLease && nativePixels) {
      const fallback = acquireAvatarTexture(this, recipe);
      if (fallback) this.applyAvatarTexture(character, fallback, false);
    }
    void bakeAvatarTexture(this, recipe, options).then(lease => {
      if (character.avatarDisposed || character.avatarRevision !== revision) { lease.release(character.id !== 'self'); return; }
      this.applyAvatarTexture(character, lease, nativePixels);
      character.avatarRetryAt = 0;
    }).catch(() => {
      if (!character.avatarDisposed && character.avatarRevision === revision) character.avatarRetryAt = this.time.now + 1000;
    }).finally(() => { if (character.avatarRevision === revision) character.avatarPending = false; });
  }

  private applyAvatarTexture(character: Character, lease: TextureLease<string>, nativePixels: boolean): void {
    const previous = character.avatarLease, resized = character.nativePixels !== nativePixels;
    character.avatarLease = lease; character.nativePixels = nativePixels;
    character.figure.setTexture(lease.value, character.frame).setOrigin(.5, MODULAR_ART.footY).setVisible(true);
    this.fitCharacterToRoom(character);
    character.figure.setScale(character.artScale);
    if (resized && character.figure.input) this.resizeHitTargets();
    previous?.release();
    this.setCharacterAmbient(character, character.ambientTint ?? 0xffffff);
  }

  /** Regional paintings take the period's people tint; layered avatars keep their own colours. */
  protected setCharacterAmbient(character: Character, tint: number): void {
    character.ambientTint = tint;
    if (character.componentCast || character.modularNpc || !character.npc || character.localArtVariant !== undefined) character.figure.setTint(this.indoor ? 0xffffff : tint);
  }

  protected createCharacter(id: string, name: string, x: number, y: number, avatar: Avatar, role?: string, npcFrame = -1, localArtVariant?: number): Character {
    const candidate=castActor(id);
    const castAsset=this.indoor?candidate?.native:candidate;
    const baked=castAsset&&this.textures.exists(castAsset.key)?castAsset:undefined;
    const npc = !!candidate || npcFrame >= 0 || localArtVariant !== undefined;
    const modularNpc = npc && !baked;
    const shadow = this.add.image(0, 2, 'character-shadow').setDisplaySize(31, 12);
    const frame = 0;
    const nativePixels=this.indoor;
    const art = nativePixels ? NATIVE_MODULAR_ART : baked ? CAST_ART : MODULAR_ART;
    const artScale = art.worldHeight / art.bodyHeight * childScale(id);
    // Reserve the interaction target until a cached or newly baked texture is
    // available; indoor entry can reuse the town's frames immediately.
    const layers = [this.add.sprite(0, 0, baked?.key ?? '__WHITE', baked ? frame : undefined).setOrigin(.5, art.footY).setScale(artScale)];
    const figure = layers[0];
    const nameText = this.add.text(0, -79, name, { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff6e2', stroke: '#25362d', strokeThickness: 3 }).setOrigin(0.5).setVisible(!npc);
    const root = this.add.container(x, y, [shadow, ...layers, nameText]).setDepth(worldDepth(y, 'character'));
    let roleText: Phaser.GameObjects.Text | undefined;
    if (role) {
      roleText = this.add.text(0, 13, role, { resolution: this.density, fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#f4e6c2', stroke: '#263a31', strokeThickness: 2 }).setOrigin(0.5).setVisible(false);
      root.add(roleText);
    }
    const character: Character = { id, root, figure, layers, shadow, name: nameText, role: roleText, x, y, targetX: x, targetY: y, phase: Math.random() * 6.28, facing: 0, walkDistance: 0, frame, npc, artScale, breathe: 1, avatar: candidate?.recipe ?? avatar, localArtVariant, componentCast:!!baked, modularNpc, nativePixels };
    if (!baked) {
      figure.setVisible(false);
      root.once('destroy', () => {
        character.avatarDisposed = true;
        // Keep our own appearance in the bounded cache for the next scene.
        character.avatarLease?.release(character.id !== 'self'); character.avatarLease = undefined;
      });
    }
    this.fitCharacterToRoom(character);
    this.tintCharacter(character);
    this.setCharacterAmbient(character, 0xffffff);
    return character;
  }
}

/** The discovery star is drawn once into a canvas texture shared by every scene. */
export function createDiscoveryTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('discovery')) return;
  const texture = scene.textures.createCanvas('discovery', 32, 32);
  if (!texture) return;
  const context = texture.context;
  context.fillStyle = 'rgba(255,229,171,.8)';
  context.beginPath();
  for (const [x, y] of [[16, 2], [20, 12], [30, 16], [20, 20], [16, 30], [12, 20], [2, 16], [12, 12]]) context.lineTo(x, y);
  context.closePath();
  context.fill();
  context.fillStyle = 'rgb(255,246,217)';
  context.beginPath();
  context.arc(16, 16, 2, 0, Math.PI * 2);
  context.fill();
  texture.refresh();
}
