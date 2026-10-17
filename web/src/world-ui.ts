import type * as Phaser from 'phaser';

export const WORLD_UI = { prompt: 'world-prompt', ink: 'world-ink', threshold: 'world-threshold', ring: 'world-ring' } as const;

/** Small untiered textures: their native pixels already exceed their largest play size. */
export function loadWorldUi(load: Phaser.Loader.LoaderPlugin): void {
  for (const key of Object.values(WORLD_UI)) if (!load.scene.textures.exists(key)) load.image(key, `/assets/ui/${key}.webp`);
  if (!load.scene.textures.exists('world-held-items')) load.atlas('world-held-items', '/assets/minigames/items-2.webp', '/assets/minigames/items-2.json');
}

export const HELD_ITEM_FRAMES: Readonly<Record<string, string>> = {
  parcel: 'item-paket-noun', book: 'item-buch-noun', tool: 'item-schere-noun',
};

/** Fade on the scene clock so a paused or abandoned scene cannot switch in the background. */
export function fadeWorldOut(scene: Phaser.Scene, reduced: boolean, complete: () => void): Phaser.Time.TimerEvent | undefined {
  if (reduced) { complete(); return; }
  scene.cameras.main.fadeOut(160, 29, 35, 30);
  return scene.time.delayedCall(160, complete);
}
