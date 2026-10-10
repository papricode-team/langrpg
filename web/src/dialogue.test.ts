import { describe, expect, it } from 'vitest';
import { conditionMet, dialogueChoices, dialogueLines, emptyStory, personalized, validateDialogue } from './dialogue';
import { questGraphs } from './quest-graph';
import { quests, npcs } from './content';
import { getMap } from './maps';
import serverRules from '../../server/story_rules.json';
import { createStateStore } from './game-state';

describe('authored in-world investigations', () => {
  it('has reachable, level-checked conversation graphs for the full clue chain', () => {
    expect(questGraphs.map(graph => graph.questId)).toEqual(quests.map(quest => quest.id));
    for (const graph of questGraphs) {
      expect(validateDialogue(graph), graph.questId).toEqual([]);
      expect(graph.investigations.length).toBeGreaterThanOrEqual(1);
      expect(graph.investigations.length).toBeLessThanOrEqual(2);
      expect(graph.objectives.length).toBeGreaterThanOrEqual(4);
      for (const line of graph.nodes.flatMap(node => node.lines)) expect(npcs.some(npc => npc.id === line.speaker), line.id).toBe(true);
      const quest = quests.find(quest => quest.id === graph.questId)!;
      const gate = quest.exercises.find(ex => ex.id === graph.gateExerciseId)!;
      expect(['type','sentence']).toContain(gate.mode);
      expect(dialogueChoices(graph.nodes.find(node => node.id === 'choice')!,emptyStory()).length).toBeGreaterThanOrEqual(2);
    }
  });
  it('matches the server gate, choice and physical target contract', () => {
    for (const graph of questGraphs) {
      const rule = serverRules.rules.find(rule => rule.questId === graph.questId)!;
      expect(rule.gateExerciseId).toBe(graph.gateExerciseId);
      expect(rule.choiceIds).toEqual(graph.nodes.find(node => node.id === 'choice')!.choices!.map(choice => choice.id));
      expect(rule.investigationObjectIds).toEqual(graph.investigations.map(item => item.objectId));
      const map = getMap(rule.mapId as Parameters<typeof getMap>[0]);
      for (const item of graph.investigations) expect(map.objects.some(object => object.id === item.objectId), item.objectId).toBe(true);
      expect(map.npcs.some(npc => npc.id === quests.find(q => q.id === graph.questId)!.npcId)).toBe(true);
    }
  });
  it('pays off the player letter, erased-key warning and kettle hooks through named people', () => {
    const finale = questGraphs.at(-1)!.nodes.flatMap(node => node.lines).map(line => line.german).join(' ');
    expect(finale).toContain('Wasserkocher'); expect(finale).toContain('Schlüssel'); expect(finale).toContain('{name}');
    expect(finale).toContain('meinen ersten Fehler');
    const station = questGraphs.find(graph => graph.questId === 'a1-station')!;
    expect(station.nodes.flatMap(node => node.lines).some(line => line.german.includes('Waldruh'))).toBe(false);
    expect(questGraphs.find(graph => graph.questId === 'a1-lost-parcel')!.nodes.flatMap(node => node.lines).some(line => line.german.includes('Waldruh'))).toBe(true);
  });
  it('detects dead links and unreachable editorial nodes', () => {
    const graph = structuredClone(questGraphs[0]);
    graph.nodes.push({id:'forgotten',stage:'intro',lines:[],terminal:true});
    graph.nodes[0].next = 'missing';
    expect(validateDialogue(graph)).toContain('a1-arrival: broken link intro → missing');
    expect(validateDialogue(graph)).toContain('a1-arrival: unreachable forgotten');
  });
  it('evaluates inventory, flags and faction trust without mutating server state', () => {
    const state = emptyStory(); state.flags.ready = true; state.inventory.push('letter'); state.reputation.unwritten = 3;
    expect(conditionMet({flag:'ready',item:'letter',faction:'unwritten',minimum:3},state)).toBe(true);
    expect(conditionMet({faction:'unwritten',minimum:4},state)).toBe(false);
    expect(personalized('Hallo, {name}. {name} ist willkommen.', '<Willow>')).toBe('Hallo, <Willow>. <Willow> ist willkommen.');
  });
  it('makes the archive and council routes depend on the items actually earned', () => {
    const station = questGraphs.find(graph=>graph.questId==='a1-station')!.nodes.find(node=>node.id==='choice')!;
    const state = emptyStory();
    expect(dialogueChoices(station,state).map(c=>c.id)).not.toContain('protect');
    state.inventory.push('lamplighter-key');
    expect(dialogueChoices(station,state).map(c=>c.id)).toContain('protect');
    state.inventory=['inspector-ledger']; state.flags['platform-reported']=true;
    expect(dialogueChoices(station,state).map(c=>c.id)).toEqual(['report','show-ledger']);
    const council = questGraphs.find(graph=>graph.questId==='b1-council')!.nodes.find(node=>node.id==='choice')!;
    expect(dialogueChoices(council,state).map(c=>c.id)).toContain('publish-ledger');
    state.inventory=[];
    expect(dialogueChoices(council,state).map(c=>c.id)).not.toContain('publish-ledger');
  });
  it('returns Voss to the market only when the receipt was handed over and plays one earned finale', () => {
    const state=emptyStory(), market=questGraphs.find(g=>g.questId==='a1-market')!.nodes.find(n=>n.id==='intro')!;
    expect(dialogueLines(market,state).some(l=>l.speaker==='inspector')).toBe(false);
    state.flags['receipt-filed']=true;
    expect(dialogueLines(market,state).some(l=>l.speaker==='inspector')).toBe(true);
    const finale=questGraphs.find(g=>g.questId==='b1-atlas')!.nodes.find(n=>n.id==='complete')!;
    for(const ending of ['routes-reopened','towns-consent','brass-reformed']) {
      state.ending=ending;
      expect(dialogueLines(finale,state).filter(l=>l.condition?.ending).map(l=>l.condition!.ending)).toEqual([ending]);
    }
  });
  it('keeps revisions ordered within an owner and permits a fresh account state', () => {
    const store = createStateStore({revision:0,xp:0}), observer: number[] = [];
    store.subscribe(state => observer.push(state.xp));
    expect(store.replace({revision:5,xp:30},'alice')).toBe(true);
    expect(store.replace({revision:4,xp:20},'alice')).toBe(false);
    expect(store.replace({revision:0,xp:0},'bob')).toBe(true);
    expect(observer).toEqual([30,0]);
  });
});
