import * as Phaser from 'phaser';
import { npcs } from './content';
import { createFallbackNavigation, createMapNavigation, NavigationGrid } from './navigation';
import type { MapPoint } from './navigation';
import { getMap, maps, type MapId, type WorldObjectSpec, type WorldMapSpec } from './maps';
import { NPC_ART, PLAYER_ART, PLAYER_LAYERS, paintAvatarPreview, playerMaterialShadows, prepareCharacterArt } from './character-art';
import { createWorldResidents, sampleResidentMotion } from './world-life';
import { WorldEnvironment } from './world-environment';
import { WorldScenery } from './world-scenery';

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
  onNpc: (id: string) => void;
  onMove: (x: number, y: number) => void;
  onReady?: () => void;
  onNearby?: (id: string | undefined) => void;
  onObject?: (id: string) => void;
  onMapReady?: (id: MapId) => void;
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
}

interface Ambient {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  phase: number;
  speed: number;
  kind: 'mote' | 'butterfly' | 'leaf' | 'bird' | 'lantern';
  amplitude?: number;
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
    this.scene = new HarborScene(this);
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
    // The acknowledgement is followed by a fresh player snapshot. Replaying an
    // old same-map snapshot here would consume its authoritative first snap.
    this.pendingPlayers = [];
    this.clearHeldInput();
    if (this.scene.ready) this.scene.switchMap(this.mapId);
  }

  focusObject(id: string): void {
    if (this.scene.ready) this.scene.approachObject(id);
  }

  /** Only the active story character keeps a distant navigation star. */
  setObjective(npcId: string | undefined): void {
    this.objective = npcId;
    if (this.scene.ready) this.scene.setObjective(npcId);
  }

  zoom(delta: number): void {
    if (this.scene.ready) this.scene.adjustZoom(delta);
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
    this.scene.switchMap(this.mapId);
    this.scene.setObjective(this.objective);
    this.scene.changeAvatar(this.avatar);
    this.scene.syncPlayers(this.pendingPlayers, this.selfId);
    this.scene.setWindowFocused(this.windowFocused);
    this.scene.setInputEnabled(this.inputEnabled && this.visible && !document.hidden);
    this.scene.setJoystick(this.joystick.x, this.joystick.y);
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
  private ambient: Ambient[] = [];
  private environment?: WorldEnvironment;
  private scenery?: WorldScenery;
  private residents: { character: Character; motion: ReturnType<typeof createWorldResidents>[number]; sample: ReturnType<typeof sampleResidentMotion> }[] = [];
  private reducedMotion = false;
  private navigation!: NavigationGrid;
  private mapSpec = getMap('lindenhafen');
  private background?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private objective?: string;
  private mapRevision = 0;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private target?: { x: number; y: number };
  private waypoints: MapPoint[] = [];
  private pendingInteraction?: string;
  private marker!: Phaser.GameObjects.Container;
  private lastSent = 0;
  private lastX = -1;
  private lastY = -1;
  private initializedSelf = false;
  private zoomFactor = 1;
  private targetZoomFactor = 1;
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

  constructor(private owner: World) { super({ key: 'lindenhafen' }); }

  preload(): void {
    for (const map of maps) this.load.image(map.id, map.asset);
    this.load.spritesheet(NPC_ART.key, '/assets/characters.webp', { frameWidth: NPC_ART.width, frameHeight: NPC_ART.height });
    this.load.image(PLAYER_ART.source, '/assets/player-walk.webp');
  }

  create(): void {
    this.navigation = createMapNavigation('lindenhafen');
    this.playerArtReady = prepareCharacterArt(this);
    this.createAmbientTextures();
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
      if (!this.controlsEnabled || !this.windowFocused || objects.length || pointer.rightButtonDown()) return;
      const destination = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.walkTo(destination.x, destination.y);
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (this.controlsEnabled && this.windowFocused) this.adjustZoom(dy > 0 ? -0.08 : 0.08);
    });
    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.ready = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.environment?.destroy();
      this.environment = undefined;
      this.scenery?.destroy();
      this.scenery = undefined;
      this.residents = [];
    });
    this.owner.boot();
  }

  switchMap(id: MapId): void {
    const map = getMap(id);
    this.clearControls();
    this.initializedSelf = false;
    this.lastX = -1;
    this.lastY = -1;
    this.cameraLead = { x: 0, y: 0 };
    if (this.mapSpec.id !== map.id || !this.background) {
      this.background?.destroy();
      this.scenery?.destroy();
      this.scenery = undefined;
      for (const npc of this.characters.values()) npc.root.destroy();
      for (const object of this.objects.values()) object.root.destroy();
      for (const peer of this.peers.values()) peer.root.destroy();
      for (const item of this.ambient) item.sprite.destroy();
      for (const resident of this.residents) resident.character.root.destroy();
      this.environment?.destroy();
      this.characters.clear();
      this.objects.clear();
      this.peers.clear();
      this.ambient = [];
      this.residents = [];
      this.mapSpec = map;
      this.navigation = createMapNavigation(map.id);
      if (this.textures.exists(map.id)) {
        this.background = this.add.image(0, 0, map.id).setOrigin(0).setDisplaySize(WIDTH, HEIGHT).setDepth(-1000);
        this.scenery = new WorldScenery(this, map.id);
      } else if (map.id === 'lindenhafen') {
        this.background = this.drawFallbackTown();
        this.navigation = createFallbackNavigation();
      } else {
        // Asset failures have a plain neutral ground, never a recolored town.
        this.background = this.add.graphics().fillStyle(0x263b3c).fillRect(0, 0, WIDTH, HEIGHT).setDepth(-1000);
      }
      this.createMapCharacters(map);
      this.createMapObjects(map);
      this.createAmbient();
      this.createResidents();
      this.createEnvironment();
    }
    const spawn = this.navigation.closestPoint(map.spawn.x * WIDTH, map.spawn.y * HEIGHT);
    this.local.x = this.local.targetX = spawn.x;
    this.local.y = this.local.targetY = spawn.y;
    this.local.facing = 0;
    this.local.walkDistance = 0;
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.frameCamera(1);
    // Network acknowledgements synchronously deliver onPlayers after onMap.
    // Defer UI waypoints until that first snapshot restores saved coordinates.
    const revision = ++this.mapRevision;
    queueMicrotask(() => { if (this.ready && revision === this.mapRevision) this.owner.mapReady(map.id); });
  }

  setObjective(id: string | undefined): void { this.objective = id; }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.environment?.setReducedMotion(reduced);
  }

  private createEnvironment(): void {
    this.environment?.destroy();
    this.environment = new WorldEnvironment(this, this.mapSpec.id, {
      mobile: this.mobileCamera,
      reducedMotion: this.reducedMotion,
    });
  }

  private createResidents(): void {
    if (!this.playerArtReady) return;
    for (const motion of createWorldResidents(this.mapSpec.id, this.navigation)) {
      const position = sampleResidentMotion(motion, this.decorativeElapsed);
      const character = this.createCharacter(motion.id, motion.name, position.x, position.y, motion.avatar);
      character.name.setColor('#ddd6b5').setVisible(false);
      this.residents.push({ character, motion, sample: position });
    }
  }

  private createMapCharacters(map: WorldMapSpec): void {
    for (const position of map.npcs) {
      const index = npcs.findIndex(npc => npc.id === position.id);
      const npc = npcs[index];
      if (!npc) continue;
      const { x, y } = this.navigation.closestPoint(position.x * WIDTH, position.y * HEIGHT);
      const character = this.createCharacter(npc.id, npc.name, x, y, DEFAULT_AVATAR, npc.role.split('·')[0].trim(), index);
      character.halo = this.add.ellipse(0, 2, 37, 17, 0xf5dda0, 0.08).setStrokeStyle(1, 0xf3d286, 0.6).setVisible(false);
      character.root.addAt(character.halo, 1);
      character.marker = this.add.text(0, -96, '✦', { fontFamily: 'Georgia, serif', fontSize: '17px', color: '#ffe3a3', stroke: '#68563c', strokeThickness: 2 }).setOrigin(.5).setVisible(false);
      character.hint = this.add.text(0, 30, this.mobileCamera ? 'TAP TO TALK' : 'TALK · E', { fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#fff2cf', backgroundColor: '#263e36', padding: { x: 7, y: 4 } }).setOrigin(.5).setVisible(false);
      character.root.add([character.marker, character.hint]);
      character.figure.setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(-40, 12, NPC_ART.width + 80, NPC_ART.height * NPC_ART.footY - 12),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
      character.figure.on('pointerover', () => { character.hovered = true; });
      character.figure.on('pointerout', () => { character.hovered = false; });
      character.figure.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.approachNpc(npc.id);
      });
      this.characters.set(npc.id, character);
    }
    this.resizeHitTargets();
  }

  private createMapObjects(map: WorldMapSpec): void {
    for (const spec of map.objects) {
      const x = spec.x * WIDTH, y = spec.y * HEIGHT;
      const halo = this.add.ellipse(0, 0, 36, 17, 0xeecf8a, .06).setStrokeStyle(1, 0xf5d896, .35);
      const marker = this.add.image(0, -8, 'discovery').setScale(.8).setAlpha(.7);
      const label = this.add.text(0, -35, spec.label, { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff0d0', stroke: '#283b36', strokeThickness: 4 }).setOrigin(.5).setVisible(false);
      const hit = this.add.zone(0, -7, Math.max(52, 44 / this.fitZoom), Math.max(52, 44 / this.fitZoom)).setInteractive({ useHandCursor: true });
      const root = this.add.container(x, y, [halo, marker, label, hit]).setDepth(y + 8);
      const object: WorldObject = { spec, x, y, root, halo, marker, label, hovered: false, activatedUntil: 0 };
      hit.on('pointerover', () => { object.hovered = true; });
      hit.on('pointerout', () => { object.hovered = false; });
      hit.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.approachObject(spec.id);
      });
      this.objects.set(spec.id, object);
    }
  }

  private resizeHitTargets(): void {
    for (const npc of this.characters.values()) {
      const hit = npc.figure.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      const width = Math.max(NPC_ART.width + 80, 44 / (npc.artScale * this.fitZoom));
      hit?.setTo((NPC_ART.width - width) / 2, 12, width, NPC_ART.height * NPC_ART.footY - 12);
    }
    for (const object of this.objects.values()) {
      const hit = object.root.list.at(-1) as Phaser.GameObjects.Zone;
      const size = Math.max(52, 44 / this.fitZoom);
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
      if (this.environment) this.createEnvironment();
    }
    this.cameras.main.setZoom(this.fitZoom * this.zoomFactor);
    this.resizeHitTargets();
    this.frameCamera(1);
  }

  adjustZoom(delta: number): void {
    this.targetZoomFactor = clamp(this.targetZoomFactor + delta, 1, 1.8);
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
    if (!this.controlsEnabled || !this.windowFocused || document.hidden) return false;
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
      if (separation < distance) { distance = separation; nearest = npc; }
    }
    for (const object of this.objects.values()) {
      const separation = Math.hypot(object.x - this.local.x, object.y - this.local.y);
      if (separation < distance) { distance = separation; nearest = { id: `object:${object.spec.id}`, x: object.x, y: object.y }; }
    }
    return nearest;
  }

  private setNearby(id: string | undefined): void {
    if (id === this.nearbyInteraction) return;
    this.nearbyInteraction = id;
    this.owner.nearby(id);
  }

  private refreshNearby(): void {
    this.setNearby(this.controlsEnabled && this.windowFocused && !document.hidden ? this.findNearestInteraction()?.id : undefined);
  }

  changeAvatar(avatar: Avatar): void {
    if (!this.local || avatarKey(this.local.avatar) === avatarKey(avatar)) return;
    this.local.avatar = avatar;
    this.tintCharacter(this.local);
  }

  renderAvatarPreview(canvas: HTMLCanvasElement, avatar: Avatar): boolean {
    return paintAvatarPreview(this, canvas, this.avatarPalette(avatar));
  }

  syncPlayers(players: WorldPlayer[], selfId: string): void {
    const present = new Set<string>();
    for (const player of players) {
      if ((player.mapId ?? 'lindenhafen') !== this.mapSpec.id) continue;
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
      const rawX = clamp(player.x, 0.04, 0.96) * WIDTH;
      const rawY = clamp(player.y, 0.08, 0.95) * HEIGHT;
      const { x, y } = this.navigation.closestPoint(rawX, rawY);
      if (player.id === selfId) {
        this.local.name.setText(player.name || 'You');
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
    this.approachInteraction(id);
  }

  approachObject(id: string): void {
    this.approachInteraction(id.startsWith('object:') ? id : `object:${id}`);
  }

  private interactionPosition(id: string): { x: number; y: number } | undefined {
    return id.startsWith('object:') ? this.objects.get(id.slice(7)) : this.characters.get(id);
  }

  private triggerInteraction(id: string): void {
    this.cancelRoute();
    if (id.startsWith('object:')) {
      const object = this.objects.get(id.slice(7));
      if (!object) return;
      object.activatedUntil = this.elapsed + 4;
      this.environment?.react(object.spec.kind, this.decorativeElapsed);
      this.owner.investigate(object.spec.id);
    } else this.owner.interact(id);
  }

  private approachInteraction(id: string): void {
    if (!this.controlsEnabled || !this.windowFocused || document.hidden) return;
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
    if (this.controlsEnabled && this.windowFocused && !vx && !vy && (this.joystick.x || this.joystick.y)) {
      const smooth = 1 - Math.exp(-18 * seconds);
      this.smoothJoystick.x += (this.joystick.x - this.smoothJoystick.x) * smooth;
      this.smoothJoystick.y += (this.joystick.y - this.smoothJoystick.y) * smooth;
      vx = this.smoothJoystick.x;
      vy = this.smoothJoystick.y;
      this.cancelRoute();
    }
    if (!this.controlsEnabled || !this.windowFocused) { vx = 0; vy = 0; }
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

    if (this.elapsed - this.lastSent > 1 / 15) {
      const x = this.local.x / WIDTH;
      const y = this.local.y / HEIGHT;
      if (Math.abs(x - this.lastX) + Math.abs(y - this.lastY) > 0.0003) {
        this.lastSent = this.elapsed;
        this.lastX = x;
        this.lastY = y;
        this.owner.move(x, y);
      }
    }
    for (const npc of this.characters.values()) {
      this.animateCharacter(npc, 0, 0, this.elapsed + npc.phase);
      const near = this.controlsEnabled && this.windowFocused && Math.hypot(npc.x - this.local.x, npc.y - this.local.y) < INTERACTION_DISTANCE;
      const show = this.controlsEnabled && this.windowFocused && (near || !!npc.hovered);
      npc.halo?.setVisible(show).setAlpha(near ? 1 : .65);
      npc.name.setVisible(show);
      npc.role?.setVisible(show && !this.mobileCamera);
      npc.hint?.setVisible(show);
      if (npc.marker) {
        npc.marker.setVisible(this.objective === npc.id && !show);
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
    this.updateResidents();
    this.updateObjects(this.elapsed);
    this.updateAmbient(this.decorativeElapsed);
    this.environment?.update(this.decorativeElapsed, this.cameras.main.worldView);
    this.scenery?.update(this.cameras.main.worldView);
    this.refreshNearby();
    if (this.marker.visible) this.marker.setScale(this.reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 4) * 0.04);
    if (Math.abs(this.zoomFactor - this.targetZoomFactor) > 0.0001) {
      this.zoomFactor += (this.targetZoomFactor - this.zoomFactor) * (1 - Math.exp(-10 * seconds));
      this.cameras.main.setZoom(this.fitZoom * this.zoomFactor);
    }
    const lead = 1 - Math.exp(-5 * seconds);
    this.cameraLead.x += ((moving ? vx * (this.mobileCamera ? 55 : 24) : 0) - this.cameraLead.x) * lead;
    this.cameraLead.y += ((moving ? vy * (this.mobileCamera ? 36 : 18) : 0) - this.cameraLead.y) * lead;
    this.frameCamera(1 - Math.exp(-5 * seconds));
  }

  private frameCamera(follow: number): void {
    const camera = this.cameras.main;
    const viewWidth = camera.width / camera.zoom;
    const viewHeight = camera.height / camera.zoom;
    const targetScrollX = clamp(this.local.x + this.cameraLead.x - viewWidth / 2, 0, Math.max(0, WIDTH - viewWidth));
    const targetScrollY = clamp(this.local.y + this.cameraLead.y - viewHeight * (this.mobileCamera ? 0.56 : 0.54), 0, Math.max(0, HEIGHT - viewHeight));
    camera.scrollX += (targetScrollX - camera.scrollX) * follow;
    camera.scrollY += (targetScrollY - camera.scrollY) * follow;
  }

  private animateCharacter(character: Character, dx: number, dy: number, time: number): void {
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
      character.root.setVisible(visible);
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

  private createCharacter(id: string, name: string, x: number, y: number, avatar: Avatar, role?: string, npcFrame = -1): Character {
    const npc = npcFrame >= 0;
    const shadow = this.add.image(0, 2, 'character-shadow').setDisplaySize(31, 12);
    const frame = npc ? npcFrame : PLAYER_ART.idle;
    const art = npc || !this.playerArtReady ? NPC_ART : PLAYER_ART;
    const keys = !npc && this.playerArtReady ? PLAYER_LAYERS : [NPC_ART.key];
    const artScale = 82 / art.height;
    const layers = keys.map(key => this.add.image(0, 0, key, npc ? frame : this.playerArtReady ? frame : 7).setOrigin(0.5, art.footY).setScale(artScale));
    const figure = layers[0];
    const nameText = this.add.text(0, -79, name, { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff6e2', stroke: '#25362d', strokeThickness: 3 }).setOrigin(0.5).setVisible(!npc);
    const root = this.add.container(x, y, [shadow, ...layers, nameText]).setDepth(y + 10);
    let roleText: Phaser.GameObjects.Text | undefined;
    if (role) {
      roleText = this.add.text(0, 13, role, { fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#f4e6c2', stroke: '#263a31', strokeThickness: 2 }).setOrigin(0.5).setVisible(false);
      root.add(roleText);
    }
    const character: Character = { id, root, figure, layers, shadow, name: nameText, role: roleText, x, y, targetX: x, targetY: y, phase: Math.random() * 6.28, facing: 0, walkDistance: 0, frame, npc, artScale, avatar };
    this.tintCharacter(character);
    return character;
  }

  private updateObjects(time: number): void {
    const view = this.cameras.main.worldView;
    for (const object of this.objects.values()) {
      const visible = object.x >= view.x - 100 && object.x <= view.right + 100 && object.y >= view.y - 100 && object.y <= view.bottom + 100;
      object.root.setVisible(visible);
      if (!visible) continue;
      const near = this.controlsEnabled && this.windowFocused && Math.hypot(object.x - this.local.x, object.y - this.local.y) < INTERACTION_DISTANCE;
      const highlighted = this.controlsEnabled && this.windowFocused && (near || object.hovered);
      const active = Math.max(0, object.activatedUntil - time) / 4;
      const phase = (this.reducedMotion ? 0 : time * 2) + object.x / 170;
      object.label.setVisible(highlighted);
      object.halo.setAlpha(highlighted ? .9 : .32 + active * .5).setScale(this.reducedMotion ? 1 : 1 + active * Math.sin(time * 8) * .15);
      // The clue flares on discovery; fountains/lanterns also animate in place.
      object.marker.setAlpha(highlighted ? .95 : .5 + Math.sin(phase) * .12 + active * .3);
      object.marker.setScale(.65 + active * .4 + Math.sin(phase) * .055);
      object.marker.y = -8 + (this.reducedMotion ? 0 : Math.sin(phase) * 1.5);
    }
  }

  private createAmbientTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffedbd, 0.5).fillCircle(8, 8, 7);
    graphics.fillStyle(0xfff3cf, 0.9).fillCircle(8, 8, 2.2);
    graphics.generateTexture('mote', 16, 16);
    graphics.clear();
    graphics.fillStyle(0xf6dab7, 1).fillEllipse(9, 11, 14, 10).fillEllipse(23, 11, 14, 10);
    graphics.fillStyle(0xd19d64, 1).fillEllipse(16, 13, 3, 11);
    graphics.generateTexture('butterfly', 32, 26);
    graphics.clear();
    graphics.fillStyle(0xdaa65e, 0.8).fillEllipse(8, 8, 12, 6);
    graphics.generateTexture('leaf', 16, 16);
    graphics.clear();
    graphics.lineStyle(2, 0xe5e0cd, .75).lineBetween(1, 9, 9, 4).lineBetween(9, 4, 17, 9).lineBetween(17, 9, 25, 4).lineBetween(25, 4, 33, 9);
    graphics.generateTexture('bird', 34, 14);
    graphics.clear();
    graphics.fillStyle(0xffe5ab, .8).fillPoints([new Phaser.Math.Vector2(16, 2), new Phaser.Math.Vector2(20, 12), new Phaser.Math.Vector2(30, 16), new Phaser.Math.Vector2(20, 20), new Phaser.Math.Vector2(16, 30), new Phaser.Math.Vector2(12, 20), new Phaser.Math.Vector2(2, 16), new Phaser.Math.Vector2(12, 12)], true);
    graphics.fillStyle(0xfff6d9, 1).fillCircle(16, 16, 2);
    graphics.generateTexture('discovery', 32, 32);
    graphics.destroy();
    for (const [key, rgba] of [['lantern', '255,201,113']] as const) {
      const texture = this.textures.createCanvas(key, 64, 64);
      if (!texture) continue;
      const ctx = texture.context;
      const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      gradient.addColorStop(0, `rgba(${rgba},.48)`);
      gradient.addColorStop(.5, `rgba(${rgba},.16)`);
      gradient.addColorStop(1, `rgba(${rgba},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      texture.refresh();
    }
  }

  private createAmbient(): void {
    const layouts: Record<MapId, { lamps: number[][]; foliage: number[][] }> = {
      lindenhafen: {
        lamps: [[577,548],[879,251],[1259,491],[1218,539],[1413,852]],
        foliage: [[469,588],[663,838],[843,292],[337,498],[973,682]],
      },
      waldruh: {
        lamps: [[650,259],[944,501],[492,505],[1065,268],[1210,340]],
        foliage: [[511,396],[781,181],[875,395],[500,754],[892,854],[1196,839]],
      },
      nebelstadt: {
        lamps: [[525,325],[916,348],[1066,388],[1202,406],[1277,450],[1139,533],[448,357]],
        foliage: [[549,432],[942,531],[843,736],[359,437]],
      },
    };
    const layout = layouts[this.mapSpec.id];
    const add = (kind: Ambient['kind'], x: number, y: number, phase: number, scale: number, amplitude = 1): void => {
      const sprite = this.add.image(x, y, kind).setDepth(kind === 'lantern' ? y + 2 : 2000).setAlpha(.3).setScale(scale);
      this.ambient.push({ sprite, x, y, phase, speed: .25 + phase % 4 * .08, kind, amplitude });
    };
    const total = this.scale.width < 700 ? 13 : 23;
    for (let i = 0; i < total; i++) {
      const kind: Ambient['kind'] = i < 2 && this.mapSpec.id !== 'nebelstadt' ? 'butterfly' : i < (this.mapSpec.id === 'waldruh' ? 11 : 6) ? 'leaf' : 'mote';
      const anchor = layout.foliage[i % layout.foliage.length];
      add(kind, anchor[0] + i * 37 % 90 - 45, anchor[1] + i * 23 % 60 - 30, i * 1.63, kind === 'butterfly' ? .4 : kind === 'leaf' ? .6 : .42);
    }
    layout.lamps.forEach(([x, y], i) => add('lantern', x, y, i * .85, .65));
    for (let bird = 0; bird < (this.mapSpec.id === 'nebelstadt' ? 3 : 2); bird++) add('bird', 420 + bird * 270, 235 + bird * 70, bird * 2.4, .65);
  }

  private updateAmbient(time: number): void {
    const view = this.cameras.main.worldView;
    for (const item of this.ambient) {
      const cycle = time * item.speed + item.phase;
      const visible = item.x >= view.x - 160 && item.x <= view.right + 160 && item.y >= view.y - 160 && item.y <= view.bottom + 160;
      item.sprite.setVisible(visible);
      if (!visible) continue;
      if (item.kind === 'lantern') {
        item.sprite.setAlpha(.25 + Math.sin(cycle * 2) * .05).setScale(.65 + Math.sin(cycle) * .045);
      } else if (item.kind === 'bird') {
        item.sprite.setPosition(item.x + Math.sin(cycle * .35) * 110, item.y + Math.cos(cycle * .4) * 30).setScale(.65, .45 + Math.abs(Math.sin(time * 5 + item.phase)) * .25).setAlpha(.5);
      } else {
        const radius = item.kind === 'butterfly' ? 22 : 12;
        item.sprite.setPosition(item.x + Math.sin(cycle) * radius, item.y + Math.sin(cycle * 0.7) * radius * 0.5);
        if (item.kind === 'butterfly') item.sprite.setScale(0.44 * (0.3 + Math.abs(Math.sin(time * 8 + item.phase)) * 0.7), 0.44);
        if (item.kind === 'leaf') item.sprite.setRotation(Math.sin(cycle) * 0.8).setAlpha(0.35);
        if (item.kind === 'mote') item.sprite.setAlpha(0.12 + (Math.sin(cycle) + 1) * 0.13);
      }
    }
  }

  private drawFallbackTown(): Phaser.GameObjects.Graphics {
    const ground = this.add.graphics().setDepth(-1000);
    ground.fillStyle(0x6d8464).fillRect(0, 0, WIDTH, HEIGHT);
    ground.fillStyle(0x567253).fillRect(0, 0, WIDTH, 220);
    ground.fillStyle(0x577c7d).fillPoints([[1150, 0], [1380, 0], [1536, 480], [1536, 1024], [1060, 1024], [1150, 640], [1080, 300]].map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    ground.lineStyle(115, 0xb7aa82, 1).lineBetween(160, 720, 1320, 480);
    ground.lineStyle(86, 0xc7b994, 1).lineBetween(710, 100, 590, 1024);
    ground.fillStyle(0xc6b895).fillEllipse(685, 590, 590, 300);
    ground.fillStyle(0xa59a77, 0.45);
    for (let i = 0; i < 150; i++) ground.fillEllipse(410 + i * 37 % 560, 480 + i * 53 % 210, 6 + i % 5, 3);
    const houses = [
      [290, 250, 265, 160, 0xa65e47], [670, 200, 255, 180, 0x7d7163],
      [875, 385, 220, 140, 0x987354], [185, 710, 225, 140, 0x975e4a],
      [800, 760, 255, 160, 0x8b7160],
    ];
    for (const [x, y, w, h, roof] of houses) {
      ground.fillStyle(0x253c30, 0.20).fillRoundedRect(x + 15, y + 20, w, h + 30, 10);
      ground.fillStyle(0xe2d3aa).fillRect(x, y + 30, w, h);
      ground.lineStyle(8, 0x66533c).strokeRect(x, y + 30, w, h);
      ground.fillStyle(roof).fillTriangle(x - 18, y + 40, x + w / 2, y - 65, x + w + 18, y + 40);
      ground.lineStyle(3, 0x614e3d).lineBetween(x - 18, y + 40, x + w / 2, y - 65).lineBetween(x + w / 2, y - 65, x + w + 18, y + 40);
      for (let j = 0; j < 3; j++) {
        ground.fillStyle(0x59695a).fillRoundedRect(x + 25 + j * (w - 55) / 3, y + 60, 31, 39, 3);
        ground.lineStyle(3, 0x9b8664).strokeRect(x + 25 + j * (w - 55) / 3, y + 60, 31, 39);
      }
      ground.fillStyle(0x675641).fillRoundedRect(x + w * 0.42, y + h - 26, 41, 56, 12);
    }
    for (let i = 0; i < 37; i++) {
      const x = 70 + i * 293 % 1430;
      const y = i < 15 ? 65 + i * 31 % 130 : 200 + i * 173 % 740;
      if (x > 440 && x < 1080 && y > 440 && y < 790) continue;
      ground.fillStyle(0x273e2e, 0.2).fillEllipse(x + 12, y + 15, 89, 37);
      ground.fillStyle(0x6c6240).fillRect(x - 5, y - 44, 10, 48);
      ground.fillStyle(i % 3 ? 0x4c684c : 0x8c935d).fillCircle(x, y - 51, 40);
      ground.fillStyle(i % 3 ? 0x658060 : 0xa3a565).fillCircle(x - 14, y - 65, 28);
    }
    ground.fillStyle(0x9d967c).fillEllipse(687, 554, 96, 52);
    ground.fillStyle(0xd9d1ad).fillEllipse(687, 545, 91, 42);
    ground.fillStyle(0x668c8a).fillEllipse(687, 545, 69, 28);
    ground.fillStyle(0xbdb695).fillRect(681, 506, 12, 35).fillEllipse(687, 507, 38, 16);
    return ground;
  }
}
