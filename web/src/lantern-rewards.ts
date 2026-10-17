import type { Progress } from './api';
import { quests } from './content';
import { lastQuestOf } from './progression';
import { escapeHtml as e, icon } from './icons';
import { t } from './i18n';

export interface LanternRewards {
  title: string;
  crest: 'ember' | 'leaf' | 'silver' | 'star';
  trailkeeper: boolean;
}

/** Earned from the saved adventure; language support remains available from the start. */
export function lanternRewards(progress: Pick<Progress, 'xp' | 'completedQuestIds'>): LanternRewards {
  const completed = new Set(progress.completedQuestIds.filter(id => quests.some(q => q.id === id)));
  const count = completed.size;
  // Titles follow the acts, not a raw count: each town's finale earns the next one.
  const actOne = completed.has(lastQuestOf('A1')), actTwo = completed.has(lastQuestOf('A2'));
  return {
    title: completed.has('b1-atlas') ? 'Atlas Keeper' : actTwo ? 'Route Keeper' : actOne ? 'Lamplighter' : count >= 1 ? 'Lantern Bearer' : 'Wanderer',
    crest: completed.has('b1-atlas') ? 'star' : actTwo ? 'silver' : actOne ? 'leaf' : 'ember',
    trailkeeper: actOne,
  };
}

/** Earned titles stay English internally (they key resident greetings); this is their display label. */
export function titleLabel(title: string): string {
  switch (title) {
    case 'Atlas Keeper': return t('Atlas Keeper');
    case 'Route Keeper': return t('Route Keeper');
    case 'Lamplighter': return t('Lamplighter');
    case 'Lantern Bearer': return t('Lantern Bearer');
    case 'Wanderer': return t('Wanderer');
    default: return title;
  }
}

export function lanternRewardsMarkup(progress: Progress): string {
  const rewards = lanternRewards(progress);
  return `<section class="lantern-rewards"><div class="earned-crest" data-crest="${rewards.crest}">${icon('lantern')}</div><div><h3>${e(titleLabel(rewards.title))}</h3><p>${e(t('Your crest grows with the routes you restore.'))}</p></div><div class="lantern-powers"><article class="${rewards.trailkeeper ? 'earned' : ''}"><strong>${rewards.trailkeeper ? '✓ ' : ''}${e(t('Lamplighter crest'))}</strong><span class="caption">${e(rewards.trailkeeper ? t('Your green crest marks the first restored town.') : t('Restore Lindenhafen to earn the green crest.'))}</span></article></div></section>`;
}
