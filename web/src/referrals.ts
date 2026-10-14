import type { GameAccess } from './game-access';

type ReferralStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = 'atlas.pendingReferral';
const codePattern = /^[A-Za-z0-9_-]{8,64}$/;

export interface ReferralLink {
  url: string;
  bonusMinutes: number;
  successfulSignups: number;
  access: GameAccess;
}

/** Keep the first valid invite through anonymous play and reloads. */
export function captureReferral(storage: ReferralStorage, href: string): string | undefined {
  try {
    const url = new URL(href);
    const code = url.searchParams.get('ref') ?? '';
    if (!codePattern.test(code)) return;
    if (!pendingReferral(storage)) storage.setItem(key, code);
    url.searchParams.delete('ref');
    return url.href;
  } catch { /* Keep the original URL if this browser cannot persist attribution. */ }
}

export function pendingReferral(storage: Pick<Storage, 'getItem'>): string | undefined {
  try {
    const code = storage.getItem(key) ?? '';
    return codePattern.test(code) ? code : undefined;
  } catch { return; }
}

export function clearReferral(storage: Pick<Storage, 'removeItem'>): void {
  try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
}

export function referralAvailable(access: GameAccess | undefined): boolean {
  return !!access?.registered && access.phase === 'trial';
}
