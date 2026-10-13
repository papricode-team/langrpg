import {describe, expect, it} from 'vitest';
import {parseWorldSceneDocument, sceneActivityPoint, sceneEntrancePoint, type WorldScene, type WorldSceneDocument} from './scene-schema';
import {getWorldScene, sceneDocument} from './scene-data';

function room(): WorldSceneDocument {
  const scene: WorldScene = {id: 'room', kind: 'interior', coordinateVersion: 1, width: 640, height: 480,
    spawn: {x: 60, y: 60}, npcs: [], objects: [], walkable: [[[14, 14], [626, 14], [626, 466], [14, 466]]], obstacles: [],
    scenery: [{id: 'bench', asset: 'bench', x: 250, y: 200, width: 80}],
    terrain: [{id: 'floor', x: 0, y: 0, width: 640, height: 480, dayAsset: '/assets/floor.webp'}], districts: [],
    activities: [{id: 'seat', ownerId: 'bench', kind: 'seat', offsetX: 20, offsetY: -5, approach: {x: 20, y: 30}}]};
  return {version: 2, maps: {room: scene}};
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
    value.maps.room.scenery.pop(); value.maps.room.walkable = [[[14, 14], [600, 450], [600, 14], [14, 450]]];
    expect(() => parseWorldSceneDocument(value)).toThrow(/area|cross/);
    const path = room(); path.maps.room.terrain[0].dayAsset = '/assets/../../secret.png';
    expect(() => parseWorldSceneDocument(path)).toThrow('local /assets');
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
  it('keeps entrance approaches and return positions relative to their owner', () => {
    const value=room(), scene=value.maps.room;
    scene.entrances=[{id:'cafe-door',interiorId:'cafe',ownerId:'bench',offsetX:8,offsetY:30,returnOffset:{x:12,y:45}}];
    const door=scene.entrances[0];
    expect(sceneEntrancePoint(scene,door)).toEqual({x:258,y:230});
    scene.scenery[0].x+=60;scene.scenery[0].y+=40;
    expect(sceneEntrancePoint(scene,door)).toEqual({x:318,y:270});
    expect(sceneEntrancePoint(scene,door,true)).toEqual({x:322,y:285});
    expect(parseWorldSceneDocument(value)).toBe(value);
    scene.entrances.push({...door,id:'duplicate-room'});
    expect(()=>parseWorldSceneDocument(value)).toThrow('duplicate entrances');
    scene.entrances.pop();scene.scenery=[];
    expect(()=>parseWorldSceneDocument(value)).toThrow('missing owner');
  });
  it('scales and mirrors painted doors with their owner and returns one adult below the sill',()=>{
    const scene=structuredClone(sceneDocument.maps.lindenhafen),entrance=scene.entrances![0];
    const owner=scene.scenery.find(item=>item.id===entrance.ownerId)!;
    const before=sceneEntrancePoint(scene,entrance);
    owner.width*=1.25;
    const larger=sceneEntrancePoint(scene,entrance);
    expect(larger.x-owner.x).toBeCloseTo((before.x-owner.x)*1.25);
    expect(larger.y-owner.y).toBeCloseTo((before.y-owner.y)*1.25);
    owner.flipX=true;
    const mirrored=sceneEntrancePoint(scene,entrance);
    expect(mirrored.x-owner.x).toBeCloseTo(-(larger.x-owner.x));
    expect(sceneEntrancePoint(scene,entrance,true)).toEqual({x:mirrored.x,y:mirrored.y+72});
  });
  it('rejects invalid authored sort segments',()=>{
    const value=room();value.maps.room.scenery[0].sortLine=[[0,0],[0,10]];
    expect(()=>parseWorldSceneDocument(value)).toThrow('distinct x');
    value.maps.room.scenery[0].sortLine=[[0,0],[10,Infinity]];
    expect(()=>parseWorldSceneDocument(value)).toThrow('finite pairs');
  });
});
