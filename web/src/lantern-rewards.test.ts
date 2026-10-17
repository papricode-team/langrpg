import { describe, expect, it } from 'vitest';
import { lanternRewards, lanternRewardsMarkup } from './lantern-rewards';
import { quests } from './content';

describe('earned lantern', () => {
  it('requires saved clues as well as XP for titles and ignores unknown/duplicate ids', () => {
    expect(lanternRewards({xp:9999,completedQuestIds:[]})).toMatchObject({trailkeeper:false,title:'Wanderer'});
    expect(lanternRewards({xp:60,completedQuestIds:[quests[0].id,quests[0].id,'invented']})).toMatchObject({trailkeeper:false,title:'Lantern Bearer'});
  });
  it('lists only the crest among earned powers', () => {
    expect(lanternRewards({xp:0,completedQuestIds:[]})).not.toHaveProperty('echo');
    expect(lanternRewards({xp:0,completedQuestIds:[]})).not.toHaveProperty('wordlight');
    const markup = lanternRewardsMarkup({xp:0,completedQuestIds:[]} as never);
    expect(markup).toContain('Lamplighter crest');
    expect(markup).not.toMatch(/Echo|Wordlight/);
  });
  it('derives crests and final title from saved milestones', () => {
    expect(lanternRewards({xp:500,completedQuestIds:quests.filter(q=>q.level==='A1').map(q=>q.id)})).toMatchObject({crest:'leaf',title:'Lamplighter'});
    expect(lanternRewards({xp:1500,completedQuestIds:quests.map(q=>q.id)})).toMatchObject({crest:'star',title:'Atlas Keeper'});
  });
});
