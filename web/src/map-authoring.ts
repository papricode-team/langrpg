import data from './data/world-navigation.json';
import type {WorldMapSpec} from './maps';

export type AuthoredPolygon=readonly (readonly [number,number])[];
export interface AuthoredPosition {id:string;x:number;y:number;}
export interface AuthoredMap {
  walkable:readonly AuthoredPolygon[];obstacles:readonly AuthoredPolygon[];
  spawn:{x:number;y:number};npcs:readonly AuthoredPosition[];objects:readonly AuthoredPosition[];
}
export interface MapNavigationDocument {version:1;width:number;height:number;maps:Record<string,AuthoredMap>;}

export function parseMapNavigationDocument(value:unknown):MapNavigationDocument {
  const fail=(message:string):never=>{throw new Error(`Invalid authored map: ${message}`);};
  if(!value||typeof value!=='object')return fail('document must be an object');
  const document=value as MapNavigationDocument;
  if(document.version!==1||document.width!==1536||document.height!==1024)return fail('expected version 1 and a 1536 × 1024 painting');
  if(!document.maps||typeof document.maps!=='object'||Array.isArray(document.maps))return fail('missing map registry');
  const point=(value:unknown):value is {x:number;y:number}=>!!value&&typeof value==='object'&&Number.isFinite((value as {x:number}).x)&&Number.isFinite((value as {y:number}).y)&&(value as {x:number}).x>=0&&(value as {x:number}).x<=document.width&&(value as {y:number}).y>=0&&(value as {y:number}).y<=document.height;
  const cross=(a:readonly number[],b:readonly number[],c:readonly number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(const [id,map] of Object.entries(document.maps)) {
    if(!['lindenhafen','waldruh','nebelstadt'].includes(id)||!map||typeof map!=='object')return fail(`unknown map ${id}`);
    if(!Array.isArray(map.walkable)||!map.walkable.length||!Array.isArray(map.obstacles))return fail(`${id} needs walkable polygons and obstacles`);
    for(const [kind,polygons] of [['walkable',map.walkable],['obstacle',map.obstacles]] as const)for(const [index,polygon] of polygons.entries()) {
      if(!Array.isArray(polygon)||polygon.length<3||polygon.length>256)return fail(`${id} ${kind} ${index} needs 3–256 vertices`);
      if(polygon.some(vertex=>!Array.isArray(vertex)||vertex.length!==2||!point({x:vertex[0],y:vertex[1]})))return fail(`${id} ${kind} ${index} has an invalid vertex`);
      if(new Set(polygon.map(vertex=>`${vertex[0]},${vertex[1]}`)).size!==polygon.length)return fail(`${id} ${kind} ${index} repeats a vertex`);
      const area=Math.abs(polygon.reduce((sum,vertex,i)=>{const next=polygon[(i+1)%polygon.length];return sum+vertex[0]*next[1]-next[0]*vertex[1];},0))/2;
      if(area<1)return fail(`${id} ${kind} ${index} has no usable area`);
      for(let i=0;i<polygon.length;i++)for(let j=i+2;j<polygon.length;j++) {
        if(i===0&&j===polygon.length-1)continue;
        const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[j],d=polygon[(j+1)%polygon.length];
        const within=(a:readonly number[],b:readonly number[],point:readonly number[])=>point[0]>=Math.min(a[0],b[0])&&point[0]<=Math.max(a[0],b[0])&&point[1]>=Math.min(a[1],b[1])&&point[1]<=Math.max(a[1],b[1]);
        const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
        if((abC*abD<0&&cdA*cdB<0)||(abC===0&&within(a,b,c))||(abD===0&&within(a,b,d))||(cdA===0&&within(c,d,a))||(cdB===0&&within(c,d,b)))return fail(`${id} ${kind} ${index} crosses itself`);
      }
    }
    if(!point(map.spawn))return fail(`${id} has an invalid spawn`);
    for(const kind of ['npcs','objects'] as const) {
      if(!Array.isArray(map[kind]))return fail(`${id} is missing ${kind} placements`);
      const seen=new Set<string>();
      for(const placement of map[kind]) {
        const placementId=(placement as AuthoredPosition)?.id;
        if(!point(placement)||typeof placementId!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(placementId)||seen.has(placementId))return fail(`${id} has an invalid or duplicate ${kind} placement`);
        seen.add(placementId);
      }
    }
  }
  for(const id of ['lindenhafen','waldruh','nebelstadt'])if(!document.maps[id])return fail(`missing ${id}`);
  return document;
}

export const authoredNavigation=parseMapNavigationDocument(data);
export function applyAuthoredMapPlacements(spec:WorldMapSpec,document:MapNavigationDocument=authoredNavigation):WorldMapSpec {
  const authored=document.maps[spec.id];if(!authored)return spec;
  const place=<T extends {id:string;x:number;y:number}>(values:readonly T[],positions:readonly AuthoredPosition[]):T[]=>values.map(value=>{
    const position=positions.find(position=>position.id===value.id);
    return position?{...value,x:position.x/document.width,y:position.y/document.height}:value;
  });
  return {...spec,spawn:{x:authored.spawn.x/document.width,y:authored.spawn.y/document.height},npcs:place(spec.npcs,authored.npcs),objects:place(spec.objects,authored.objects)};
}
