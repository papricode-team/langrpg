import {duplicatePrefabInstances,sceneInstanceIds} from './level-editor-prefabs';
import {nextSceneryId,removeScenery,scenerySelection,sceneryTranslation} from './level-editor-model';
import {sceneryFootprints,sceneryAssets} from './placed-scenery';
import {polygonsIntersect} from './level-editor-generation';
import {sceneActivityPlaces,sceneEntrancePoint,getSceneryGeometryMap,scaleCanon,PERSON_HEIGHT,type ScenePoint,type ScenePrefab,type SceneScenery,type WorldScene} from './scene-schema';
import type {EditorViewState,SelectionBounds} from './level-editor-selection';

export interface SceneryClipboard {
  sourceMap:string;
  anchor:ScenePoint;
  scenery:SceneScenery[];
  activities:NonNullable<WorldScene['activities']>;
  prefabInstances:NonNullable<WorldScene['prefabInstances']>;
}
export type ObjectTemplate=Pick<SceneScenery,'asset'|'frame'|'variant'|'width'|'motion'>;
export interface PaletteFrame {frame:string;variant:boolean;referenceWidth?:number;height?:number;doorHeight?:number;}
/** Choose a physical height the native painting can support without upscaling. */
export function canonSceneryWidth(asset:SceneScenery['asset'],referenceWidth:number,height:number,doorHeight?:number):number|undefined {
  const range=scaleCanon[asset];
  if(!range||referenceWidth<=0||height<=0||!Number.isFinite(referenceWidth)||!Number.isFinite(height))return;
  const minimum=Math.max(range[0]*PERSON_HEIGHT,doorHeight&&doorHeight>0?(1.1*PERSON_HEIGHT+.1)*height/doorHeight:0);
  if(minimum>range[1]*PERSON_HEIGHT||height/minimum<2.5)return;
  const desired=Math.max(minimum,Math.min((range[0]+range[1])/2*PERSON_HEIGHT,height/2.5));
  return Math.round(desired*referenceWidth/height*100)/100;
}
const clone=<T>(value:T):T=>structuredClone(value);
/** Registered art remains available even when no current instance uses it. */
export function paletteTemplates(scene:WorldScene,frames:readonly PaletteFrame[]):ObjectTemplate[]{
  const widths:Record<SceneScenery['asset'],number>={archive:240,cafe:220,station:270,workshop:220,house:160,tree:90,cypress:70,lamp:34,stall:100,fountain:98,arch:110,greenhouse:160,boat:90,bench:68,planter:40,sign:32};
  return frames.flatMap(({frame,variant,referenceWidth,height,doorHeight})=>{
    const name=frame.startsWith('garden-')?'planter':frame.split('-')[0];
    if(!sceneryAssets.includes(name as SceneScenery['asset']))return [];
    const asset=name as SceneScenery['asset'];
    const existing=scene.scenery.find(item=>(item.frame??item.asset)===frame&&!!item.variant===variant);
    const canon=referenceWidth!==undefined&&height!==undefined?canonSceneryWidth(asset,referenceWidth,height,doorHeight):undefined;
    if(referenceWidth!==undefined&&height!==undefined&&canon===undefined)return [];
    const motion:SceneScenery['motion']=existing?.motion??(asset==='tree'||asset==='cypress'?'tree':asset==='lamp'?'lamp':asset==='boat'?'boat':asset==='fountain'?'water':asset==='stall'?'cloth':['archive','cafe','station','workshop','house','greenhouse'].includes(asset)?'building':'still');
    return [{asset,frame,variant,width:existing?.width??canon??widths[asset],motion}];
  });
}
export function copyScenery(scene:WorldScene,selected:ReadonlySet<string>):SceneryClipboard {
  const scenery=scene.scenery.filter(item=>selected.has(item.id));
  if(!scenery.length||scenery.length>300)throw Error('Select 1–300 objects to copy.');
  // Only complete copies carry prefab history; partial selections are independent.
  const prefabInstances=(scene.prefabInstances??[]).filter(instance=>{
    const live=instance.members.filter(member=>scene.scenery.some(item=>item.id===member.id));
    return live.length>0&&live.every(member=>selected.has(member.id));
  });
  return clone({sourceMap:scene.id,anchor:{x:scenery[0].x,y:scenery[0].y},scenery,
    activities:(scene.activities??[]).filter(slot=>selected.has(slot.ownerId)),prefabInstances});
}
export function checkClipboard(clipboard:SceneryClipboard,palette:readonly ObjectTemplate[],prefabs:readonly ScenePrefab[]):void {
  const missing=clipboard.scenery.filter(item=>!palette.some(entry=>entry.asset===item.asset&&(entry.frame??entry.asset)===(item.frame??item.asset)&&!!entry.variant===!!item.variant));
  if(missing.length)throw Error(`This map has no matching artwork for: ${[...new Set(missing.map(item=>item.frame??item.asset))].join(', ')}.`);
  if(clipboard.prefabInstances.some(copy=>!prefabs.some(prefab=>prefab.id===copy.prefabId&&prefab.revision>=copy.revision)))throw Error('The copied group is no longer in this library. Copy the current objects again.');
}
export function pasteScenery(scene:WorldScene,clipboard:SceneryClipboard,point:ScenePoint,snap=0):{scene:WorldScene;ids:string[]} {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('Choose a position inside the map.');
  const before={...scene,scenery:clipboard.scenery,activities:clipboard.activities,prefabInstances:clipboard.prefabInstances};
  for(const axis of ['x','y'] as const){
    const extent=axis==='x'?scene.width:scene.height;
    const low=Math.max(...clipboard.scenery.map(item=>-item.width-item[axis]));
    const high=Math.min(...clipboard.scenery.map(item=>extent+item.width-item[axis]));
    if(low>high)throw Error('The copied objects are too far apart to fit this map.');
  }
  const moved=sceneryTranslation(before,new Map(clipboard.scenery.map(item=>[item.id,{x:item.x,y:item.y}])),point.x-clipboard.anchor.x,point.y-clipboard.anchor.y,snap);
  let next=clone(scene);
  const owners=new Map<string,string>(),activities=new Map<string,string>(),groups=new Map<string,string>(),used=sceneInstanceIds(next);
  const unique=(base:string):string=>{let index=1;while(used.has(`${base}-${index}`))index++;const id=`${base}-${index}`;used.add(id);return id;};
  for(const source of clipboard.scenery){
    const position=moved.get(source.id)!,dy=position.y-source.y;
    const item={...clone(source),...position,id:unique(`${scene.id}-${source.asset}`)};
    delete item.generatorId;delete item.groupId;
    if(source.depth!==undefined)item.depth=source.depth+dy;
    if(source.groupId&&clipboard.scenery.filter(other=>other.groupId===source.groupId).length>1){
      if(!groups.has(source.groupId))groups.set(source.groupId,unique(`${scene.id}-group`));
      item.groupId=groups.get(source.groupId);
    }
    owners.set(source.id,item.id);next.scenery.push(item);
  }
  for(const slot of clipboard.activities){
    const ownerId=owners.get(slot.ownerId)!;
    const id=unique(`${ownerId}-${slot.kind}`);activities.set(slot.id,id);
    (next.activities??=[]).push({...clone(slot),id,ownerId});
  }
  next=duplicatePrefabInstances(before,next,owners,activities);
  // New copies can be moved immediately even when their source was locked.
  const oldInstances=new Set(scene.prefabInstances?.map(instance=>instance.id));
  const dy=moved.get(clipboard.scenery[0].id)!.y-clipboard.scenery[0].y;
  for(const instance of next.prefabInstances??[])if(!oldInstances.has(instance.id)){
    delete instance.locked;
    for(const member of instance.members)if(member.base.depth!==undefined)member.base.depth+=dy;
  }
  return {scene:next,ids:[...owners.values()]};
}

