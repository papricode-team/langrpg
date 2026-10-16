import {describe, expect, it} from 'vitest';
import {parseWorldSceneDocument, sceneActivityPoint, sceneEntrancePoint, sceneEntrances, type SceneScenery, type WorldScene, type WorldSceneDocument} from './scene-schema';
import {getWorldScene, sceneDocument} from './scene-data';
import {plainGround} from './ground';

function room(): WorldSceneDocument {
  const scene: WorldScene = {id: 'room', kind: 'interior', coordinateVersion: 1, width: 640, height: 480,
    spawn: {x: 60, y: 60}, npcs: [], objects: [],
    scenery: [{id: 'bench', asset: 'bench', x: 250, y: 200, width: 80}],
    ground: plainGround('timber', 640, 480), districts: [],
    activities: [{id: 'seat', ownerId: 'bench', kind: 'seat', offsetX: 20, offsetY: -5, approach: {x: 20, y: 30}}]};
  return {version: 4, maps: {room: scene}};
}

describe('canonical scene contract', () => {
  it('covers every outdoor region and keeps independent interior dimensions', () => {
    expect(Object.keys(sceneDocument.maps)).toHaveLength(3);
    expect(parseWorldSceneDocument(room()).maps.room.width).toBe(640);
    expect(() => getWorldScene('absent')).toThrow('Unknown world scene');
  });
  it('rejects invalid dimensions, duplicate IDs, invalid shapes and path traversal', () => {
    const value = room(); value.maps.room.width = 20000;
    expect(() => parseWorldSceneDocument(value)).toThrow('16384');
    value.maps.room.width = 640; value.maps.room.scenery.push({...value.maps.room.scenery[0]});
    expect(() => parseWorldSceneDocument(value)).toThrow('duplicate');
    value.maps.room.scenery.pop(); value.maps.room.districts = [{id: 'bow', polygon: [[14, 14], [600, 450], [600, 14], [14, 450]]}];
    expect(() => parseWorldSceneDocument(value)).toThrow(/area|cross/);
    const ground = room(); ground.maps.room.ground = {...ground.maps.room.ground, weights: ['AAA=']};
    expect(() => parseWorldSceneDocument(ground)).toThrow(/ground weights/);
  });
  it('moves activity positions with their owner and rejects deleted or out-of-bounds owners', () => {
    const value = room(), scene = value.maps.room, activity = scene.activities![0];
    expect(sceneActivityPoint(scene, activity)).toEqual({x: 270, y: 195});
    scene.scenery[0].x += 30;
    expect(sceneActivityPoint(scene, activity)).toEqual({x: 300, y: 195});
    scene.scenery[0].x = 635;
    expect(() => parseWorldSceneDocument(value)).toThrow('outside scene bounds');
    scene.scenery = [];
    expect(() => parseWorldSceneDocument(value)).toThrow('missing owner');
  });
  it('allows bounded decorative overscan while keeping gameplay anchors inside', () => {
    const value = room(); value.maps.room.activities = [];
    value.maps.room.scenery[0].y = 510;
    expect(parseWorldSceneDocument(value)).toBe(value);
    value.maps.room.objects = [{id: 'out-of-bounds', x: 250, y: 510}];
    expect(() => parseWorldSceneDocument(value)).toThrow('outside scene bounds');
  });
  it('derives a room door from its building and upgrades separate version 2 entrances', () => {
    const town=structuredClone(sceneDocument.maps.lindenhafen), owner=town.scenery.find(item=>item.interior)!;
    const door=sceneEntrancePoint(town,owner);
    owner.x+=60;owner.y+=40;
    expect(sceneEntrancePoint(town,owner)).toEqual({x:door.x+60,y:door.y+40});
    const legacy=structuredClone(sceneDocument) as unknown as {version:number;maps:Record<string,Record<string,unknown>&{scenery:SceneScenery[]}>};
    legacy.version=2;
    for(const scene of Object.values(legacy.maps)){
      scene.entrances=scene.scenery.filter(item=>item.interior).map(item=>({id:`${item.interior!.kind}-entrance`,ownerId:item.id,interiorId:item.interior!.kind,offsetX:0,offsetY:0}));
      for(const item of scene.scenery)delete item.interior;
    }
    const upgraded=parseWorldSceneDocument(legacy);
    expect(upgraded.version).toBe(4);
    expect(sceneEntrances(upgraded.maps.lindenhafen).map(item=>item.interiorId).sort()).toEqual(['bakery','cafe','inn','supermarket']);
    expect('entrances' in upgraded.maps.lindenhafen).toBe(false);
  });
  it('lets only buildings with a painted door host a room, once per town', () => {
    const document=structuredClone(sceneDocument), town=document.maps.lindenhafen;
    const tree=town.scenery.find(item=>item.asset==='tree')!;
    tree.interior={kind:'bakery'};
    expect(()=>parseWorldSceneDocument(structuredClone(document))).toThrow('has no door');
    delete tree.interior;
    const hosts=town.scenery.filter(item=>item.interior);
    hosts[1].interior={kind:hosts[0].interior!.kind};
    expect(()=>parseWorldSceneDocument(structuredClone(document))).toThrow('two buildings with a');
  });
  it('rejects invalid authored sort segments',()=>{
    const value=room();value.maps.room.scenery[0].sortLine=[[0,0],[0,10]];
    expect(()=>parseWorldSceneDocument(value)).toThrow('distinct x');
    value.maps.room.scenery[0].sortLine=[[0,0],[10,Infinity]];
    expect(()=>parseWorldSceneDocument(value)).toThrow('finite pairs');
  });
  it.each(['npcs','objects'] as const)('requires %s collision offsets to use world units',kind=>{
    const value=room();
    value.maps.room[kind]=[{id:'anchor',x:100,y:100,collision:{referenceWidth:1,polygons:[[[-8,-6],[8,-6],[8,6],[-8,6]]]}}];
    expect(parseWorldSceneDocument(value)).toBe(value);
    value.maps.room[kind][0].collision!.referenceWidth=80;
    expect(()=>parseWorldSceneDocument(value)).toThrow('reference width must be 1 for world-unit offsets');
  });
  it('allows scenery collision to use its authored reference width',()=>{
    const value=room();
    value.maps.room.scenery[0].collision={referenceWidth:512,polygons:[[[-64,-32],[64,-32],[64,32],[-64,32]]]};
    expect(parseWorldSceneDocument(value)).toBe(value);
  });
  it.each(['catalog','baseline'] as const)('validates %s prefab child collision',source=>{
    const value=room(),child:SceneScenery={...value.maps.room.scenery[0],collision:{referenceWidth:80,polygons:[[[-30,-10],[30,-10],[30,10],[-30,10]]]}};
    value.prefabs=[{id:'bench-prefab',name:'Bench',revision:1,scenery:[structuredClone(child)],activities:[]}];
    value.maps.room.prefabInstances=[{id:'bench-instance',prefabId:'bench-prefab',revision:1,origin:{x:0,y:0},members:[{key:'bench',id:'bench',base:structuredClone(child)}],activities:[]}];
    expect(parseWorldSceneDocument(value)).toBe(value);
    const collision=source==='catalog'?value.prefabs![0].scenery[0].collision!:value.maps.room.prefabInstances![0].members[0].base.collision!;
    collision.referenceWidth=0;
    expect(()=>parseWorldSceneDocument(value)).toThrow('collision reference width must be positive');
    collision.referenceWidth=80;
    collision.polygons=[[[-30,-10],[30,-10]]];
    expect(()=>parseWorldSceneDocument(value)).toThrow('collision 0 needs 3–256 vertices');
  });
});
