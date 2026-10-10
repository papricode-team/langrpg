import type { Progress } from './api';
import { quests } from './content';
import { escapeHtml as e, icon } from './icons';

export interface LanternRewards {
  title: string;
  crest: 'ember' | 'leaf' | 'silver' | 'star';
  echo: boolean;
  wordlight: boolean;
  trailkeeper: boolean;
}

/** Earned from the saved adventure; language support remains available from the start. */
export function lanternRewards(progress: Pick<Progress, 'xp' | 'completedQuestIds'>): LanternRewards {
  const completed = new Set(progress.completedQuestIds.filter(id => quests.some(q => q.id === id)));
  const count = completed.size;
  return {
    title: completed.has('b1-atlas') ? 'Atlas Keeper' : count >= 12 ? 'Route Keeper' : count >= 6 ? 'Lamplighter' : count >= 1 ? 'Lantern Bearer' : 'Wanderer',
    crest: completed.has('b1-atlas') ? 'star' : count >= 12 ? 'silver' : count >= 6 ? 'leaf' : 'ember',
    echo: count >= 1,
    wordlight: count >= 3 && progress.xp >= 60,
    trailkeeper: count >= 6,
  };
}

export function lanternRewardsMarkup(progress: Progress): string {
  const rewards = lanternRewards(progress);
  return `<section class="lantern-rewards"><div class="earned-crest" data-crest="${rewards.crest}">${icon('lantern')}</div><div><span class="eyebrow">YOUR EARNED LANTERN</span><h3>${e(rewards.title)}</h3><p>Your crest grows with the routes you restore.</p></div><div class="lantern-powers"><article class="${rewards.echo ? 'earned' : ''}"><strong>${rewards.echo ? '✓ ' : ''}Echo</strong><small>${rewards.echo ? 'Hear a dialogue line more slowly.' : 'Restore the first clue to earn a slow echo.'}</small></article><article class="${rewards.wordlight ? 'earned' : ''}"><strong>${rewards.wordlight ? '✓ ' : ''}Wordlight</strong><small>${rewards.wordlight ? 'Light up all unfamiliar words in a line.' : 'Restore three clues and earn 60 XP to light unfamiliar words.'}</small></article><article class="${rewards.trailkeeper ? 'earned' : ''}"><strong>${rewards.trailkeeper ? '✓ ' : ''}Lamplighter crest</strong><small>${rewards.trailkeeper ? 'Your green crest marks the first restored town.' : 'Restore Lindenhafen to earn the green crest.'}</small></article></div></section>`;
}
