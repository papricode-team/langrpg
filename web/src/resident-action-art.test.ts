import {describe,it,expect} from 'vitest';
import {residentActionPose,residentSeatedOffset} from './resident-action-art';
import {ResidentActivityWorld,type ActivityResidentSample} from './resident-activities';
import {getWorldScene,sceneDocument} from './scene-data';
import {parseWorldSceneDocument} from './scene-schema';
import {createMapNavigation} from './navigation';

const sample=(fields:Partial<ActivityResidentSample>={}):ActivityResidentSample=>({residentId:'reader',x:10,y:20,phase:'act',phaseSeconds:0,action:'read',heldObject:'book',moving:false,velocityX:0,velocityY:0,walkDistance:0,...fields});
describe('painted activity presentation',()=>{
  it('samples action and carry poses directly, preserving reduced-motion activity state',()=>{
    expect(residentActionPose(sample(),false)).toEqual({frame:'read',bakedObject:'book'});
    expect(residentActionPose(sample({phaseSeconds:7}),false)?.frame).toBe('read-turn');
    expect(residentActionPose(sample({phaseSeconds:7}),true)?.frame).toBe('read');
    expect(residentActionPose(sample({action:'sit',heldObject:undefined}),false)).toEqual({frame:'sit'});
    expect(residentActionPose(sample({action:'work',heldObject:'tool',phaseSeconds:1.5}),false)).toEqual({frame:'work-down',bakedObject:'tool'});
    expect(residentActionPose(sample({action:'work',heldObject:'parcel'}),false)).toEqual({frame:'carry',bakedObject:'parcel'});
    expect(residentActionPose(sample({action:'serve',heldObject:undefined}),false)?.frame).toBe('serve');
    expect(residentActionPose(sample({action:'greet',heldObject:undefined}),true)?.frame).toBe('greet');
    expect(residentActionPose(sample({phase:'travel'}),false)).toBeUndefined();
    expect(residentActionPose(sample({phase:'home'}),false)).toBeUndefined();
    const carrying=sample({phase:'return',action:'carry',heldObject:'parcel',moving:true});
    expect([0,16,32,48,64].map(walkDistance=>residentActionPose({...carrying,walkDistance},false)?.frame)).toEqual(['carry-left','carry-pass','carry-right','carry-pass','carry-left']);
    expect(residentActionPose(carrying,true)?.frame).toBe('carry');
    expect(residentActionPose(sample({heldObject:undefined}),false)).toEqual({frame:'sit'});
  });
  it('reconstructs the same pose and authored facing on late join and across a full visit',()=>{
    const scene=getWorldScene('lindenhafen'),simulation=new ResidentActivityWorld(scene,createMapNavigation('lindenhafen'));
    const time={seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:0};
    const visit=simulation.day(time).plan.activities.find(visit=>visit.residentId==='lindenhafen-promenade-reader'&&visit.task.id==='afternoon-reading')!;
    const instant={...time,elapsedSeconds:visit.arrival+7-7*30};
    const first=simulation.sample(instant).find(actor=>actor.residentId===visit.residentId)!;
    const joined=new ResidentActivityWorld(scene,createMapNavigation('lindenhafen')).sample(instant).find(actor=>actor.residentId===visit.residentId)!;
    expect(first.phaseSeconds).toBeCloseTo(7);expect(first.facingLeft).toBe(true);expect(first).toEqual(joined);
    expect(residentSeatedOffset(first,false)).toBe(-16);
    expect(residentSeatedOffset({...first,phaseSeconds:0},false)).toBeCloseTo(0);
    expect(residentSeatedOffset({...first,phaseSeconds:0},true)).toBe(-16);
    expect(residentActionPose(joined,false)?.frame).toBe('read-turn');
    const returning=simulation.sample({...instant,elapsedSeconds:visit.finished+.01-7*30}).find(actor=>actor.residentId===visit.residentId)!;
    expect(returning.phase).toBe('return');expect(returning.heldObject).toBeUndefined();expect(residentActionPose(returning,false)).toBeUndefined();
  });
  it('rejects missing and mismatched painted identities instead of changing appearance mid-task',()=>{
    const doc=structuredClone(sceneDocument),actor=doc.maps.lindenhafen.residents![0];
    actor.actionArt='unknown' as typeof actor.actionArt;
    expect(()=>parseWorldSceneDocument(doc)).toThrow(/unknown action artwork/);
    actor.actionArt='anne';expect(()=>parseWorldSceneDocument(doc)).toThrow(/match its avatar colors/);
  });
});
