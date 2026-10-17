import type * as Phaser from 'phaser';

export const WORLD_UI = {
  promptKeycap: 'world-prompt-v2-keycap', promptTab: 'world-prompt-v2-tab', promptTouch: 'world-prompt-v2-touch',
  // Retained for the cinematic "Enter · Weiter" control in cutscene.ts only.
  prompt: 'world-prompt',
  ink: 'world-ink', threshold: 'world-threshold', ring: 'world-ring',
} as const;

// Texture managers are shared by scenes; loader queues are not. Reserve keys at
// enqueue time and let every consumer await the first owner's completion.
const pending = new WeakMap<Phaser.Textures.TextureManager, Map<string, Promise<void>>>();
export function loadWorldUi(load: Phaser.Loader.LoaderPlugin): Promise<void> {
  const textures = load.scene.textures;
  let requests = pending.get(textures);
  if (!requests) { requests = new Map(); pending.set(textures, requests); }
  const queue = (key: string, enqueue: () => void): Promise<void> => {
    if (textures.exists(key)) return Promise.resolve();
    const existing = requests!.get(key);
    if (existing) return existing;
    let resolve!: () => void;
    const result = new Promise<void>(done => { resolve = done; });
    requests!.set(key, result);
    const finish = () => {
      load.off('filecomplete', completed); load.off('complete', finish);
      load.scene.events.off('shutdown', finish);
      requests!.delete(key); resolve();
    };
    const completed = (completedKey: string) => { if (completedKey === key && textures.exists(key)) finish(); };
    load.on('filecomplete', completed); load.once('complete', finish);
    load.scene.events.once('shutdown', finish);
    enqueue();
    return result;
  };
  return Promise.all([
    ...Object.values(WORLD_UI).map(key => queue(key, () => { load.image(key, `/assets/ui/${key}.webp`); })),
    queue('world-held-items', () => { load.atlas('world-held-items', '/assets/minigames/items-2.webp', '/assets/minigames/items-2.json'); }),
  ]).then(() => {});
}

/** Wait for another scene's queue without enqueueing a failed request again. */
export function waitForWorldUi(textures: Phaser.Textures.TextureManager): Promise<void> {
  return Promise.all([...(pending.get(textures)?.values() ?? [])]).then(() => {});
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
