import { sceneryFootprints } from './placed-scenery';
import {sceneInstanceIds} from './level-editor-prefabs';
import {sceneActivityPoint,sceneEntrancePoint,type SceneGenerationZone, type ScenePolygon, type SceneScenery, type WorldScene} from './scene-schema';

export interface ScatterTemplate { asset: SceneScenery['asset']; frame: string; variant?: boolean; width: number; motion?: SceneScenery['motion']; }
export interface ScatterSettings { count: number; minSpacing: number; clearance: number; minScale: number; maxScale: number; }
export interface ScatterProposal {
  source: string;
  zone: SceneGenerationZone;
  added: SceneScenery[];
  removedIds: string[];
  preservedIds: string[];
  requested: number;
  attempts: number;
  rejected: { outsideZone: number; pathClearance: number; occupied: number };
  diagnostics: string[];
}
const cross = (a: readonly number[],b: readonly number[],c: readonly number[]): number => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onSegment(a: readonly number[], b: readonly number[], p: readonly number[]): boolean {
  return Math.abs(cross(a,b,p))<.00001&&p[0]>=Math.min(a[0],b[0])-.00001&&p[0]<=Math.max(a[0],b[0])+.00001&&p[1]>=Math.min(a[1],b[1])-.00001&&p[1]<=Math.max(a[1],b[1])+.00001;
}
function contains(polygon: ScenePolygon,x:number,y:number):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j],b=polygon[i];if(onSegment(a,b,[x,y]))return true;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function polygonsIntersect(a:ScenePolygon,b:ScenePolygon):boolean {
  if(a.some(([x,y])=>contains(b,x,y))||b.some(([x,y])=>contains(a,x,y)))return true;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++) {
    const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
    if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return true;
  }
  return false;
}
function randomFor(seed:number):()=>number {
  let state=(seed>>>0)||0x6d2b79f5;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
}
const circle = (x:number,y:number,radius:number):ScenePolygon => Array.from({length:12},(_,i)=>[x+Math.cos(i*Math.PI/6)*radius,y+Math.sin(i*Math.PI/6)*radius] as const);

