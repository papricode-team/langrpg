import { walkPoseColumn } from './walk-animation';

// Faces are painted on the registration master's own head. More faces return
// as inpainted edits of that master (scripts/prepare-player-head-edits.mjs).
export const faceOptions = [['oval', 'Default']] as const;
export const hairOptions = [
 ['bald', 'No hair'], ['waves', 'Long waves'],
] as const;
export const jacketOptions = [['travel', 'Travel jacket']] as const;
export const bottomOptions = [['straight', 'Straight trousers']] as const;
// Builds need their own painted base sheets; stretching one body distorts it.
export const buildOptions = [['regular', 'Medium']] as const;
export type AvatarParts = { face: string; hairstyle: string; jacket: string; bottom: string; build: string; pants: string };
export const defaultParts: AvatarParts = { face: 'oval', hairstyle: 'waves', jacket: 'travel', bottom: 'straight', build: 'regular', pants: '#44464d' };
export const partOptions = { face: faceOptions, hairstyle: hairOptions, jacket: jacketOptions, bottom: bottomOptions, build: buildOptions };
export function normalizeParts(value: Partial<AvatarParts>): AvatarParts {
 const result = { ...defaultParts };
 for (const field of ['face', 'hairstyle', 'jacket', 'bottom', 'build'] as const) {
  if (partOptions[field].some(([id]) => id === value[field])) result[field] = value[field]!;
 }
 if (typeof value.pants === 'string' && /^#[0-9a-f]{6}$/i.test(value.pants)) result.pants = value.pants;
 return result;
}
export const buildWidth = (_build: string) => 1;
// One complete eight-pose cycle takes about 0.87s at normal outdoor speed.
export const MODULAR_ART = { width: 64, height: 96, bodyHeight: 71, previewWidth: 128, previewHeight: 192, footY: .9, columns: 9, rows: 4, frameCount: 36, worldHeight: 72, cycleDistance: 192 };
export function characterFrame(facing: number, phase?: number): number { return facing * 9 + (phase === undefined ? 0 : walkPoseColumn(phase)); }
export const partTextureKey = (kind: string, id: string) => `player-layer-${kind}${id ? '-'+id : ''}`;
export const modularAssets = [
 ...['bottom-detail','bottom-fabric','body-skin','jacket-detail','jacket-fabric'].map(id=>({id})),
 {id:'head-detail'},
 ...hairOptions.filter(([id])=>id!=='bald').map(([id])=>({id:`hair-${id}`})),
];
export const avatarColors = {
  skin: [ ['Porcelain', '#f5d9c6'], ['Ivory', '#edc8ad'], ['Peach', '#e4b494'], ['Sand', '#d6a07d'], ['Honey', '#c99167'], ['Golden', '#bb825a'], ['Warm brown', '#aa704c'], ['Copper', '#986240'], ['Umber', '#855338'], ['Deep brown', '#70452f'], ['Espresso', '#593626'], ['Ebony', '#40271e'] ],
  hair: [ ['Ink', '#242126'], ['Brown black', '#332822'], ['Dark brown', '#48372e'], ['Chestnut', '#694731'], ['Auburn', '#96543c'], ['Copper', '#b97040'], ['Golden blond', '#d4a85e'], ['Pale blond', '#edcf94'], ['Silver', '#babbb5'], ['White', '#e4e1d8'], ['Rose', '#b96382'], ['Plum', '#754581'], ['Ocean', '#417a98'], ['Forest', '#457768'] ],
  outfit: [ ['Teal', '#326a65'], ['Sage', '#7b8a64'], ['Forest', '#375546'], ['Navy', '#354d70'], ['Sky', '#6993b3'], ['Lavender', '#8c7eaa'], ['Plum', '#6e547e'], ['Wine', '#854a5b'], ['Terracotta', '#ab5e51'], ['Sunflower', '#b38b3f'], ['Rose', '#c2959d'], ['Clay', '#c2957a'], ['Cream', '#d4c7aa'], ['Charcoal', '#3a3d42'], ['Rust', '#915438'], ['Mint', '#8ab0a1'] ],
} satisfies Record<'skin' | 'hair' | 'outfit', string[][]>;