/** Arc-length sampling retains remainder across events; fast drags leave no gaps. */
export class StrokeSampler {
  private previous?:ScenePoint;
  private remaining:number;
  private emitted=0;
  constructor(private spacing:number,private limit=300){
    if(!Number.isFinite(spacing)||spacing<8||spacing>512)throw Error('Brush spacing must be 8–512 units.');
    this.remaining=spacing;
  }
  move(point:ScenePoint):ScenePoint[]{
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return [];
    if(this.emitted>=this.limit)return [];
    if(!this.previous){this.previous={...point};this.emitted++;return [{...point}];}
    const start=this.previous,dx=point.x-start.x,dy=point.y-start.y,length=Math.hypot(dx,dy),points:ScenePoint[]=[];
    let distance=this.remaining;
    while(distance<=length+1e-7&&this.emitted<this.limit){
      points.push({x:start.x+dx*distance/length,y:start.y+dy*distance/length});
      this.emitted++;distance+=this.spacing;
    }
    this.remaining=distance-length;this.previous={...point};return points;
  }
  get full():boolean{return this.emitted>=this.limit;}
}
function pointSegment(point:ScenePoint,a:ScenePoint,b:ScenePoint):number {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}
function touches(a:ScenePoint,b:ScenePoint,bounds:SelectionBounds,radius:number):boolean {
  const corners=[{x:bounds.x,y:bounds.y},{x:bounds.x+bounds.width,y:bounds.y},{x:bounds.x+bounds.width,y:bounds.y+bounds.height},{x:bounds.x,y:bounds.y+bounds.height}];
  const inside=(p:ScenePoint)=>p.x>=bounds.x&&p.x<=bounds.x+bounds.width&&p.y>=bounds.y&&p.y<=bounds.y+bounds.height;
  if(inside(a)||inside(b)||corners.some(p=>pointSegment(p,a,b)<=radius))return true;
  for(let i=0;i<4;i++){
    const c=corners[i],d=corners[(i+1)%4];
    if(pointSegment(a,c,d)<=radius||pointSegment(b,c,d)<=radius)return true;
    const cross=(p:ScenePoint,q:ScenePoint,r:ScenePoint)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return true;
  }
  return false;
}
export interface BrushSettings {spacing:number;variation:number;clearance:number;protectPaths:boolean;radius:number;seed:number;snap:number}
export class ObjectPaintStroke {
  scene:WorldScene;
  readonly changedIds=new Set<string>();
  readonly skipped=new Set<string>();
  private sampler:StrokeSampler;
  private previous?:ScenePoint;
  private samples=0;
  private protectedPoints:ScenePoint[];
  constructor(source:WorldScene,readonly mode:'brush'|'erase',private template:ObjectTemplate|undefined,private settings:BrushSettings,
    private view:EditorViewState,private bounds:(item:SceneScenery)=>SelectionBounds,private individual=false){
    if(!Number.isFinite(settings.variation)||settings.variation<0||settings.variation>30||!Number.isFinite(settings.radius)||settings.radius<4||settings.radius>256||!Number.isFinite(settings.clearance)||settings.clearance<0||settings.clearance>120)throw Error('Use variation 0–30%, erase radius 4–256 and path clearance 0–120.');
    if(mode==='brush'&&!template)throw Error('Choose an object from the library before painting.');
    this.scene=clone(source);this.sampler=new StrokeSampler(settings.spacing);
    this.protectedPoints=[source.spawn,...source.npcs,...source.objects,...(source.residents??[]).map(resident=>resident.home),
      ...(source.entrances??[]).flatMap(door=>[sceneEntrancePoint(source,door),sceneEntrancePoint(source,door,true)]),
      ...(source.activities??[]).flatMap(slot=>{const owner=source.scenery.find(item=>item.id===slot.ownerId)!;return [...sceneActivityPlaces(source,slot),...[slot.approach,slot.exit].filter((p):p is ScenePoint=>!!p).map(p=>({x:p.x+owner.x,y:p.y+owner.y}))];})];
  }
  move(point:ScenePoint):void {
    if(this.mode==='erase')this.erase(this.previous??point,point);
    else for(const p of this.sampler.move(point))this.stamp(p);
    this.previous={...point};
  }
  private stamp(point:ScenePoint):void {
    const template=this.template!,s=this.settings;
    let hash=Math.imul((s.seed+ ++this.samples)^0x45d9f3b,0x45d9f3b);hash^=hash>>>16;
    const width=template.width*(1+(((hash>>>0)/4294967296)*2-1)*s.variation/100);
    const x=s.snap?Math.round(point.x/s.snap)*s.snap:point.x,y=s.snap?Math.round(point.y/s.snap)*s.snap:point.y;
    if(x<0||y<0||x>this.scene.width||y>this.scene.height){this.skipped.add('outside map');return;}
    const item:SceneScenery={id:nextSceneryId(this.scene,template.asset),asset:template.asset,frame:template.frame,variant:template.variant,motion:template.motion,x,y,width};
    const radius=Math.max(6,width*.13)+s.clearance;
    const envelope=Array.from({length:12},(_,i)=>[x+Math.cos(i*Math.PI/6)*radius,y+Math.sin(i*Math.PI/6)*radius] as const);
    const bases=sceneryFootprints([item],getSceneryGeometryMap(this.scene.id));
    if(this.scene.obstacles.some(area=>polygonsIntersect(area,envelope))){this.skipped.add('solid obstacles');return;}
    if(s.protectPaths&&(this.scene.walkable.some(area=>polygonsIntersect(area,envelope)||bases.some(base=>polygonsIntersect(area,base)))||this.protectedPoints.some(p=>Math.hypot(x-p.x,y-p.y)<radius+24))){this.skipped.add('paths or activity approaches');return;}
    if(this.scene.scenery.some(other=>Math.hypot(x-other.x,y-other.y)<Math.max(8,(width+other.width)*.25,s.spacing*.4))){this.skipped.add('existing objects');return;}
    this.scene.scenery.push(item);this.changedIds.add(item.id);
  }
  private erase(a:ScenePoint,b:ScenePoint):void {
    const considered=new Set<string>();
    for(const item of [...this.scene.scenery]){
      if(considered.has(item.id)||this.view.hidden.has(item.id)||!touches(a,b,this.bounds(item),this.settings.radius))continue;
      const ids=scenerySelection(this.scene,item.id,this.individual);
      ids.forEach(id=>considered.add(id));
      if(ids.some(id=>this.view.locked.has(id)||this.view.hidden.has(id)||this.scene.scenery.find(item=>item.id===id)?.pinned)){
        this.skipped.add('locked, hidden or pinned objects');continue;
      }
      try {this.scene=removeScenery(this.scene,new Set(ids));ids.forEach(id=>this.changedIds.add(id));}
      catch(error){this.skipped.add(error instanceof Error?error.message:String(error));}
    }
  }
  get summary():string {
    return `${this.changedIds.size} object${this.changedIds.size===1?'':'s'} ${this.mode==='brush'?'painted':'erased'}.${this.mode==='brush'&&this.sampler.full?' Stroke limit reached; start another stroke.':''}${this.skipped.size?' Skipped: '+[...this.skipped].map(message=>message.replace(/\.$/,'')).join('; ')+'.':''}`;
  }
}