/** Conservative scatter: generation never occupies an authored walking polygon. */
export function generateScatter(scene:WorldScene,zone:SceneGenerationZone,templates:readonly ScatterTemplate[],settings:ScatterSettings):ScatterProposal {
  if(zone.rulesVersion!==1)throw new Error(`Unsupported scatter rules version ${zone.rulesVersion}.`);
  if(!Number.isSafeInteger(zone.seed)||!Number.isInteger(settings.count)||settings.count<1||settings.count>300)throw new Error('Use an integer seed and a requested count between 1 and 300.');
  if(!templates.length)throw new Error('Choose at least one palette object for this generation zone.');
  if(![settings.minSpacing,settings.clearance,settings.minScale,settings.maxScale].every(Number.isFinite)||settings.minSpacing<8||settings.clearance<0||settings.minScale<.25||settings.maxScale>2||settings.minScale>settings.maxScale)throw new Error('Use spacing of at least 8 units, nonnegative clearance, and sizes between 25% and 200%.');
  if(zone.polygon.length<3)throw new Error('Draw a land-only generation zone first.');
  const random=randomFor(zone.seed), pinned=new Set(zone.pinnedIds??[]);
  const owners=new Set([
    ...[...(scene.entrances??[]),...(scene.activities??[])].map(item=>item.ownerId),
    ...(scene.prefabInstances??[]).flatMap(instance=>instance.members.map(member=>member.id)),
  ]);
  const removable=scene.scenery.filter(item=>item.generatorId===zone.id&&!item.pinned&&!pinned.has(item.id)&&!owners.has(item.id));
  const removed=new Set(removable.map(item=>item.id));
  const retained=scene.scenery.filter(item=>!removed.has(item.id));
  const preserved=retained.filter(item=>item.generatorId===zone.id);
  const usedIds=sceneInstanceIds({...scene,scenery:retained});
  const proposals:SceneScenery[]=[];
  const minX=Math.min(...zone.polygon.map(p=>p[0])),maxX=Math.max(...zone.polygon.map(p=>p[0]));
  const minY=Math.min(...zone.polygon.map(p=>p[1])),maxY=Math.max(...zone.polygon.map(p=>p[1]));
  const rejected={outsideZone:0,pathClearance:0,occupied:0};
  const protectedPoints=[scene.spawn,...scene.npcs,...scene.objects,
    ...(scene.entrances??[]).flatMap(entrance=>[sceneEntrancePoint(scene,entrance),sceneEntrancePoint(scene,entrance,true)]),
    ...(scene.activities??[]).flatMap(slot=>{const owner=scene.scenery.find(item=>item.id===slot.ownerId)!;return [sceneActivityPoint(scene,slot),...(slot.approach?[{x:owner.x+slot.approach.x,y:owner.y+slot.approach.y}]:[])];})];
  let attempts=0;
  for(;attempts<Math.min(12000,settings.count*100)&&proposals.length<settings.count;attempts++) {
    const template=templates[Math.floor(random()*templates.length)];
    const x=Math.round((minX+random()*(maxX-minX))*10)/10,y=Math.round((minY+random()*(maxY-minY))*10)/10;
    const width=Math.round(template.width*(settings.minScale+random()*(settings.maxScale-settings.minScale))*10)/10;
    const flipX=random()<.5;
    let index=proposals.length+1;while(usedIds.has(`${zone.id}-${index}`))index++;
    const item:SceneScenery={id:`${zone.id}-${index}`,asset:template.asset,frame:template.frame,variant:!!template.variant,x,y,width,flipX,motion:template.motion??(template.asset==='tree'||template.asset==='cypress'?'tree':'still'),generatorId:zone.id};
    const radius=Math.max(6,width*.13)+settings.clearance;
    const envelope=circle(x,y,radius);
    if(envelope.some(([px,py])=>px<0||py<0||px>scene.width||py>scene.height||!contains(zone.polygon,px,py))){rejected.outsideZone++;continue;}
    const footprints=sceneryFootprints([item]);
    if(scene.walkable.some(path=>polygonsIntersect(envelope,path)||footprints.some(footprint=>polygonsIntersect(footprint,path)))||protectedPoints.some(p=>Math.hypot(x-p.x,y-p.y)<120+radius)){rejected.pathClearance++;continue;}
    if([...retained,...proposals].some(other=>Math.hypot(x-other.x,y-other.y)<Math.max(settings.minSpacing,(width+other.width)*.3))||scene.obstacles.some(obstacle=>polygonsIntersect(envelope,obstacle))){rejected.occupied++;continue;}
    proposals.push(item);usedIds.add(item.id);
  }
  const diagnostics=[`${proposals.length} of ${settings.count} requested objects fit. ${removable.length} prior generated objects would be replaced; ${preserved.length} protected objects stay.`];
  if(proposals.length<settings.count)diagnostics.push('The zone is too crowded or too close to walking paths. Enlarge the land-only zone, lower the count, or reduce spacing.');
  return {source:JSON.stringify(scene),zone:{...zone,...settings,palette:templates.map(item=>item.frame)},added:proposals,removedIds:[...removed],preservedIds:preserved.map(item=>item.id),requested:settings.count,attempts,rejected,diagnostics};
}

/** Accepted results are stored, so opening a world never reruns a generator. */
export function applyScatter(scene:WorldScene,proposal:ScatterProposal):WorldScene {
  if(JSON.stringify(scene)!==proposal.source)throw new Error('The world changed after this preview. Generate a fresh preview before applying it.');
  const removed=new Set(proposal.removedIds);
  const scenery=[...scene.scenery.filter(item=>!removed.has(item.id)),...proposal.added];
  return {...scene,scenery,activities:scene.activities?.filter(slot=>!removed.has(slot.ownerId)),generationZones:[...(scene.generationZones??[]).filter(zone=>zone.id!==proposal.zone.id),proposal.zone]};
}
