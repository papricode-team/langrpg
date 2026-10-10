import { describe, expect, it } from 'vitest';
import { lanternRewards } from './lantern-rewards';
import { quests } from './content';

describe('earned lantern', () => {
  it('requires saved clues as well as XP for powers and ignores unknown/duplicate ids', () => {
    expect(lanternRewards({xp:9999,completedQuestIds:[]})).toMatchObject({echo:false,wordlight:false,title:'Wanderer'});
    expect(lanternRewards({xp:60,completedQuestIds:[quests[0].id,quests[0].id,'invented']})).toMatchObject({echo:true,wordlight:false,title:'Lantern Bearer'});
    expect(lanternRewards({xp:60,completedQuestIds:quests.slice(0,3).map(q=>q.id)}).wordlight).toBe(true);
  });
  it('derives crests and final title from saved milestones', () => {
    expect(lanternRewards({xp:500,completedQuestIds:quests.slice(0,6).map(q=>q.id)})).toMatchObject({crest:'leaf',title:'Lamplighter'});
    expect(lanternRewards({xp:1500,completedQuestIds:quests.map(q=>q.id)})).toMatchObject({crest:'star',title:'Atlas Keeper'});
  });
});
