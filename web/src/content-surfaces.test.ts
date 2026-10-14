// @vitest-environment happy-dom
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {expeditionRegions,loadExpeditionEncounter,clearExpeditionContent} from './expeditions';
import {expeditionGames,loadExpeditionGame,clearExpeditionGames} from './expedition-games';
import {interiors,loadInteriorObject,loadInteriorWordExample,clearInteriorContent} from './interiors';
import {interiorConversations,loadInteriorConversation,clearInteriorConversations} from './interior-conversations';
import {clearExpeditionLearning,encounterLearning} from './expedition-learning';
import fixtures from '../../content/alignments/fixtures.json';
import type {AlignedLine} from './aligned-line';

const service=vi.hoisted(()=>({bootstrap:vi.fn(),expedition:vi.fn(),minigame:vi.fn(),narrative:vi.fn(),lines:vi.fn(),lexemes:vi.fn(),exercises:vi.fn()}));
vi.mock('./content-api',()=>({getContentClient:()=>service}));
const line=fixtures.find(line=>line.fixture==='screen-records') as unknown as AlignedLine;
beforeEach(()=>{vi.clearAllMocks();clearExpeditionContent();clearExpeditionGames();clearInteriorContent();clearExpeditionLearning();clearInteriorConversations();});

describe('learning surfaces fetch the selected record',()=>{
  it('starts with geometry and titles while learning text, answers and vocabulary remain absent',()=>{
    expect(expeditionRegions.flatMap(region=>region.encounters).every(encounter=>!encounter.german&&!encounter.translation&&!encounter.choices.length)).toBe(true);
    expect(expeditionGames.every(game=>!game.fields.length&&!game.german.A1&&!Object.keys(game.solution).length)).toBe(true);
    expect(interiors.flatMap(room=>room.objects).every(object=>!object.vocabulary.length&&!object.dialogue&&!object.prompt)).toBe(true);
    expect(interiorConversations).toEqual([]);
  });
  it('hydrates one encounter and installs only its admitted recall metadata',async()=>{
    const encounter=expeditionRegions[0].encounters[0],recognition='00000000-0000-4000-8000-000000000001';
    service.expedition.mockResolvedValue({id:encounter.recordId,lineId:line.id,prompt:'Read the ticket.',choices:[{text:'Bitte.',response:''}],learning:{encounterId:encounter.id,exerciseIds:{recognition,listening:recognition},audio:'/audio/ticket.mp3',supported:false},learningExercises:[]});
    service.lines.mockResolvedValue([line]);
    await loadExpeditionEncounter(encounter);
    expect(service.expedition).toHaveBeenCalledExactlyOnceWith(encounter.recordId);
    expect(service.lines).toHaveBeenCalledExactlyOnceWith([line.id]);
    expect(encounter.aligned).toBe(line);
    expect(encounter.german).toContain('Ihre Fahrkarte');
    expect(encounterLearning.size).toBe(1);
    expect(expeditionRegions[0].encounters[1].german).toBe('');
  });
  it('loads one plan without installing a local grading solution',async()=>{
    const game=expeditionGames[0];service.minigame.mockResolvedValue({id:game.recordId,summary:'Coordinate delivery.',german:{A1:'Ein Paket.',A2:'Ein Paket.',B1:'Ein Paket.'},fields:[{id:'gate',label:'Eingang',english:'Entrance',options:[{value:0,label:'Tor',english:'gate'}]}],steps:[],learning:[],learningExercises:[]});
    await loadExpeditionGame(game);
    expect(service.minigame).toHaveBeenCalledExactlyOnceWith(game.recordId);
    expect(game.fields).toHaveLength(1);
    expect(game.solution).toEqual({});
    expect(game.validate({gate:0})).not.toEqual([]);
    expect(expeditionGames[1].fields).toEqual([]);
  });
  it('loads only the selected interior card and its referenced words, lines and exercises',async()=>{
    const object=interiors[0].objects[0],wordId='00000000-0000-4000-8000-000000000002',exerciseId='00000000-0000-4000-8000-000000000003';
    service.narrative.mockResolvedValue({id:object.narrativeId,sessionTitle:'Read your ticket',prompt:'Say it politely.',exerciseIds:[exerciseId],vocabulary:[{lexemeId:wordId,lineId:line.id}]});
    service.lines.mockResolvedValue([line]);service.lexemes.mockResolvedValue([{id:wordId,lemma:'Fahrkarte',article:'die',plural:'Fahrkarten',english:'ticket'}]);service.exercises.mockResolvedValue([{id:exerciseId,itemId:wordId,mode:'choice',prompt:'Choose.',german:'',english:'Ticket',hint:''}]);
    await loadInteriorObject(object);
    expect(service.narrative).toHaveBeenCalledExactlyOnceWith(object.narrativeId);
    expect(service.lexemes).toHaveBeenCalledExactlyOnceWith([wordId]);
    expect(service.lines).toHaveBeenCalledExactlyOnceWith([line.id]);
    expect(service.exercises).toHaveBeenCalledExactlyOnceWith([exerciseId]);
    expect(object.vocabulary[0].aligned).toBe(line);
    expect(interiors[0].objects[1].vocabulary).toEqual([]);
    clearInteriorContent();expect(interiors[0].objects[0].vocabulary).toEqual([]);
  });
  it('loads only the current conversation node and choices before another navigation step',async()=>{
    const id=(number:number)=>`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
    const objectId=interiors[0].objects[0].id;
    service.bootstrap.mockResolvedValue({narratives:[{id:id(10),kind:'interior-conversation',objectId}]});
    service.narrative.mockResolvedValue({id:id(10),objectId,npcId:'marta',name:'Marta',role:'Host',title:'Choose a drink',start:id(11),nodes:{
      [id(11)]:{id:id(11),line:{lineId:id(20)},choices:[{id:id(30),line:{lineId:id(21)},next:id(12)},{id:id(31),line:{lineId:id(22)},next:id(12)}]},
      [id(12)]:{id:id(12),line:{lineId:id(23)},choices:[]},
    }});
    service.lines.mockImplementation(async(ids:string[])=>ids.map(id=>({...line,id})));
    const conversation=await loadInteriorConversation(objectId);
    expect(service.lines).toHaveBeenCalledExactlyOnceWith([id(20),id(21),id(22)]);
    expect(conversation?.nodes[id(11)].line.aligned?.id).toBe(id(20));
    expect(conversation?.nodes[id(12)].line.german).toBe('');
    await loadInteriorConversation(objectId,id(12));
    expect(service.narrative).toHaveBeenCalledTimes(1);
    expect(service.lines).toHaveBeenLastCalledWith([id(23)]);
    expect(conversation?.nodes[id(12)].line.german).toContain('Ihre Fahrkarte');
    clearInteriorConversations();expect(interiorConversations).toEqual([]);
  });
  it('reveals the example of the selected word only once',async()=>{
    const word={article:'die',lemma:'Fahrkarte',plural:'',english:'ticket',exampleLineId:line.id};
    service.lines.mockResolvedValue([line]);
    await loadInteriorWordExample(word);await loadInteriorWordExample(word);
    expect(service.lines).toHaveBeenCalledExactlyOnceWith([line.id]);
    expect((word as typeof word&{example:Array<{aligned:AlignedLine}>}).example[0].aligned).toBe(line);
  });
});
