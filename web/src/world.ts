import {worldDaySeconds,worldStartHour,type SharedWorldTime,type WorldSimulationTime} from './shared-world-time';
import {ResidentActivityWorld,type ActivityResidentSample} from './resident-activities';
import {worldRain,type WorldWeatherMode} from './world-weather';
import {residentActionKey,residentActionPose,residentSeatedOffset,RESIDENT_ACTION_ART} from './resident-action-art';
import type { AvatarParts } from './avatar-options';
import * as Phaser from 'phaser';
import { npcs } from './content';
import { createMapNavigation, NavigationGrid } from './navigation';
import type { MapPoint } from './navigation';
import { getMap, maps, type MapId, type WorldObjectSpec, type WorldMapSpec } from './maps';
import { NPC_ART, INTERIOR_CHARACTER_HEIGHT, characterArtScale, createContactShadow } from './character-art';
import { buildWidth, characterFrame, MODULAR_ART, modularAssets, normalizeParts, partTextureKey } from './avatar-options';
import { advanceWalkDistance, WALK_POSE_COLUMNS } from './walk-animation';
import { characterLayers, paintCharacter } from './modular-character';
import { createWorldResidents, sampleResidentMotion, sampleResidentSchedule } from './world-life';
import { residentFacingLeft, residentWalkDistance, residentWalkFrame } from './resident-animation';
import { WorldScenery } from './world-scenery';
import { WorldTerrain } from './world-terrain';
import {StreamedWorldTerrain, terrainResidency} from './streamed-world-terrain';
import {getWorldScene} from './scene-data';
import { createScreenFilter, type ScreenFilterController } from './screen-filters';
import { normalizeScreenFilterSettings, type ScreenFilterSettings } from './screen-filter-settings';
import { WorldMapAssets, regionPeopleKey, regionPeopleFrames } from './world-map-assets';
import { WorldAnimationAssets } from './world-animation-assets';
import { getExpeditionNpc } from './expeditions';
import { worldAmbient, timeAmbient } from './world-lighting';
import { canvasSize, explorationZoom, conversationZoom, cameraScroll } from './world-camera';
import { WorldAudio, loadWorldAudio } from './world-audio';
import { WorldAtmosphere } from './world-atmosphere';
import { gamepadInput } from './world-gamepad';
import { FrameTelemetry } from './world-performance';
import { npcRoutine,residentRoutine,WorldBarkDirector,type RoutineLexeme,type WorldBark } from './world-routines';
import type { Progress } from './api';
import { CutsceneScene, type CutsceneKind, type CameraBeat } from './cutscene';
import { sceneryAnimationManifestKey, sceneryAnimationTextureKeys, sampleSceneryFrame, type SceneryAnimation, type SceneryAnimationManifest } from './scenery-animation';
import { WorldClock, type WorldPeriod, type WorldTimeOptions, type WorldTimeState } from './world-clock';
import { buildingEntrances, createInteriorNavigation, getInterior, interiorNpcAvailable, interiorObjectAvailable, interiors, type InteriorId, type InteriorSpec } from './interiors';
import { WorldInterior } from './world-interior';

export interface Avatar extends Partial<AvatarParts> {
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
  interiorId?: InteriorId;
}

export type WorldMotion = 'auto' | 'full' | 'reduced';
export interface WorldStoryState { completedQuestIds: readonly string[]; bellCount: number; flags?: Record<string, boolean>; playerName?: string; }

