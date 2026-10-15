/**
 * What the page is doing in front of the world. Exactly one mode applies; only 'world' lets the player walk
 * and interact. The order of the checks in gameMode() is the precedence when several overlays coincide.
 */
export type GameMode =
  | 'booting'     // no session yet
  | 'blocked'     // play time used up or not yet confirmed
  | 'offline'     // the world connection is down
  | 'travelling'  // waiting for the server to confirm a new map
  | 'account'     // the account, paywall or billing dialog
  | 'cinematic'   // a story beat is playing
  | 'menu'        // a menu page covers the world
  | 'watching'    // the quiet camera tour
  | 'filters'     // the screen-filter panel
  | 'encounter'   // the encounter dialog (activities, mini-games, practice)
  | 'dialogue'    // a story conversation
  | 'delivery'    // a delivery run that is holding the player still
  | 'world';

export interface GameModeState {
  started: boolean;
  accessBlocked: boolean;
  connected: boolean;
  travelling: boolean;
  accountOpen: boolean;
  cinematic: boolean;
  menuOpen: boolean;
  watching: boolean;
  filtersOpen: boolean;
  encounterOpen: boolean;
  dialogueOpen: boolean;
  /** A delivery run is active and does not currently allow movement. */
  deliveryHolding: boolean;
}

export function gameMode(state: GameModeState): GameMode {
  if (!state.started) return 'booting';
  if (state.accessBlocked) return 'blocked';
  if (!state.connected) return 'offline';
  if (state.travelling) return 'travelling';
  if (state.accountOpen) return 'account';
  if (state.cinematic) return 'cinematic';
  if (state.menuOpen) return 'menu';
  if (state.watching) return 'watching';
  if (state.filtersOpen) return 'filters';
  if (state.encounterOpen) return 'encounter';
  if (state.dialogueOpen) return 'dialogue';
  if (state.deliveryHolding) return 'delivery';
  return 'world';
}
