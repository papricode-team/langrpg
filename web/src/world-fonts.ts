import * as Phaser from 'phaser';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/600.css';

export const WORLD_TITLE_FONT = 'Fraunces, serif';
export const WORLD_LABEL_FONT = '"DM Sans", sans-serif';
let loading: Promise<void> | undefined;

/** Explicit requests start the faces even before the first canvas label needs them. */
export function loadWorldFonts(): Promise<void> {
  if (!loading) loading = typeof document === 'undefined' || !document.fonts ? Promise.resolve() :
    Promise.all(['400 16px Fraunces', '600 16px Fraunces', '400 16px "DM Sans"', '700 16px "DM Sans"']
      .map(face => document.fonts.load(face))).then(() => document.fonts.ready).then(() => {}).catch(() => {});
  return loading;
}

/** Directly opened tools and overlay scenes may draw before Boot; refresh their canvas text once. */
export function refreshWorldFonts(scene: Phaser.Scene): void {
  let alive = true;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { alive = false; });
  void loadWorldFonts().then(() => {
    if (!alive) return;
    const refresh = (objects: Phaser.GameObjects.GameObject[]) => {
      for (const object of objects) {
        if (object instanceof Phaser.GameObjects.Text) object.style.update(true);
        if (object instanceof Phaser.GameObjects.Container) refresh(object.list);
      }
    };
    refresh(scene.children.list);
  });
}