export interface WorldOptions {
  motion?: WorldMotion;
  time?: WorldTimeOptions;
  onTimeChange?: (state: WorldTimeState) => void;
  onNpc: (id: string) => void;
  onMove: (x: number, y: number) => void;
  onReady?: () => void;
  onNearby?: (id: string | undefined) => void;
  onObject?: (id: string) => void;
  onMiniGame?: (id:string)=>void;
  onMapReady?: (id: MapId) => void;
  onInteriorChange?: (id: InteriorId | undefined) => void;
  onInteriorInteract?: (id: string) => void;
  onBarkShown?: (bark:WorldBark)=>void;
  onCinematicLine?:(speaker:string,german:string,clipId:string)=>void;
  onCinematicEnd?:()=>void;
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
  lastWalkTime?: number;
  frame: number;
  npc: boolean;
  artScale: number;
  avatar: Avatar;
  hovered?: boolean;
  interactionId?: string;
  idleAnimation?: SceneryAnimation;
  walkingAnimation?: SceneryAnimation;
  idleFrame?: string;
  localArtVariant?: number;
  castRow?: number;
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
  glyph: Phaser.GameObjects.Text;
  hovered: boolean;
}

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
const legacyAvatarKey = (avatar: Avatar) => `${color(avatar.hair, DEFAULT_AVATAR.hair)}:${color(avatar.skin, DEFAULT_AVATAR.skin)}:${color(avatar.outfit, DEFAULT_AVATAR.outfit)}`;
const avatarKey = (avatar: Avatar) => JSON.stringify([legacyAvatarKey(avatar),avatar.face,avatar.hairstyle,avatar.jacket,avatar.bottom,avatar.build,avatar.pants]);
const isTyping = () => {
  const focused = document.activeElement;
  return typeof HTMLElement !== 'undefined' && focused instanceof HTMLElement && (focused.matches('input, textarea, select') || focused.isContentEditable);
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
  private density = 1;
  private audioPreferences = { silent: false, muted: false };
  private narrationActive = false;
  private storyState: WorldStoryState = { completedQuestIds: [], bellCount: 0 };
  private conversationTarget?: string;
  private handleActivity = (event: Event) => {
    if (this.visible && !document.hidden && !isTyping()) {
      this.handleFocus();
      if (event.type === 'keydown' && (event as KeyboardEvent).code === 'KeyE' && !(event as KeyboardEvent).repeat && this.scene.ready) this.scene.queueKeyboardInteraction();
    }
  };
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
    const size = canvasSize(container.clientWidth, container.clientHeight, window.devicePixelRatio);
    this.density = size.density;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: size.width,
      height: size.height,
      scale: { zoom: 1 / size.density },
      backgroundColor: '#283e36',
      scene: [this.scene, new CutsceneScene(beat => this.scene.setCinematicTarget(beat),(speaker,german,clipId)=>options.onCinematicLine?.(speaker,german,clipId))],
      antialias: true,
      transparent: false,
      render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
      fps: { target: 60, smoothStep: true },
      input: { activePointers: 2 },
      audio: { disableWebAudio: false },
      banner: false,
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('focus', this.handleFocus);
    document.addEventListener('keydown', this.handleActivity, true);
    document.addEventListener('pointerdown', this.handleActivity, true);
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

  getWorldStats(): { objects: number; animated: number; residents: number; seconds: number; period: WorldPeriod; fps:number;frameMs:number;p95FrameMs:number } {
    return this.scene.worldStats;
  }

  getTerrainStats(): { width: number; height: number; pixelZoom: number; textures: number; pixels: number; pending: number; failed: number } {
    return this.scene.terrainStats;
  }
  getActivityResidents():{id:string;name:string;state:ActivityResidentSample}[]{return this.scene.activityResidentStates;}
  observeResident(id?:string):void{this.scene.observeResident(id);}
  /** Editor/QA weather changes cannot override a connected simulation. */
  setWeatherPreview(mode:WorldWeatherMode):void{if(import.meta.env.DEV)this.scene.setWeatherPreview(mode);}
  getWeather():number{return this.scene.rainIntensity();}

  playCutscene(kind: CutsceneKind, ending?: string): Promise<void> {
    if (!this.scene.ready || this.motionMode === 'reduced' || this.motionMode === 'auto' && this.motionPreference.matches) return Promise.resolve();
    if (this.game.scene.isActive('cinematic')) return Promise.resolve();
    this.scene.setInputEnabled(false);
    return new Promise(resolve => this.game.scene.run('cinematic', { kind, mapId: this.mapId, ending, complete: () => {
      if (this.alive) this.scene.setInputEnabled(this.inputEnabled && this.visible && !document.hidden);
      this.options.onCinematicEnd?.();
      resolve();
    } }));
  }

  setConversationTarget(id: string | undefined): void {
    this.conversationTarget = id;
    if (this.scene.ready) this.scene.setConversationTarget(id);
  }
  setStoryState(state: WorldStoryState): void {
    this.storyState = state;
    if (this.scene.ready) this.scene.setStoryState(state);
  }
  setAudioPreferences(preferences: { silent: boolean; muted: boolean }): void {
    this.audioPreferences = preferences;
    if (this.scene.ready) this.scene.setAudioPreferences(preferences);
  }
  setNarrationActive(active: boolean): void {
    this.narrationActive = active;
    if (this.scene.ready) this.scene.setNarrationActive(active);
  }

  setSharedClock(state: SharedWorldTime): void { this.scene.setSharedClock(state); }
  setLearningContext(lexicon:readonly RoutineLexeme[],progress:Pick<Progress,'words'>,introduced?:ReadonlySet<string>,lineAllowed?:(german:string)=>boolean):void { this.scene.setLearningContext(lexicon,progress,introduced,lineAllowed); }
  barkShown(bark:WorldBark):void {this.options.onBarkShown?.(bark);}
  setTimePreference(options: WorldTimeOptions): void { this.scene.setTimePreference(options); }
  getWorldTime(): WorldTimeState { return this.scene.worldTime; }
  getPlayerPosition():MapPoint|undefined {return this.scene.ready?this.scene.playerPosition():undefined;}
  deliveryRoute():{recipient:string;points:MapPoint[]}|undefined {return this.scene.ready?this.scene.deliveryRoute():undefined;}
  deliveryChoices(origin:MapPoint,target:MapPoint):MapPoint[]{return this.scene.ready?this.scene.deliveryChoices(origin,target):[target];}
  showDeliveryCheckpoints(points:readonly MapPoint[],lit:number):void {if(this.scene.ready)this.scene.showDeliveryCheckpoints(points,lit);}
  showDeliveryArrival(recipient:string):void {if(this.scene.ready)this.scene.showDeliveryArrival(recipient);}
  timeChanged(state: WorldTimeState): void { this.options.onTimeChange?.(state); }

  /** Draw the same painted south-facing avatar used in the game, CPU only. */
  renderAvatarPreview(canvas: HTMLCanvasElement, avatar: Avatar, facing = 0, phase?: number): boolean {
    return this.scene.ready && this.scene.renderAvatarPreview(canvas, avatar, facing, phase);
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

  /** Apply a confirmed room before its authoritative player snapshot. */
  confirmInterior(id: InteriorId | undefined): void {
    if (id) this.enterInterior(id);
    else this.leaveInterior();
    if (this.scene.ready) this.scene.resetPlayerPosition();
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
    const active = this.inputEnabled && this.visible && !document.hidden;
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
    if (this.scene.ready) this.scene.setAudioVisible(visible && !document.hidden);
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
    const size = canvasSize(width, height, window.devicePixelRatio);
    this.density = size.density;
    this.game.scale.resize(size.width, size.height);
    // Refresh zoom after the backing size: Phaser leaves the previous inline
    // CSS dimensions in place when resize runs at zoom=1.
    this.game.scale.setZoom(1 / size.density);
    if (this.scene.ready) this.scene.fitCamera(size.width, size.height, size.density);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('focus', this.handleFocus);
    document.removeEventListener('keydown', this.handleActivity, true);
    document.removeEventListener('pointerdown', this.handleActivity, true);
    this.motionPreference.removeEventListener('change', this.handleMotionPreference);
    this.game.destroy(true);
  }

  boot(): void {
    this.handleMotionPreference();
    this.scene.setScreenFilter(this.screenFilterSettings);
    this.scene.switchMap(this.mapId);
    this.scene.setObjective(this.objective);
    this.scene.changeAvatar(this.avatar);
    this.scene.setWindowFocused(this.windowFocused);
    this.scene.setInputEnabled(this.inputEnabled && this.visible && !document.hidden);
    this.scene.setJoystick(this.joystick.x, this.joystick.y);
    this.scene.setWatchMode(this.watching);
    this.scene.setTerrainOnly(this.terrainOnly);
    if (this.pendingInterior) this.scene.enterInterior(this.pendingInterior);
    this.scene.syncPlayers(this.pendingPlayers, this.selfId);
    this.resize();
    this.game.canvas.setAttribute('aria-label', 'Lantern Atlas game world. Use WASD, arrow keys, the touch joystick, or tap a destination. Press E or the action button to speak or investigate nearby.');
    this.game.canvas.setAttribute('role', 'application');
    this.scene.setAudioPreferences(this.audioPreferences);
    this.scene.setNarrationActive(this.narrationActive);
    this.scene.setStoryState(this.storyState);
    this.scene.setConversationTarget(this.conversationTarget);
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
  playMiniGame(id:string):void {this.options.onMiniGame?.(id);}

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
  private atmosphere?: WorldAtmosphere;
  private audio?: WorldAudio;
  private storyState: WorldStoryState = { completedQuestIds: [], bellCount: 0 };
  private conversationTarget?: string;
  private cinematicTarget?: CameraBeat;
  private density = 1;
  private coverZoom = 1;
  private lastAmbient = '';
  private periodFade?: Phaser.Tweens.Tween;
  private previousScenery?: WorldScenery;
  private previousBackground?: StreamedWorldTerrain | WorldTerrain | Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private pendingTerrain?: StreamedWorldTerrain;
  private previousPeriod?: WorldPeriod;
  private interior?: WorldInterior;
  private interiorSpec?: InteriorSpec;
  private portals = new Map<string, WorldPortal>();
  private outdoors?: {
    x: number; y: number; facing: number; navigation: NavigationGrid;
    characters: Map<string, Character>; objects: Map<string, WorldObject>; portals: Map<string, WorldPortal>;
  };
  private latestPlayers?: { players: WorldPlayer[]; selfId: string };
  private interiorPropTargets: Phaser.GameObjects.Zone[] = [];
  private roomRevision = 0;
  private residents: { character: Character; motion: ReturnType<typeof createWorldResidents>[number]; sample: ReturnType<typeof sampleResidentMotion>;routineElapsed?:number;homeReached?:boolean }[] = [];
  private activityWorld?:ResidentActivityWorld;
  private weatherPreview:WorldWeatherMode='regional';
  private activityResidents:{character:Character;prop:Phaser.GameObjects.Graphics;actionFigure?:Phaser.GameObjects.Image;speech?:Phaser.GameObjects.Text;propKind?:string;sample?:ActivityResidentSample}[]=[];
  private observedResidentId?:string;
  observeResident(id?:string):void{this.observedResidentId=id;}
  get activityResidentStates():{id:string;name:string;state:ActivityResidentSample}[]{
    return this.activityResidents.flatMap(resident=>resident.sample?[{id:resident.character.id,name:this.activityWorld!.residents.find(item=>item.spec.id===resident.character.id)!.spec.name,state:{...resident.sample}}]:[]);
  }
  private reducedMotion = false;
  private navigation!: NavigationGrid;
  private deliveryMarkers:Phaser.GameObjects.Container[]=[];
  playerPosition():MapPoint{return{x:this.local.x,y:this.local.y};}
  deliveryChoices(origin:MapPoint,target:MapPoint):MapPoint[]{
    const distance=Math.max(55,Math.min(130,Math.hypot(target.x-origin.x,target.y-origin.y))),points:MapPoint[]=[target];
    for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const point=this.navigation.closestPoint(origin.x+dx*distance,origin.y+dy*distance);
      if(Math.hypot(point.x-origin.x,point.y-origin.y)<45||points.some(existing=>Math.hypot(existing.x-point.x,existing.y-point.y)<45)||!this.navigation.canWalkSegment(origin.x,origin.y,point.x,point.y))continue;
      points.push(point);
    }
    return points;
  }
  deliveryRoute():{recipient:string;points:MapPoint[]}|undefined {
    if(this.interiorSpec)return;
    const candidates=[...this.characters.values()].filter(npc=>this.characterRevealed(npc)).sort((a,b)=>Math.abs(Math.hypot(a.x-this.local.x,a.y-this.local.y)-450)-Math.abs(Math.hypot(b.x-this.local.x,b.y-this.local.y)-450));
    for(const npc of candidates){
      const endpoint=this.navigation.closestPoint(npc.x,npc.y+45),path=this.navigation.findPath(this.local,endpoint);
      if(!path.length||Math.hypot(endpoint.x-this.local.x,endpoint.y-this.local.y)<180)continue;
      const points:MapPoint[]=[this.playerPosition()];let previous=this.playerPosition();
      for(const point of path){const distance=Math.hypot(point.x-previous.x,point.y-previous.y),pieces=Math.max(1,Math.ceil(distance/120));for(let i=1;i<=pieces;i++)points.push({x:previous.x+(point.x-previous.x)*i/pieces,y:previous.y+(point.y-previous.y)*i/pieces});previous=point;}
      if(points.length>2)return{recipient:npc.id,points};
    }
  }
  showDeliveryCheckpoints(points:readonly MapPoint[],lit:number):void {
    this.deliveryMarkers.forEach(marker=>marker.destroy());this.deliveryMarkers=[];
    for(const [index,point]of points.entries()){
      const glow=this.add.ellipse(0,0,45,24,index<lit?0xffdc81:0x847856,index<lit?.6:.15).setStrokeStyle(2,0xe5c37c,.65);
      const marker=this.add.image(0,-18,'discovery').setTint(index<lit?0xffdc81:0x948567).setAlpha(index<lit?1:.45);
      const size=Math.max(52,44/this.fitZoom),hit=this.add.zone(0,-10,size,size).setInteractive({useHandCursor:true});
      hit.on('pointerdown',(_pointer:Phaser.Input.Pointer,_x:number,_y:number,event:Phaser.Types.Input.EventData)=>{event.stopPropagation();if(this.controlsEnabled&&!this.watching&&!document.hidden)this.walkTo(point.x,point.y);});
      this.deliveryMarkers.push(this.add.container(point.x,point.y,[glow,marker,hit]).setDepth(point.y+10));
    }
  }
  showDeliveryArrival(recipient:string):void {
    const npc=[...this.characters.values()].find(npc=>npc.id===recipient||npcs.find(spec=>spec.id===npc.id)?.name.toLocaleLowerCase()===recipient.toLocaleLowerCase());
    if(!npc)return;
    const parcel=this.add.image(this.local.x,this.local.y-35,'discovery').setDepth(Math.max(this.local.y,npc.y)+100).setTint(0xf7d38a);
    this.tweens.add({targets:parcel,x:npc.x,y:npc.y-35,scale:.3,alpha:0,duration:this.reducedMotion?1:800,onComplete:()=>parcel.destroy()});
    npc.halo?.setAlpha(.7);this.audio?.effect('bell');
  }
  private mapSpec = getMap('lindenhafen');
  private get worldWidth(): number { return (this.interiorSpec ?? this.mapSpec).width; }
  private get worldHeight(): number { return (this.interiorSpec ?? this.mapSpec).height; }
  private background?: StreamedWorldTerrain | WorldTerrain | Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
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
  private queuedKeyboardInteraction = false;
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
  private animationAssets = new WorldAnimationAssets(this, false);
  private mapAnimationsReady = false;
  private animationRetryAt = 0;
  private regionAssets = new WorldMapAssets(this, false);
  private clock: WorldClock;
  private period: WorldPeriod;
  private pendingPeriod?: string;
  private lastClockLabel = '';
  private frames=new FrameTelemetry();
  private padPressed=false;
  private barkDirector=new WorldBarkDirector();
  private bark?:Phaser.GameObjects.Text;
  private barkUntil=0;
  private barkSpeaker?:Character;
  private lexicon:readonly RoutineLexeme[]=[];
  private learningProgress:Pick<Progress,'words'>={words:{}};
  private introducedWords?:ReadonlySet<string>;
  private barkLineAllowed?:(german:string)=>boolean;
  setLearningContext(lexicon:readonly RoutineLexeme[],progress:Pick<Progress,'words'>,introduced?:ReadonlySet<string>,lineAllowed?:(german:string)=>boolean){this.lexicon=lexicon;this.learningProgress=progress;this.introducedWords=introduced;this.barkLineAllowed=lineAllowed;}
  setSharedClock(state: SharedWorldTime) { this.clock.setSharedTime(state); }
  get worldTime(): WorldTimeState { return this.clock.advance(0); }
  get interiorId(): InteriorId | undefined { return this.interiorSpec?.id; }
  setTimePreference(options: WorldTimeOptions): void { this.clock.configure(options); if (this.ready) this.updateWorldTime(0); }

  get worldStats(): { objects: number; animated: number; residents: number; seconds: number; period: WorldPeriod;fps:number;frameMs:number;p95FrameMs:number } {
    return { objects: this.interior?.objectCount ?? this.scenery?.objectCount ?? 0,
      residents: this.interior ? this.characters.size : this.residents.length+this.activityResidents.length,
      animated: this.interior?.animatedObjectCount ?? this.scenery?.animatedObjectCount ?? 0, seconds: this.decorativeElapsed, period: this.period,...this.frames.snapshot() };
  }

  get terrainStats(): { width: number; height: number; pixelZoom: number; textures: number; pixels: number; pending: number; failed: number } {
    const size = this.background instanceof WorldTerrain || this.background instanceof StreamedWorldTerrain ? this.background.nativeSize : { width: 0, height: 0 };
    return { ...size, ...terrainResidency(this).snapshot(), pixelZoom: size.width ? this.cameras.main.zoom / (size.width / this.mapSpec.width) : 0 };
  }

  constructor(private owner: World, time?: WorldTimeOptions) { super({ key: 'lindenhafen' }); this.clock = new WorldClock(time); this.period = this.clock.advance(0).period; }

  preload(): void {
    loadWorldAudio(this);
    this.regionAssets.load(getMap('lindenhafen'), undefined, false);
    const period = this.period;
    this.animationAssets.load('lindenhafen', period, () => {
      if (this.ready && this.mapSpec.id !== 'lindenhafen') this.releaseAnimationAssets('lindenhafen', period);
    }, false);
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
    this.load.spritesheet('story-cast', '/assets/story-cast/directions.webp', { frameWidth: 256, frameHeight: 384 });
    this.load.spritesheet('main-cast', '/assets/story-cast/main-directions.webp', { frameWidth: 256, frameHeight: 384 });
    this.load.image('greenhouse-train','/assets/story-cast/greenhouse-train.webp');
    this.load.spritesheet(NPC_ART.key, '/assets/characters.webp', { frameWidth: NPC_ART.width, frameHeight: NPC_ART.height });
    for (const asset of modularAssets) this.load.spritesheet(partTextureKey(asset.id, ''), `/assets/player-layers/${asset.id}-preview.webp?v=layers12`, { frameWidth: MODULAR_ART.width, frameHeight: MODULAR_ART.height });
  }

  private releaseAnimationAssets(id: MapId, period: WorldPeriod): void {
    const key = sceneryAnimationManifestKey(id, period);
    // A partly loaded atlas must remain intact until its completion callbacks
    // decide whether to display it or release the stale request.
    if (this.animationAssets.pending(id, period)) return;
    const manifest = this.cache.json.get(key) as SceneryAnimationManifest | undefined;
    const retainedPages = this.animationAssets.retainedTextures(this.mapSpec.id, this.period, this.previousPeriod);
    if (manifest) for (const page of sceneryAnimationTextureKeys(manifest)) {
      // Expedition day/night periods can share one authored detail sheet.
      if (!retainedPages.has(page) && this.textures.exists(page)) this.textures.remove(page);
    }
  }

  private applyPeriod(period: WorldPeriod): void {
    if (this.interiorSpec || period === this.period && this.mapAnimationsReady) return;
    if (!this.animationAssets.ready(this.mapSpec.id, period)) return;
    let terrain = this.background instanceof StreamedWorldTerrain && this.background.period === period ? this.background : undefined;
    if (!terrain) {
      if (this.pendingTerrain?.period !== period) {
        this.pendingTerrain?.destroy();
        this.pendingTerrain = new StreamedWorldTerrain(this,getWorldScene(this.mapSpec.id),period).setAlpha(0);
      }
      this.pendingTerrain.update(this.cameras.main.worldView,this.cameras.main.zoom);
      if (!this.pendingTerrain.ready) return;
      terrain = this.pendingTerrain;this.pendingTerrain=undefined;
    }
    this.finishPeriodTransition();
    const previous = this.period, oldScenery = this.scenery, oldBackground = this.background;
    this.period = period;
    this.background = terrain;
    this.scenery = new WorldScenery(this, this.mapSpec.id, period);
    this.mapAnimationsReady = true;
    this.atmosphere?.setLampLights(this.scenery.lampLights);
    this.scenery.setReducedMotion(this.reducedMotion);
    this.scenery.setVisible(!this.terrainOnly);
    if (oldBackground && oldBackground !== terrain && previous !== period && this.tweens && !this.reducedMotion) {
      this.previousScenery = oldScenery; this.previousBackground = oldBackground; this.previousPeriod = previous;
      terrain.setAlpha(0);
      const fade = { alpha: 0 };
      this.scenery.setAlpha(0);
      this.periodFade = this.tweens.add({ targets: fade, alpha: 1, duration: 1300, ease: 'Sine.easeInOut',
        onUpdate: () => { this.scenery?.setAlpha(fade.alpha); this.background?.setAlpha(fade.alpha); },
        onComplete: () => this.finishPeriodTransition() });
    } else {
      oldScenery?.destroy();
      if (oldBackground !== terrain) oldBackground?.destroy();
      terrain.setAlpha(1).setTint(timeAmbient(this.mapSpec.id, this.clock.advance(0).hour, period).terrain);
      if (previous !== period) this.releaseAnimationAssets(this.mapSpec.id, previous);
    }
    this.lastAmbient = '';
    for (const character of this.characters.values()) this.setCharacterAmbient(character);
    for (const {character} of this.residents) this.setCharacterAmbient(character);
    for (const {character} of this.activityResidents) this.setCharacterAmbient(character);
    this.pendingPeriod = undefined;
  }

  private finishPeriodTransition(): void {
    this.periodFade?.stop(); this.periodFade = undefined;
    this.previousScenery?.destroy(); this.previousScenery = undefined;
    this.previousBackground?.destroy(); this.previousBackground = undefined;
    this.scenery?.setAlpha?.(1); this.background?.setAlpha?.(1);
    const previous = this.previousPeriod; this.previousPeriod = undefined;
    if (previous && previous !== this.period) this.releaseAnimationAssets(this.mapSpec.id, previous);
  }

  private updateWorldTime(seconds: number): void {
    const state = this.clock.advance(seconds);
    this.audio?.setHour(state.hour);
    if (state.label + state.period + state.mode !== this.lastClockLabel) {
      this.lastClockLabel = state.label + state.period + state.mode;
      this.owner.timeChanged(state);
    }
    if (!this.mapVisualsReady || this.interiorSpec) return;
    const ambientStamp = `${Math.round(state.hour * 120)}:${this.period}`;
    if (ambientStamp !== this.lastAmbient && !this.interiorSpec) {
      this.lastAmbient = ambientStamp;
      const ambient = timeAmbient(this.mapSpec.id, state.hour, this.period);
      if (this.background && 'setTint' in this.background) this.background.setTint(ambient.terrain);
      this.scenery?.setAmbientTint?.(ambient.scenery, ambient.light);
      for (const character of this.characters.values()) this.setCharacterAmbient(character);
      for (const { character } of this.residents) this.setCharacterAmbient(character);
      for (const { character } of this.activityResidents) this.setCharacterAmbient(character);
    }
    const request = `${this.mapSpec.id}-${state.period}`;
    if ((state.period !== this.period || !this.mapAnimationsReady) && this.pendingPeriod !== request && this.time.now >= this.animationRetryAt) {
      this.pendingPeriod = request;
      const id = this.mapSpec.id;
      const revision = this.mapRevision;
      this.animationAssets.load(id, state.period, loaded => {
        if (this.pendingPeriod === request) this.pendingPeriod = undefined;
        if (this.ready && this.mapVisualsReady && this.mapSpec.id === id && revision === this.mapRevision && this.clock.advance(0).period === state.period) {
          if (loaded) this.applyPeriod(state.period);
          else this.animationRetryAt = this.time.now + 3000;
        }
        else if (this.mapSpec.id !== id || this.period !== state.period) this.releaseAnimationAssets(id, state.period);
      });
    }
  }

  create(): void {
    this.navigation = createMapNavigation('lindenhafen');
    createContactShadow(this);
    this.playerArtReady = modularAssets.every(asset => this.textures.exists(partTextureKey(asset.id, '')));
    this.screenFilter = createScreenFilter(this);
    this.audio = new WorldAudio(this);
    this.createMarkerTexture();
    this.marker = this.add.container(0, 0, [
      this.add.ellipse(0, 0, 37, 18).setStrokeStyle(1.5, 0xf5e4ac, 0.8),
      this.add.ellipse(0, 0, 6, 3, 0xf5e4ac, 0.8),
    ]).setDepth(1).setVisible(false);

    const spawn = this.navigation.closestPoint(this.worldWidth * this.mapSpec.spawn.x, this.worldHeight * this.mapSpec.spawn.y);
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
      if (!this.controlsEnabled || this.watching || objects.length || pointer.rightButtonDown()) return;
      const destination = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.walkTo(destination.x, destination.y);
    });
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.ready = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.scenery?.destroy();
      this.scenery = undefined;
      this.interior?.destroy();
      this.interior = undefined;
      this.residents = [];
      this.activityResidents=[];this.activityWorld=undefined;
      this.finishPeriodTransition();
      this.pendingTerrain?.destroy(); this.pendingTerrain=undefined;
      this.background?.destroy(); this.background=undefined;
      this.atmosphere?.destroy(); this.audio?.destroy();
    });
    this.owner.boot();
  }

  setScreenFilter(settings: ScreenFilterSettings): void {
    this.screenFilter?.configure(settings);
  }

  switchMap(id: MapId): void {
    if (this.interiorSpec) this.leaveInterior(false);
    this.latestPlayers = undefined;
    const map = getMap(id);
    const revision = ++this.mapRevision;
    this.clearControls();
    this.initializedSelf = false;
    this.lastX = -1;
    this.lastY = -1;
    this.cameraLead = { x: 0, y: 0 };
    if (this.mapSpec.id !== map.id || !this.background || !this.mapVisualsReady) {
      this.finishPeriodTransition();
      this.atmosphere?.destroy(); this.atmosphere = undefined;
      const previous = this.mapSpec;
      this.background?.destroy();
      this.pendingTerrain?.destroy(); this.pendingTerrain = undefined;
      this.scenery?.destroy();
      this.scenery = undefined;
      this.mapVisualsReady = false;
      this.mapAnimationsReady = false;
      this.animationRetryAt = 0;
      for (const npc of this.characters.values()) npc.root.destroy();
      for (const object of this.objects.values()) object.root.destroy();
      for (const portal of this.portals.values()) portal.root.destroy();
      for (const peer of this.peers.values()) peer.root.destroy();
      for (const resident of this.residents) resident.character.root.destroy();
      for (const resident of this.activityResidents) resident.character.root.destroy();
      this.characters.clear();
      this.objects.clear();
      this.portals.clear();
      this.peers.clear();
      this.residents = [];
      this.activityResidents=[];this.activityWorld=undefined;this.observedResidentId=undefined;
      this.mapSpec = map;
      this.pendingPeriod = undefined;
      this.navigation = createMapNavigation(map.id);
      if (previous.id !== map.id) {
        this.regionAssets.release(previous);
        for (const period of ['day', 'night'] as const) this.releaseAnimationAssets(previous.id, period);
      }
      // Travel coordinates and snapshots are ready immediately. Destination art
      // streams independently, so a network acknowledgement is never delayed.
      this.background = this.add.graphics().fillStyle(0x263b3c).fillRect(0, 0, this.worldWidth, this.worldHeight).setDepth(-1000);
      this.period = this.clock.advance(0).period;
      this.regionAssets.load(map, () => {
        if (!this.ready || this.mapSpec.id !== map.id || revision !== this.mapRevision) {
          if (this.mapSpec.id !== map.id) this.regionAssets.release(map);
          return;
        }
        this.background?.destroy();
        this.background = new StreamedWorldTerrain(this,getWorldScene(map.id),this.period)
          .setTint(worldAmbient(map.id,this.period).terrain).setVisible(!this.interiorSpec);
        this.background.update(this.cameras.main.worldView,this.cameras.main.zoom);
        this.scenery = new WorldScenery(this, map.id, this.period);
        this.scenery.setReducedMotion(this.reducedMotion);
        this.createMapCharacters(map);
        this.createMapObjects(map);
        this.createBuildingEntrances();
        this.createResidents();
        this.atmosphere = new WorldAtmosphere(this, map.id, this.scenery.lampLights);
        this.audio?.setRegion(map.id);
        this.lastAmbient = '';
        this.mapVisualsReady = true;
        this.setTerrainOnly(this.terrainOnly);
        const period = this.clock.advance(0).period;
        this.animationAssets.load(map.id, period, loaded => {
          if (this.ready && this.mapSpec.id === map.id && revision === this.mapRevision) {
            if (this.clock.advance(0).period === period) {
              if (loaded) this.applyPeriod(period);
              else this.animationRetryAt = this.time.now + 3000;
            }
            queueMicrotask(() => { if (this.ready && revision === this.mapRevision) this.owner.mapReady(map.id); });
          } else if (this.mapSpec.id !== map.id || this.period !== period) this.releaseAnimationAssets(map.id, period);
        });
      });
    } else {
      queueMicrotask(() => { if (this.ready && revision === this.mapRevision) this.owner.mapReady(map.id); });
    }
    const spawn = this.navigation.closestPoint(map.spawn.x * this.worldWidth, map.spawn.y * this.worldHeight);
    this.local.x = this.local.targetX = spawn.x;
    this.local.y = this.local.targetY = spawn.y;
    this.local.facing = 0;
    this.local.walkDistance = 0;
    this.local.lastWalkTime = undefined;
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.fitCamera(this.cameras.main.width, this.cameras.main.height, this.density);
  }

  enterInterior(id: InteriorId): void {
    if (this.interiorSpec?.id === id) return;
    const entrance = buildingEntrances(this.mapSpec.id).find(item=>item.interiorId===id);
    if (!entrance) return;
    if (this.interiorSpec) this.leaveInterior();
    const spec = getInterior(id);
    this.finishPeriodTransition();
    this.pendingTerrain?.destroy();this.pendingTerrain=undefined;
    this.clearControls();
    this.outdoors = {
      x: entrance.returnPoint.x*this.mapSpec.width, y: entrance.returnPoint.y*this.mapSpec.height, facing: this.local.facing, navigation: this.navigation,
      characters: this.characters, objects: this.objects, portals: this.portals,
    };
    this.background?.setVisible(false);
    this.scenery?.setVisible(false);
    this.atmosphere?.setVisible(false);
    for (const character of this.characters.values()) character.root.setVisible(false);
    for (const object of this.objects.values()) object.root.setVisible(false);
    for (const portal of this.portals.values()) portal.root.setVisible(false);
    for (const peer of this.peers.values()) peer.root.destroy();
    this.peers.clear();
    for (const resident of this.residents) resident.character.root.setVisible(false);
    for (const resident of this.activityResidents) resident.character.root.setVisible(false);
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
    this.createPortal(`exit:${id}`, spec.exit.x * this.worldWidth, spec.exit.y * this.worldHeight, 'Return to town', true);
    const spawn = this.navigation.closestPoint(spec.spawn.x * this.worldWidth, spec.spawn.y * this.worldHeight);
    this.local.x = this.local.targetX = spawn.x;
    this.local.y = this.local.targetY = spawn.y;
    this.local.facing = 2;
    this.local.walkDistance = 0;
    this.local.lastWalkTime = undefined;
    this.cameraLead = { x: 0, y: 0 };
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.fitCamera(this.cameras.main.width, this.cameras.main.height, this.density);
    this.transitionRoom();
    this.resetPlayerPosition();
    if (this.latestPlayers) this.syncPlayers(this.latestPlayers.players, this.latestPlayers.selfId, true);
    this.owner.interiorChanged(id);
    this.refreshNearby();
  }

  leaveInterior(restorePeers = true): void {
    if (!this.interiorSpec || !this.outdoors) return;
    this.clearControls();
    for (const peer of this.peers.values()) peer.root.destroy();
    this.peers.clear();
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
    this.local.lastWalkTime = undefined;
    this.cameraLead = { x: 0, y: 0 };
    this.background?.setVisible(true);
    this.scenery?.setVisible(!this.terrainOnly);
    this.atmosphere?.setVisible(!this.terrainOnly);
    this.lastAmbient = '';
    for (const character of this.characters.values()) character.root.setVisible(!this.terrainOnly && this.characterRevealed(character));
    for (const object of this.objects.values()) object.root.setVisible(!this.terrainOnly);
    for (const portal of this.portals.values()) portal.root.setVisible(!this.terrainOnly);
    const snapshot = this.latestPlayers;
    if (restorePeers && snapshot) this.syncPlayers(snapshot.players, snapshot.selfId, true);
    this.resetPlayerPosition();
    this.animateCharacter(this.local, 0, 0, this.elapsed);
    this.updateResidents();
    this.fitCamera(this.cameras.main.width, this.cameras.main.height, this.density);
    if (restorePeers) this.transitionRoom();
    this.owner.interiorChanged(undefined);
    this.refreshNearby();
  }

  private transitionRoom(): void {
    this.audio?.effect('door', .16);
    this.cameras.main.resetFX();
    if (!this.reducedMotion) this.cameras.main.fadeIn(220, 29, 35, 30);
  }

  setObjective(id: string | undefined): void { this.objective = id; }
  setCinematicTarget(beat: CameraBeat | undefined) { this.cinematicTarget = beat; }
  setAudioPreferences(preferences: { silent: boolean; muted: boolean }) { this.audio?.setPreferences(preferences); }
  setNarrationActive(active: boolean) { this.audio?.setNarration(active); }
  setAudioVisible(visible: boolean) { this.audio?.setVisible(visible); }
  setStoryState(state: WorldStoryState) {
    if (state.bellCount > this.storyState.bellCount) {
      this.audio?.effect('bell', .24);
      if (!this.reducedMotion) this.cameras?.main.shake?.(240, .003);
    }
    this.storyState = state;
    for (const npc of this.characters.values()) if (!this.characterRevealed(npc)) npc.root.setVisible(false);
    this.refreshNearby();
  }
  setConversationTarget(id: string | undefined) {
    const npc = id ? this.characters.get(id) : undefined;
    this.conversationTarget = npc && this.characterRevealed(npc) ? id : undefined;
    if (npc && this.local && this.characterRevealed(npc)) this.faceCharacters(this.local, npc);
  }
  private faceCharacters(player: Character, npc: Character) {
    const dx = npc.x - player.x, dy = npc.y - player.y;
    player.facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 0 : 2;
    if (!player.npc && this.playerArtReady) this.setCharacterFrame(player, characterFrame(player.facing));
    npc.facing = (player.facing + 2) % 4;
    if (!npc.npc && this.playerArtReady) this.setCharacterFrame(npc, characterFrame(npc.facing));
  }
  private characterRevealed(character: Character): boolean {
    if(character.id===this.conversationTarget)return true; // A reader can finish after visiting hours.
    const visitor = this.interiorSpec?.npcs.find(npc => npc.id === character.id);
    if (visitor && !interiorNpcAvailable(visitor, this.clock.gameplayHour())) return false;
    return character.id !== 'elise' || this.storyState.completedQuestIds.includes('b1-storm');
  }
  private objectAvailable(object: WorldObject): boolean {
    return !this.interiorSpec || interiorObjectAvailable(this.interiorSpec, object.spec.id, this.clock.gameplayHour());
  }

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
    this.atmosphere?.setVisible(!terrainOnly && !this.interiorSpec);
    for (const target of this.interiorPropTargets) target.setVisible(!terrainOnly);
    this.local?.root.setVisible(!terrainOnly && !this.watching);
    for (const character of this.characters.values()) character.root.setVisible(!terrainOnly && this.characterRevealed(character));
    for (const character of this.peers.values()) character.root.setVisible(!terrainOnly);
  }

  private createResidents(): void {
    if (!this.playerArtReady) return;
    const authored=getWorldScene(this.mapSpec.id);
    this.activityWorld=new ResidentActivityWorld(authored,this.navigation);
    for (const motion of createWorldResidents(this.mapSpec.id, this.navigation).filter(motion=>!authored.residents?.some(resident=>resident.id===motion.id))) {
      const sharedTime = this.clock.simulationTime();
      const schedule = sharedTime ? sampleResidentSchedule(motion, sharedTime) : undefined;
      const homeReached = schedule?.homeReached ?? (residentRoutine(motion.id, this.clock.gameplayHour()).action === 'rest');
      const routineElapsed = schedule?.sampleSeconds ?? (homeReached
        ? Math.ceil((this.decorativeElapsed + motion.phaseSeconds) / motion.cycleSeconds) * motion.cycleSeconds - motion.phaseSeconds
        : this.decorativeElapsed);
      const position = sampleResidentMotion(motion, routineElapsed);
      const character = this.createCharacter(motion.id, motion.name, position.x, position.y, motion.avatar, undefined, motion.artVariant ?? -1, motion.artVariant);
      this.animateCharacter(character, 0, 0, this.elapsed, Infinity, {
        moving: position.moving, distance: residentWalkDistance(motion, routineElapsed),
        velocityX: position.velocityX, velocityY: position.velocityY,
        facingLeft: residentFacingLeft(motion, routineElapsed),
      });
      character.name.setColor('#ddd6b5').setVisible(false);
      character.root.setVisible(!homeReached && !this.terrainOnly);
      this.residents.push({ character, motion, sample: position, routineElapsed, homeReached });
    }
    for(const {spec} of this.activityWorld.residents){
      const character=this.createCharacter(spec.id,spec.name,spec.home.x,spec.home.y,spec.avatar,undefined,spec.artVariant??-1,spec.artVariant);
      const key=spec.actionArt?residentActionKey(this.mapSpec.id,spec.actionArt):undefined;
      const actionFigure=key&&this.textures.exists(key)?this.add.image(0,0,key,'idle').setOrigin(.5,RESIDENT_ACTION_ART.footY).setScale(MODULAR_ART.worldHeight/RESIDENT_ACTION_ART.bodyHeight).setVisible(false):undefined;
      if(actionFigure)character.root.add(actionFigure);
      const prop=this.add.graphics();character.root.add(prop);character.name.setColor('#ddd6b5');
      this.activityResidents.push({character,prop,actionFigure});
    }
    this.updateActivityResidents();
  }

  private createMapCharacters(map: Pick<WorldMapSpec, 'npcs'>, interior?: InteriorSpec): void {
    for (const position of map.npcs) {
      const index = npcs.findIndex(npc => npc.id === position.id);
      const localNpc = getExpeditionNpc(position.id);
      const npc = localNpc ?? npcs[index];
      if (!npc) continue;
      const { x, y } = this.navigation.closestPoint(position.x * this.worldWidth, position.y * this.worldHeight);
      const special = npc.id === 'inspector' || npc.id === 'elise';
      const avatar = npc.id === 'inspector' ? { hair: '#68656a', skin: '#d6a07d', outfit: '#80612e', hairstyle: 'bald', pants: '#383438' } : npc.id === 'elise' ? { hair: '#c8c5bf', skin: '#bb825a', outfit: '#596d86' } : DEFAULT_AVATAR;
      const character = this.createCharacter(npc.id, npc.name, x, y, localNpc?.avatar ?? avatar, npc.role.split('·')[0].trim(), special ? -1 : localNpc ? localNpc.artVariant : index, localNpc?.artVariant);
      const interiorNpc = interior?.npcs.find(resident => resident.id === npc.id);
      if (interiorNpc) {
        character.interactionId = interiorNpc.interactionId;
        character.role?.setText(interiorNpc.role);
      }
      character.halo = this.add.ellipse(0, 2, 37, 17, 0xf5dda0, 0.08).setStrokeStyle(1, 0xf3d286, 0.6).setVisible(false);
      character.root.addAt(character.halo, 1);
      character.marker = this.add.text(0, -96, '✦', { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '17px', color: '#ffe3a3', stroke: '#68563c', strokeThickness: 2 }).setOrigin(.5).setVisible(false);
      character.hint = this.add.text(0, 30, this.mobileCamera ? 'SPRECHEN' : 'SPRECHEN · E', { resolution: this.density, fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#fff2cf', backgroundColor: '#263e36', padding: { x: 7, y: 4 } }).setOrigin(.5).setVisible(false);
      character.root.add([character.marker, character.hint]);
      const animation = character.walkingAnimation ?? character.idleAnimation;
      character.figure.setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(-40, 12, (animation?.width ?? NPC_ART.width) + 80, (animation?.height ?? NPC_ART.height) * (animation?.originY ?? NPC_ART.footY) - 12),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
      character.figure.on('pointerover', () => { character.hovered = true; });
      character.figure.on('pointerout', () => { character.hovered = false; });
      character.figure.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.approachInteraction(character.interactionId ?? npc.id);
      });
      this.characters.set(npc.id, character);
      character.root.setVisible(this.characterRevealed(character) && !this.terrainOnly);
    }
    this.resizeHitTargets();
  }

  private createMapObjects(map: Pick<WorldMapSpec, 'objects'>, prefix = 'object'): void {
    const lampHosts:WorldObjectSpec[]=prefix==='object'?getWorldScene(this.mapSpec.id).scenery.filter(prop=>prop.asset==='lamp').map(prop=>({id:`lantern-drill-${prop.id}`,label:'Die Laterne',kind:'lantern',x:prop.x/this.worldWidth,y:prop.y/this.worldHeight,exerciseIds:[],prompt:'Listen to the whisper in the lantern.',description:'The ink answers after dusk.',minigame:'lantern-lighting'})):[];
    for (const spec of [...map.objects,...lampHosts]) {
      const x = spec.x * this.worldWidth, y = spec.y * this.worldHeight;
      const halo = this.add.ellipse(0, 0, 36, 17, 0xeecf8a, .06).setStrokeStyle(1, 0xf5d896, .35);
      const marker = this.add.image(0, -8, 'discovery').setScale(.8).setAlpha(.7);
      const label = this.add.text(0, -35, spec.label, { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff0d0', stroke: '#283b36', strokeThickness: 4 }).setOrigin(.5).setVisible(false);
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
      root.setVisible(!this.terrainOnly && this.objectAvailable(object));
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
      this.createPortal(entrance.id, entrance.x * this.worldWidth, entrance.y * this.worldHeight, entrance.label);
    }
  }

  private createPortal(id: string, x: number, y: number, label: string, exit = false): void {
    const halo = this.add.ellipse(0, 1, 56, 22, 0xffd996, .1).setStrokeStyle(1.5, 0xf5d5a0, .75);
    const glyph = this.add.text(0, -12, exit ? '↙' : '↗', {
      resolution: this.density, fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#fff1cd', stroke: '#3a4236', strokeThickness: 3,
    }).setOrigin(.5);
    const name = this.add.text(0, exit ? 24 : -42, label, {
      resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '14px', color: '#fff1cf', stroke: '#283c35', strokeThickness: 4,
    }).setOrigin(.5);
    const hit = this.add.zone(0, -14, 76, 76).setInteractive({ useHandCursor: true });
    const root = this.add.container(x, y, [halo, glyph, name, hit]).setDepth(y + 8);
    const portal: WorldPortal = { id, x, y, root, halo, label: name, glyph, hovered: false };
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
      const animation = npc.walkingAnimation ?? npc.idleAnimation;
      const frameWidth = animation?.width ?? NPC_ART.width;
      const frameHeight = animation?.height ?? NPC_ART.height;
      const footY = animation?.originY ?? NPC_ART.footY;
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

  fitCamera(width: number, height: number, density = 1): void {
    this.density = density;
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.coverZoom = Math.max(width / this.worldWidth, height / this.worldHeight);
    this.fitZoom = explorationZoom(width, height, density, !!this.interiorSpec, this.interiorSpec?.characterHeight, {width:this.worldWidth,height:this.worldHeight}).zoom;
    const previousMobile = this.mobileCamera;
    this.mobileCamera = explorationZoom(width, height, density).mobile;
    if (previousMobile !== this.mobileCamera) {
      for (const npc of this.characters.values()) npc.hint?.setText(this.mobileCamera ? 'SPRECHEN' : 'SPRECHEN · E');
      if (this.mobileCamera) for (const map of maps) for (const period of ['day', 'night'] as const) {
        if (map.id !== this.mapSpec.id || period !== this.period) this.releaseAnimationAssets(map.id, period);
      }
    }
    this.cameras.main.setZoom(this.fitZoom);
    for (const actor of [this.local, ...this.characters.values(), ...this.peers.values(), ...this.residents.map(resident => resident.character),...this.activityResidents.map(resident=>resident.character)]) {
      for (const label of [actor?.name, actor?.role, actor?.hint, actor?.marker]) label?.setResolution(density);
    }
    for (const object of this.objects.values()) object.label.setResolution(density);
    for (const portal of this.portals.values()) { portal.label.setResolution(density); portal.glyph.setResolution(density); }
    this.bark?.setResolution(density);
    this.resizeHitTargets();
    this.frameCamera(1);
  }

  setInputEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    if (this.input.keyboard) this.input.keyboard.enabled = enabled;
    if (!enabled) this.clearControls();
    this.refreshNearby();
  }

  setWindowFocused(focused: boolean): void {
    this.windowFocused = focused;
    if (this.input.keyboard) this.input.keyboard.enabled = this.controlsEnabled;
    if (!focused) this.clearControls();
    this.refreshNearby();
  }

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
    this.input.keyboard?.resetKeys();
    this.cancelRoute();
    this.setNearby(undefined);
  }

  interactNearest(): boolean {
    if (!this.controlsEnabled || this.watching || document.hidden) return false;
    const nearest = this.findNearestInteraction();
    if (!nearest) return false;
    this.approachInteraction(nearest.id);
    return true;
  }

  queueKeyboardInteraction(): void {
    if (this.controlsEnabled) this.queuedKeyboardInteraction = true;
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
    this.owner.nearby(id);
  }

  private refreshNearby(): void {
    this.setNearby(this.controlsEnabled && !this.watching && !document.hidden ? this.findNearestInteraction()?.id : undefined);
  }

  changeAvatar(avatar: Avatar): void {
    if (!this.local || avatarKey(this.local.avatar) === avatarKey(avatar)) return;
    this.local.avatar = avatar;
    this.tintCharacter(this.local);
  }

  renderAvatarPreview(canvas: HTMLCanvasElement, avatar: Avatar, facing = 0, phase?: number): boolean {
    void paintCharacter(canvas, avatar, characterFrame(facing, phase)).catch(() => canvas.setAttribute('aria-label', 'Character artwork could not load'));
    return true;
  }

  syncPlayers(players: WorldPlayer[], selfId: string, preserveLocal = false): void {
    this.latestPlayers = { players, selfId };
    const present = new Set<string>();
    for (const player of players) {
      if ((player.mapId ?? 'lindenhafen') !== this.mapSpec.id) continue;
      if ((player.interiorId || undefined) !== this.interiorSpec?.id) continue;
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
      const rawX = clamp(player.x * this.worldWidth, 14, this.worldWidth - 14);
      const rawY = clamp(player.y * this.worldHeight, 14, this.worldHeight - 14);
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

  resetPlayerPosition(): void {
    this.initializedSelf = false;
    this.lastX = this.lastY = -1;
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
      if (station && !this.objectAvailable(station)) return undefined;
      const resident = [...this.characters.values()].find(character => character.interactionId === id && this.characterRevealed(character));
      if (!station) return resident;
      if (!resident) return station;
      return Math.hypot(resident.x - this.local.x, resident.y - this.local.y)
        < Math.hypot(station.x - this.local.x, station.y - this.local.y) ? resident : station;
    }
    const character = this.characters.get(id);
    return character && this.characterRevealed(character) ? character : undefined;
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
      if (!station || !this.interiorSpec || !this.objectAvailable(station)) return;
      const resident = [...this.characters.values()].find(character => character.interactionId === id && this.characterRevealed(character));
      if (resident) this.faceCharacters(this.local, resident);
      station.activatedUntil = this.elapsed + 4;
      this.owner.interiorInteract(station.spec.id);
    } else if (id.startsWith('object:')) {
      const object = this.objects.get(id.slice(7));
      if (!object) return;
      object.activatedUntil = this.elapsed + 4;
      if(object.spec.id.startsWith('lantern-drill-')&&object.spec.minigame){this.owner.playMiniGame(object.spec.minigame);return;}
      this.owner.investigate(object.spec.id);
    } else {
      const npc = this.characters.get(id);
      if (!npc || !this.characterRevealed(npc)) return;
      this.faceCharacters(this.local, npc);
      this.owner.interact(id);
    }
  }

  private approachInteraction(id: string): void {
    if (!this.controlsEnabled || this.watching || document.hidden) return;
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
    this.frames.add(delta);
    const roomRevision = this.roomRevision;
    const seconds = Math.min(delta, 50) / 1000;
    this.elapsed += seconds;
    if (!this.reducedMotion) this.decorativeElapsed += seconds;
    let vx = 0;
    let vy = 0;
    let arrivedInteraction: string | undefined;
    const previousX = this.local.x;
    const previousY = this.local.y;
    const keys = this.keys;
    const pad=gamepadInput(typeof navigator.getGamepads==='function'?Array.from(navigator.getGamepads()):[]);
    const padInteract=pad.interact&&!this.padPressed;
    this.padPressed=pad.interact;
    // Keyup can clear Phaser's JustDown before a slow frame sees a short tap.
    const keyInteract = keys ? Phaser.Input.Keyboard.JustDown(keys.interact) : false;
    const pressedInteract = this.queuedKeyboardInteraction || keyInteract || padInteract;
    this.queuedKeyboardInteraction = false;
    if (this.controlsEnabled && keys && !isTyping()) {
      vx = Number(keys.right.isDown || keys.arrowRight.isDown) - Number(keys.left.isDown || keys.arrowLeft.isDown);
      vy = Number(keys.down.isDown || keys.arrowDown.isDown) - Number(keys.up.isDown || keys.arrowUp.isDown);
      if (vx || vy) {
        const length = Math.hypot(vx, vy);
        vx /= length;
        vy /= length;
        this.cancelRoute();
      }
    }
    if(this.controlsEnabled&&!isTyping()){
      if(!vx&&!vy&&(pad.x||pad.y)){vx=pad.x;vy=pad.y;this.cancelRoute();}
      if(pressedInteract)this.interactNearest();
    }
    if (roomRevision !== this.roomRevision) return;
    if (this.controlsEnabled && !vx && !vy && (this.joystick.x || this.joystick.y)) {
      const smooth = 1 - Math.exp(-18 * seconds);
      this.smoothJoystick.x += (this.joystick.x - this.smoothJoystick.x) * smooth;
      this.smoothJoystick.y += (this.joystick.y - this.smoothJoystick.y) * smooth;
      vx = this.smoothJoystick.x;
      vy = this.smoothJoystick.y;
      this.cancelRoute();
    }
    if (!this.controlsEnabled || this.watching) { vx = 0; vy = 0; }
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
          arrivedInteraction = this.pendingInteraction;
          this.pendingInteraction = undefined;
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
    this.audio?.footsteps(Math.hypot(localDx, localDy), !!this.interiorSpec);
    this.audio?.update(seconds);
    // The final walk frame must be painted before the conversation turns both
    // people toward each other; otherwise that step overwrites their facing.
    if (arrivedInteraction) {
      const target = this.interactionPosition(arrivedInteraction);
      if (target && Math.hypot(target.x - this.local.x, target.y - this.local.y) <= INTERACTION_DISTANCE) this.triggerInteraction(arrivedInteraction);
    }
    if (roomRevision !== this.roomRevision) return;

    if (this.elapsed - this.lastSent > 1 / 15) {
      const x = this.local.x / this.worldWidth;
      const y = this.local.y / this.worldHeight;
      if (Math.hypot((x - this.lastX) * this.worldWidth, (y - this.lastY) * this.worldHeight) > 0.4) {
        this.lastSent = this.elapsed;
        this.lastX = x;
        this.lastY = y;
        this.owner.move(x, y);
      }
    }
    const characterView = this.cameras.main.worldView;
    const labelScale = this.density / (this.cameras.main.zoom || 1);
    this.local.name.setScale(labelScale).setVisible(this.controlsEnabled && !this.conversationTarget && !this.cinematicTarget);
    for (const npc of this.characters.values()) {
      let npcDx=0,npcDy=0;
      if(!this.interiorSpec&&npc.id!==this.conversationTarget){
        const anchor=this.mapSpec.npcs.find(position=>position.id===npc.id);
        if(anchor){
          const routine=npcRoutine(npc.id,this.clock.gameplayHour(),this.objective);
          const desiredX=anchor.x*this.worldWidth+routine.offsetX*1536,desiredY=anchor.y*this.worldHeight+routine.offsetY*1024;
          if(this.navigation.canWalkSegment(npc.x,npc.y,desiredX,desiredY)){
            const step=Math.min(1,36*seconds/Math.max(.00001,Math.hypot(desiredX-npc.x,desiredY-npc.y)));
            npcDx=(desiredX-npc.x)*step;npcDy=(desiredY-npc.y)*step;npc.x+=npcDx;npc.y+=npcDy;
          }
        }
      }
      const visible = npc.x >= characterView.x - 100 && npc.x <= characterView.right + 100
        && npc.y >= characterView.y - 110 && npc.y <= characterView.bottom + 100;
      const revealed = this.characterRevealed(npc);
      npc.root.setVisible(visible && revealed && !this.terrainOnly);
      if (!visible || !revealed) continue;
      this.animateCharacter(npc, npcDx, npcDy, this.elapsed + npc.phase);
      const near = this.controlsEnabled && Math.hypot(npc.x - this.local.x, npc.y - this.local.y) < INTERACTION_DISTANCE;
      const show = this.controlsEnabled && (near || !!npc.hovered);
      npc.halo?.setVisible(show).setAlpha(near ? 1 : .65);
      npc.name.setScale(labelScale).setVisible(show);
      npc.role?.setScale(labelScale).setVisible(show && !this.mobileCamera);
      npc.hint?.setScale(labelScale);
      npc.hint?.setVisible(show);
      if(visible&&revealed&&!this.interiorSpec&&Math.hypot(npc.x-this.local.x,npc.y-this.local.y)<230)this.maybeBark(npc);
      if (npc.marker) {
        npc.marker.setVisible(!this.watching && !this.interiorSpec && this.objective === npc.id && !show);
        npc.marker.y = -96 + (this.reducedMotion ? 0 : Math.sin(this.elapsed * 2 + npc.phase) * 1.5);
      }
    }
    if(this.bark&&this.barkSpeaker){
      const halfWidth=this.bark.width*this.density/(2*this.cameras.main.zoom);
      const barkX=clamp(this.barkSpeaker.x,characterView.x+halfWidth+4,characterView.right-halfWidth-4);
      this.bark.setVisible(!this.conversationTarget&&!this.cinematicTarget&&!this.interiorSpec&&this.elapsed<this.barkUntil&&!this.terrainOnly)
        .setPosition(barkX,this.barkSpeaker.y-92).setDepth(3000).setScale(labelScale);
    }
    const interpolation = 1 - Math.exp(-12 * seconds);
    for (const peer of this.peers.values()) {
      const dx = peer.targetX - peer.x;
      const dy = peer.targetY - peer.y;
      peer.x += dx * interpolation;
      peer.y += dy * interpolation;
      this.animateCharacter(peer, dx * interpolation, dy * interpolation, this.elapsed + peer.phase, WALK_SPEED * seconds);
      peer.name.setScale(labelScale).setVisible(this.controlsEnabled && (Math.hypot(peer.x - this.local.x, peer.y - this.local.y) < 180 || !!peer.hovered));
    }
    this.updateWorldTime(seconds);
    if (!this.interiorSpec) this.updateResidents(seconds);
    this.updateObjects(this.elapsed);
    this.updatePortals();
    if (this.interior) this.interior.update(this.decorativeElapsed, this.cameras.main.worldView);
    else this.scenery?.update(this.decorativeElapsed, this.cameras.main.worldView);
    if (this.watching && !this.reducedMotion) this.tourTime += seconds;
    this.atmosphere?.update(this.decorativeElapsed, this.clock.advance(0).hour, this.cameras.main.worldView, this.reducedMotion,
      this.storyState.flags?.storm_active ?? (this.storyState.completedQuestIds.includes('b1-council') && !this.storyState.completedQuestIds.includes('b1-storm')),this.rainIntensity());
    this.refreshNearby();
    if (this.marker.visible) this.marker.setScale(this.reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 4) * 0.04);
    const lead = 1 - Math.exp(-5 * seconds);
    this.cameraLead.x += ((moving ? vx * 80 : 0) - this.cameraLead.x) * lead;
    this.cameraLead.y += ((moving ? vy * 48 : 0) - this.cameraLead.y) * lead;
    this.frameCamera(1 - Math.exp(-5 * seconds));
    if (this.background instanceof StreamedWorldTerrain) this.background.update(this.cameras.main.worldView,this.cameras.main.zoom);
    if (this.previousBackground instanceof StreamedWorldTerrain) this.previousBackground.update(this.cameras.main.worldView,this.cameras.main.zoom);
    this.pendingTerrain?.update(this.cameras.main.worldView,this.cameras.main.zoom);
  }

  private frameCamera(follow: number): void {
    const camera = this.cameras.main;
    if (this.cinematicTarget) {
      const beat = this.cinematicTarget, zoom = Math.max(this.coverZoom, beat.zoom * this.density);
      camera.setZoom(camera.zoom + (zoom - camera.zoom) * follow);
      const targetX = cameraScroll(clamp(beat.x - camera.width / camera.zoom / 2, 0, Math.max(0, this.worldWidth - camera.width / camera.zoom)), camera.width, camera.zoom);
      const targetY = cameraScroll(clamp(beat.y - camera.height / camera.zoom / 2, 0, Math.max(0, this.worldHeight - camera.height / camera.zoom)), camera.height, camera.zoom);
      camera.scrollX += (targetX - camera.scrollX) * follow; camera.scrollY += (targetY - camera.scrollY) * follow;
      return;
    }
    if (this.watching) {
      // A slow, continuous tour. Motion stays on the artwork when the camera rests.
      const zoom = this.coverZoom * (1.12 + Math.sin(this.tourTime * .045) * .04);
      camera.setZoom(zoom);
      const centerX = 768 + Math.sin(this.tourTime * .036) * 440;
      const centerY = 540 + Math.sin(this.tourTime * .027) * 155;
      const targetX = cameraScroll(clamp(centerX - camera.width / zoom / 2, 0, Math.max(0, this.worldWidth - camera.width / zoom)), camera.width, zoom);
      const targetY = cameraScroll(clamp(centerY - camera.height / zoom / 2, 0, Math.max(0, this.worldHeight - camera.height / zoom)), camera.height, zoom);
      camera.scrollX += (targetX - camera.scrollX) * follow;
      camera.scrollY += (targetY - camera.scrollY) * follow;
      return;
    }
    const npc = this.conversationTarget ? this.characters.get(this.conversationTarget) : undefined;
    const targetZoom = conversationZoom(this.fitZoom, !!npc);
    camera.setZoom(camera.zoom + (targetZoom - camera.zoom) * follow);
    const viewWidth = camera.width / camera.zoom;
    const viewHeight = camera.height / camera.zoom;
    const observed=this.interiorSpec?undefined:this.activityResidents.find(resident=>resident.character.id===this.observedResidentId)?.character;
    const focusX = observed?.x??(npc ? (this.local.x + npc.x) / 2 : this.local.x + this.cameraLead.x);
    const focusY = observed?.y??(npc ? (this.local.y + npc.y) / 2 : this.local.y + this.cameraLead.y);
    const centerX = camera.scrollX + camera.width / 2, centerY = camera.scrollY + camera.height / 2 + viewHeight * .04;
    const deadX = npc || follow === 1 ? 0 : viewWidth * .07, deadY = npc || follow === 1 ? 0 : viewHeight * .055;
    const framedX = Math.abs(focusX - centerX) <= deadX ? centerX : focusX - Math.sign(focusX - centerX) * deadX;
    const framedY = Math.abs(focusY - centerY) <= deadY ? centerY : focusY - Math.sign(focusY - centerY) * deadY;
    const targetScrollX = cameraScroll(clamp(framedX - viewWidth / 2, 0, Math.max(0, this.worldWidth - viewWidth)), camera.width, camera.zoom);
    const targetScrollY = cameraScroll(clamp(framedY - viewHeight * (npc ? .38 : this.mobileCamera ? .56 : .54), 0, Math.max(0, this.worldHeight - viewHeight)), camera.height, camera.zoom);
    camera.scrollX += (targetScrollX - camera.scrollX) * follow;
    camera.scrollY += (targetScrollY - camera.scrollY) * follow;
  }

  private animateCharacter(character: Character, dx: number, dy: number, time: number, maxGaitDistance = Infinity, residentGait?: { moving: boolean; distance: number; velocityX: number; velocityY: number; facingLeft?: boolean }): void {
    this.fitCharacterToRoom(character);
    character.root.setPosition(character.x, character.y).setDepth(character.y + 10);
    const distance = Math.hypot(dx, dy);
    if (!character.npc && this.playerArtReady) {
      if (distance > 0.05) {
        // Keep the facing stable around diagonal direction boundaries.
        const horizontal = Math.abs(dx) > Math.abs(dy) * (character.facing % 2 ? 0.88 : 1.12);
        character.facing = horizontal ? (dx >= 0 ? 1 : 3) : (dy >= 0 ? 0 : 2);
        const cycleDistance = MODULAR_ART.cycleDistance * character.artScale * buildWidth(normalizeParts(character.avatar).build);
        character.walkDistance = advanceWalkDistance(character.walkDistance, distance, cycleDistance, maxGaitDistance);
        character.lastWalkTime = time;
        const frame = characterFrame(character.facing, character.walkDistance / cycleDistance * WALK_POSE_COLUMNS.length);
        this.setCharacterFrame(character, frame);
      } else if (!this.controlsEnabled || this.watching || time - (character.lastWalkTime ?? -Infinity) >= .1) {
        // A single-frame click still needs a visible step. Idle pauses retain
        // distance so repeated short clicks advance through the painted gait.
        this.setCharacterFrame(character, characterFrame(character.facing));
      }
    }
    if (character.castRow !== undefined) {
      if (Math.hypot(character.x - this.local.x, character.y - this.local.y) < 170 || this.conversationTarget === character.id) {
        // Passers-by can draw a glance without changing the player's gait.
        const dx = this.local.x - character.x, dy = this.local.y - character.y;
        character.facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 0 : 2;
      }
      character.figure.setFrame(character.castRow * 4 + character.facing);
      character.figure.setScale(character.artScale,character.artScale*(this.reducedMotion?1:1+Math.sin(time*1.7+character.phase)*.0015));
      return;
    }
    if (character.walkingAnimation) {
      // Still-world mode holds the currently planted pose and facing. Regional
      // paintings are walking poses; stationary neighbors keep one painting.
      if (this.reducedMotion) return;
      const moving = residentGait?.moving ?? distance > .05;
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
      const frame = this.interiorSpec ? character.idleAnimation.frames[0]
        : sampleSceneryFrame(character.idleAnimation, character.id, this.decorativeElapsed);
      if (frame !== character.idleFrame) { character.figure.setFrame(frame); character.idleFrame = frame; }
      return;
    }
    // The ground pivot never moves. Breathing is deliberately smaller than a
    // pixel, with no spinning, bobbing, detached feet or stretched strides.
    const breathe = distance > 0.05 || this.reducedMotion ? 1 : 1 + Math.sin(time * 1.7 + character.phase) * 0.002;
    const recipe = character.npc ? undefined : characterLayers(character.avatar, character.frame);
    character.layers.forEach((layer, index) => layer.setScale(character.artScale * (recipe?.[index]?.width ?? 1), character.artScale * breathe));
  }

  private maybeBark(character:Character):void{
    const bark=this.barkDirector.next({speakerId:character.id,mapId:this.mapSpec.id,level:this.mapSpec.level,hour:this.clock.gameplayHour(),elapsedSeconds:this.elapsed,requiredNpcId:this.objective,conversationActive:!!this.conversationTarget||!!this.cinematicTarget||this.watching||!this.controlsEnabled,lexicon:this.lexicon,progress:this.learningProgress,introduced:this.introducedWords,lineAllowed:this.barkLineAllowed});
    if(!bark)return;
    this.bark??=this.add.text(0,0,'',{resolution:this.density,fontFamily:'Georgia, serif',fontSize:'14px',color:'#fff3d5',backgroundColor:'#20352d',padding:{x:9,y:6},wordWrap:{width:270},align:'center'}).setOrigin(.5,1);
    this.bark.setText(bark.german);this.barkSpeaker=character;this.barkUntil=this.elapsed+5;
    this.owner.barkShown(bark);
  }

  private updateResidents(seconds?:number): void {
    const view = this.cameras.main.worldView;
    const sharedTime = this.clock.simulationTime();
    for (const resident of this.residents) {
      const {character,motion,sample}=resident;
      resident.routineElapsed??=this.decorativeElapsed;
      const schedule = sharedTime ? sampleResidentSchedule(motion, sharedTime) : undefined;
      const routine = residentRoutine(character.id, this.clock.gameplayHour());
      if (!schedule && routine.action !== 'rest') resident.homeReached = false;
      if (!schedule && seconds !== undefined && !this.reducedMotion) {
        if (routine.action === 'rest' && !resident.homeReached) {
          const phase = (resident.routineElapsed + motion.phaseSeconds) % motion.cycleSeconds;
          const remaining = phase < .00001 ? 0 : motion.cycleSeconds - phase;
          const step = Math.min(seconds * routine.pace, remaining);
          resident.routineElapsed += step;
          if (step >= remaining) resident.homeReached = true;
        } else if (routine.action !== 'rest') resident.routineElapsed += seconds * routine.pace;
      }
      if (schedule) { resident.routineElapsed = schedule.sampleSeconds; resident.homeReached = schedule.homeReached; }
      const sampleTime=schedule?.sampleSeconds ?? (seconds===undefined?this.decorativeElapsed:resident.routineElapsed);
      const position = sampleResidentMotion(motion, sampleTime, sample);
      const dx = position.x - character.x;
      const dy = position.y - character.y;
      character.x = position.x;
      character.y = position.y;
      const visible = character.x >= view.x - 90 && character.x <= view.right + 90
        && character.y >= view.y - 100 && character.y <= view.bottom + 100;
      character.root.setVisible(visible && !resident.homeReached && !this.terrainOnly);
      // Sampling the exact route gait also advances culled residents, so they
      // return with the same pose and facing as continuously visible people.
      this.animateCharacter(character, this.reducedMotion ? 0 : dx, this.reducedMotion ? 0 : dy, this.elapsed, Infinity, {
        moving: position.moving && !resident.homeReached, distance: residentWalkDistance(motion, sampleTime),
        velocityX: position.velocityX, velocityY: position.velocityY,
        facingLeft: residentFacingLeft(motion, sampleTime),
      });
      // Passing locals have no quest markers or player labels to crowd the map.
      character.name.setScale(this.density / (this.cameras.main.zoom || 1)).setVisible(!resident.homeReached && !position.moving && this.controlsEnabled
        && Math.hypot(character.x - this.local.x, character.y - this.local.y) < 100);
    }
    this.updateActivityResidents();
  }

  setWeatherPreview(mode:WorldWeatherMode):void{this.weatherPreview=mode;this.updateActivityResidents();}
  private weatherMode():WorldWeatherMode{return this.clock.simulationTime()?'regional':this.weatherPreview;}
  rainIntensity():number{return worldRain(this.mapSpec.id,this.activityTime(),this.weatherMode());}
  private activityTime():WorldSimulationTime {
    return this.clock.simulationTime()??{seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:worldDaySeconds,
      elapsedSeconds:((this.clock.gameplayHour()-worldStartHour+24)%24)*worldDaySeconds/24};
  }
  private updateActivityResidents():void {
    if(!this.activityWorld||this.interiorSpec)return;
    const samples=this.activityWorld.sample(this.activityTime(),this.weatherMode()),view=this.cameras.main.worldView;
    for(const resident of this.activityResidents){
      const sample=samples.find(sample=>sample.residentId===resident.character.id)!;resident.sample=sample;
      const character=resident.character,dx=sample.x-character.x,dy=sample.y-character.y;
      character.x=sample.x;character.y=sample.y;
      if(sample.facingLeft!==undefined&&!sample.moving)character.facing=sample.facingLeft?3:1;
      this.animateCharacter(character,this.reducedMotion?0:dx,this.reducedMotion?0:dy,this.elapsed,Infinity,
        {moving:sample.moving,distance:sample.walkDistance,velocityX:sample.velocityX,velocityY:sample.velocityY,facingLeft:sample.facingLeft});
      const pose=resident.actionFigure?residentActionPose(sample,this.reducedMotion):undefined;
      for(const layer of character.layers)layer.setVisible(!pose);
      resident.actionFigure?.setVisible(!!pose);
      const seatedOffset=pose?residentSeatedOffset(sample,this.reducedMotion):0;
      if(pose)resident.actionFigure!.setFrame(pose.frame).setPosition(0,seatedOffset).setFlipX(sample.facingLeft??character.facing===3).setTint(timeAmbient(this.mapSpec.id,this.clock.gameplayHour(),this.period).people);
      character.shadow.setPosition(0,2+seatedOffset);
      character.name.setY((pose&&sample.seatedOffsetY!==undefined?-62:-79)+seatedOffset);
      const visible=!this.terrainOnly&&sample.phase!=='home'&&sample.x>=view.x-90&&sample.x<=view.right+90&&sample.y>=view.y-100&&sample.y<=view.bottom+100;
      character.root.setVisible(visible);
      character.name.setScale(this.density/(this.cameras.main.zoom||1)).setVisible(!sample.exchange&&sample.phase==='act'&&(character.id===this.observedResidentId||this.controlsEnabled&&Math.hypot(character.x-this.local.x,character.y-this.local.y)<100));
      if(resident.propKind!==sample.heldObject){
        resident.propKind=sample.heldObject;const prop=resident.prop;prop.clear();
        if(sample.heldObject==='parcel')prop.fillStyle(0x745031).fillRect(-9,-39,18,14).fillStyle(0xcda36e).fillRect(-8,-38,16,11).fillStyle(0xf0d5a0).fillRect(-1,-38,3,11);
        else if(sample.heldObject==='book')prop.fillStyle(0x324c51).fillRect(-10,-37,20,12).fillStyle(0xf0e2bd).fillRect(-8,-36,7,9).fillRect(1,-36,7,9);
        else if(sample.heldObject==='tool')prop.fillStyle(0x916b41).fillRect(-2,-41,4,18).fillStyle(0xaab6b0).fillRect(-7,-43,14,5);
      }
      resident.prop.setVisible(!!sample.heldObject&&pose?.bakedObject!==sample.heldObject);
      const exchange=sample.exchange;
      const speaking=visible&&exchange?.speaking&&!this.conversationTarget&&!this.cinematicTarget&&!this.watching
        &&(this.controlsEnabled&&Math.hypot(character.x-this.local.x,character.y-this.local.y)<230||character.id===this.observedResidentId||exchange.partnerId===this.observedResidentId)
        &&(!this.barkLineAllowed||this.barkLineAllowed(exchange.german));
      if(speaking){
        if(!resident.speech){resident.speech=this.add.text(0,-106,'',{resolution:this.density,fontFamily:'Georgia, serif',fontSize:'14px',color:'#fff3d5',backgroundColor:'#20352d',padding:{x:9,y:6},wordWrap:{width:190},align:'center'}).setOrigin(.5,1);character.root.add(resident.speech);}
        resident.speech.setText(exchange.german).setScale(this.density/(this.cameras.main.zoom||1));
        character.name.setVisible(false);
      }
      resident.speech?.setVisible(!!speaking);
    }
  }

  private setCharacterFrame(character: Character, frame: number): void {
    if (character.frame === frame) return;
    character.frame = frame;
    for (const layer of character.layers) layer.setFrame(frame);
  }

  private fitCharacterToRoom(character: Character): void {
    const art = character.npc || !this.playerArtReady ? NPC_ART : MODULAR_ART;
    const animation = character.walkingAnimation ?? character.idleAnimation;
    const canvasHeight = animation?.height ?? art.height;
    const bodyHeight = animation ? canvasHeight - 6 : art.bodyHeight;
    const indoors = !!this.interiorSpec;
    const indoorHeight = this.interiorSpec?.characterHeight ?? INTERIOR_CHARACTER_HEIGHT;
    const scale = !character.npc && this.playerArtReady && !indoors ? MODULAR_ART.worldHeight / bodyHeight : characterArtScale(bodyHeight, canvasHeight, indoors, indoorHeight);
    if (character.artScale === scale) return;
    character.artScale = scale;
    const recipe = character.npc ? undefined : characterLayers(character.avatar, character.frame);
    character.layers.forEach((layer, index) => layer.setScale(scale * (recipe?.[index]?.width ?? 1), scale));
    const groundScale = indoorHeight / INTERIOR_CHARACTER_HEIGHT;
    character.shadow.setDisplaySize(indoors ? 43 * groundScale : 31, indoors ? 17 * groundScale : 12);
    character.name.setY(indoors ? -indoorHeight - 12 : -79);
  }

  private tintCharacter(character: Character): void {
    if (character.npc || !this.playerArtReady) return;
    const recipe = characterLayers(character.avatar, character.frame);
    if (character.layers.length !== recipe.length) {
      for (const image of character.layers) image.destroy();
      character.layers = recipe.map(layer => this.add.image(0, 0, layer.key, layer.frame).setOrigin(0.5, MODULAR_ART.footY));
      character.figure = character.layers[0];
      character.root.addAt(character.layers, 1);
    }
    recipe.forEach((layer, index) => {
      character.layers[index].setTexture(layer.key, layer.frame).setTint(layer.tint).setScale(character.artScale * layer.width, character.artScale);
    });
  }

  private setCharacterAmbient(character: Character): void {
    if (character.localArtVariant !== undefined) character.figure.setTint(timeAmbient(this.mapSpec.id, this.clock.advance(0).hour, this.period).people);
  }

  private createCharacter(id: string, name: string, x: number, y: number, avatar: Avatar, role?: string, npcFrame = -1, localArtVariant?: number): Character {
    const mainCast=['marta','otto','lina','emil','ada','fritz','greta'].indexOf(id);
    const mainCastRow=mainCast>=0&&this.textures.exists('main-cast')?mainCast:undefined;
    const castRow = mainCastRow??(this.textures.exists('story-cast') ? id === 'inspector' ? 0 : id === 'elise' ? 1 : undefined : undefined);
    const npc = castRow !== undefined || npcFrame >= 0;
    const shadow = this.add.image(0, 2, 'character-shadow').setDisplaySize(31, 12);
    // A neutral placeholder handles a failed regional page download; its global
    // identity is never interpreted as an index into the original story sheet.
    const frame = castRow !== undefined ? castRow * 4 : npc ? (localArtVariant === undefined ? npcFrame : 7) : 0;
    const art = npc || !this.playerArtReady ? NPC_ART : MODULAR_ART;
    const keys = castRow !== undefined ? [mainCastRow===undefined?'story-cast':'main-cast'] : !npc && this.playerArtReady ? characterLayers(avatar, frame).map(layer => layer.key) : [NPC_ART.key];
    const idleManifest = this.cache.json.get('residents-animations') as SceneryAnimationManifest | undefined;
    const localKey = localArtVariant === undefined ? undefined : regionPeopleKey(this.mapSpec.id, localArtVariant);
    const localFrames = localArtVariant === undefined ? undefined : regionPeopleFrames(localArtVariant);
    const hasLocalArt = localKey !== undefined && this.textures.exists(localKey) && localFrames!.every(frame => this.textures.get(localKey).has(frame));
    const localFrameSize = hasLocalArt ? this.textures.get(localKey!).get(localFrames![0]) : undefined;
    const walkingAnimation: SceneryAnimation | undefined = hasLocalArt ? {
      key: localKey!, frames: localFrames!, fps: 3,
      width: localFrameSize!.width, height: localFrameSize!.height, referenceWidth: localFrameSize!.width,
      originX: localFrameSize!.customPivot ? localFrameSize!.pivotX : .5,
      originY: localFrameSize!.customPivot ? localFrameSize!.pivotY : 1,
    } : undefined;
    const authoredIdle = npc && castRow===undefined && !walkingAnimation ? idleManifest?.assets[id] : undefined;
    const idleAnimation = authoredIdle && this.textures.exists(authoredIdle.key) ? authoredIdle : undefined;
    const animation = walkingAnimation ?? idleAnimation;
    const idleFrame = walkingAnimation?.frames[0] ?? (idleAnimation ? sampleSceneryFrame(idleAnimation, id, this.decorativeElapsed) : undefined);
    const artScale = !npc && this.playerArtReady ? MODULAR_ART.worldHeight / MODULAR_ART.bodyHeight : 82 / (animation?.height ?? art.height);
    const layers = animation ? [this.add.image(0, 0, animation.key, idleFrame).setOrigin(animation.originX, animation.originY).setScale(artScale)] : keys.map(key => this.add.image(0, 0, key, npc ? frame : this.playerArtReady ? frame : 7).setOrigin(0.5, art.footY).setScale(artScale));
    const figure = layers[0];
    const nameText = this.add.text(0, -79, name, { resolution: this.density, fontFamily: 'Georgia, serif', fontSize: '13px', color: '#fff6e2', stroke: '#25362d', strokeThickness: 3 }).setOrigin(0.5).setVisible(!npc);
    const root = this.add.container(x, y, [shadow, ...layers, nameText]).setDepth(y + 10);
    let roleText: Phaser.GameObjects.Text | undefined;
    if (role) {
      roleText = this.add.text(0, 13, role, { resolution: this.density, fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#f4e6c2', stroke: '#263a31', strokeThickness: 2 }).setOrigin(0.5).setVisible(false);
      root.add(roleText);
    }
    const character: Character = { id, root, figure, layers, shadow, name: nameText, role: roleText, x, y, targetX: x, targetY: y, phase: Math.random() * 6.28, facing: 0, walkDistance: 0, frame, npc, artScale, avatar, idleAnimation, walkingAnimation, idleFrame, localArtVariant, castRow };
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
      const near = this.controlsEnabled
        && Math.hypot(portal.x - this.local.x, portal.y - this.local.y) < INTERACTION_DISTANCE;
      portal.halo.setAlpha(near || portal.hovered ? .95 : .45);
      portal.label.setVisible((near || portal.hovered) && !this.conversationTarget);
      portal.label.setScale(Math.min(2, window.devicePixelRatio || 1) / this.cameras.main.zoom);
    }
  }

  private updateObjects(time: number): void {
    const view = this.cameras.main.worldView;
    const nearestId = this.interiorSpec ? this.findNearestInteraction()?.id : undefined;
    for (const object of this.objects.values()) {
      const visible = object.x >= view.x - 100 && object.x <= view.right + 100 && object.y >= view.y - 100 && object.y <= view.bottom + 100;
      const available = this.objectAvailable(object);
      object.root.setVisible(visible && available && !this.terrainOnly && !this.watching);
      if (!visible || !available) continue;
      const near = this.controlsEnabled && Math.hypot(object.x - this.local.x, object.y - this.local.y) < INTERACTION_DISTANCE;
      const highlighted = this.controlsEnabled && (near || object.hovered);
      const objective = this.objective === object.spec.id || this.objective === `object:${object.spec.id}`;
      const active = Math.max(objective ? .6 : 0, Math.max(0, object.activatedUntil - time) / 4);
      const phase = (this.reducedMotion ? 0 : time * 2) + object.x / 170;
      object.label.setVisible(highlighted && (!this.interiorSpec || object.hovered || nearestId === object.interactionId));
      object.label.setScale(Math.min(2, window.devicePixelRatio || 1) / this.cameras.main.zoom);
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
