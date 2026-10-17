import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import {animalSpawns} from './animal-spawns';
import {getWorldScene} from './scene-data';
import type { MapPoint, NavigationGrid, NavigationView } from './navigation';
import { advanceAnimal, animalAction, createAnimal, interactWithAnimal, type AnimalBody } from './animal-behavior';
import { ANIMAL_FRAME, animalTextureKey, animalWorldScale, animalArtFrame } from './animal-art';
import { createContactShadow } from './character-art';
import { worldDepth, setDepthIfChanged } from './world-depth';
import { t } from './i18n';

interface AnimalActor {
  id: string;
  body: AnimalBody;
  variant: number;
  root: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Image;
  effect: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Zone;
  hovered: boolean;
}
/** Local ambient life: no account, reward or network entity is created by petting. */
export class WorldAnimals {
  private actors: AnimalActor[] = [];
  constructor(scene: Phaser.Scene, mapId: MapId, navigation: NavigationGrid, spawn: MapPoint,
    bind: (hit: Phaser.GameObjects.Zone, target: { hovered: boolean }, activate: () => void) => void,
    approach: (id: string) => void) {
    createContactShadow(scene);
    for (const [index, spec] of animalSpawns(getWorldScene(mapId), navigation).entries()) {
      const {species, variant} = spec;
      if (!scene.textures.exists(animalTextureKey(species, mapId))) continue;
      const point = navigation.closestPoint(spec.x, spec.y, spawn);
      const id = `animal:${species}:${spec.id}`;
      const body = createAnimal(species, point, (index % 12) * .6);
      const figure = scene.add.image(0, 0, animalTextureKey(species, mapId), `${variant}-idle-0`).setOrigin(.5, ANIMAL_FRAME.footY / ANIMAL_FRAME.height).setScale(animalWorldScale[species]);
      const effect = scene.add.graphics();
      const hit = scene.add.zone(0, -23, 70, 56).setInteractive({ useHandCursor: true });
      const shadow = scene.add.image(0, 1, 'character-shadow').setDisplaySize(species === 'chicken' ? 22 : 36, species === 'chicken' ? 9 : 14);
      const root = scene.add.container(point.x, point.y, [shadow, figure, effect, hit]);
      // Labels stay out of the flipped body container and above nearby scenery.
      const label = scene.add.text(point.x, point.y - 61, '', { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#fff3d6', backgroundColor: '#293c32', padding: { x: 8, y: 5 }, align: 'center' }).setOrigin(.5, 1).setVisible(false);
      const actor = { id, body, variant, root, figure, effect, label, hit, hovered: false };
      bind(hit, actor, () => approach(id)); this.actors.push(actor);
    }
  }
  position(id: string): AnimalBody | undefined { return this.actors.find(actor => actor.id === id)?.body; }
  nearest(player: MapPoint, maximum: number): { id: string; x: number; y: number } | undefined {
    let nearest: { id: string; x: number; y: number } | undefined;
    for (const actor of this.actors) {
      if (!actor.root.visible) continue;
      const distance = Math.hypot(actor.body.x - player.x, actor.body.y - player.y);
      if (distance < maximum) { maximum = distance; nearest = { id: actor.id, x: actor.body.x, y: actor.body.y }; }
    }
    return nearest;
  }
  interact(id: string, player: MapPoint): void {
    const animal = this.position(id);
    if (animal) interactWithAnimal(animal, player);
  }
  update(seconds: number, navigation: NavigationGrid, player: MapPoint, view: NavigationView, hour: number,
    labelScale: number, density: number, tint: number, reducedMotion: boolean, hidden: boolean, interactive: boolean, selected?: string): void {
    const focused = interactive ? this.nearest(player, 120)?.id : undefined;
    for (const actor of this.actors) {
      const a = actor.body;
      advanceAnimal(a, seconds, navigation, interactive || selected === actor.id ? player : undefined, hour < 6 || hour >= 18);
      // Hold click targets still even when the player starts farther away.
      if (selected === actor.id && a.state === 'walk' && !a.retreat && !a.returning) { a.state = 'idle'; a.remaining = 2; }
      const visible = !hidden && a.x > view.x - 100 && a.x < view.right + 100 && a.y > view.y - 100 && a.y < view.bottom + 100;
      actor.root.setVisible(visible).setPosition(a.x, a.y);
      actor.label.setVisible(false);
      if (!visible) continue;
      setDepthIfChanged(actor.root, worldDepth(a.y, 'character'));
      actor.figure.setFrame(animalArtFrame(a, actor.variant, reducedMotion)).setFlipX(a.facing < 0).setTint(tint);
      const reaction = a.state === 'feed' || a.state === 'happy' || a.state === 'annoyed';
      if (interactive && (reaction || actor.hovered || actor.id === focused)) {
        actor.label.setText(a.state === 'feed' ? t('Peck, peck!') : a.state === 'happy' ? t('That feels nice!') : a.state === 'annoyed' || a.retreat ? t('Not now. Give me space!') : a.cooldown > 0 ? t('A little rest…') : animalAction(a.species));
        actor.label.setPosition(a.x, a.y - 76 * animalWorldScale[a.species] - 10).setScale(labelScale).setVisible(true);
        if (actor.label.style.resolution !== density) actor.label.setResolution(density);
        setDepthIfChanged(actor.label, worldDepth(navigation.height + 100, 'label'));
      }
      const effect = actor.effect; effect.clear();
      if (a.state === 'feed') {
        effect.fillStyle(0xdfb66a);
        for (let seed = 0; seed < 7; seed++) if (seed / 7 > a.stateTime / 5) effect.fillEllipse(a.facing * (14 + seed * 3), 1 + seed % 3 * 3, 3, 2);
      }
    }
  }
  setVisible(visible: boolean): void { for (const actor of this.actors) { actor.root.setVisible(visible); actor.label.setVisible(false); } }
  destroy(): void { for (const actor of this.actors) { actor.root.destroy(); actor.label.destroy(); } this.actors = []; }
}
