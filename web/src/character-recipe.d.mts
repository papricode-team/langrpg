export type Facing = 'down' | 'right' | 'up' | 'left';
export interface AvatarRecipe {
  v: 2; build: string; skin: string; hair: string;
  parts: Record<string, string | null>;
  colors: Record<string, string>;
}
export interface CharacterComponent {
  id: string; optionId: string; slot: string; build: string; label: string; labelKey: string;
  poseSet?: string;
  expression?: string;
  materials: string[]; tints: Record<string, string | null>;
  occupies: string[]; hides: string[]; excludes: string[]; covers: Record<string, string>;
  zOrder: { default: number } & Partial<Record<Facing, number>>;
  sheets: Record<string, import('./character-sheets.mjs').CharacterMaterialSheet>;
  thumbnail: string; sourceSha256: string;
}
export interface CharacterCatalogue {
  schemaVersion: number; recipeVersion: number; assetVersion: string; assetBase: string;
  poseSet?: string;
  expression?: string;
  expressions?: Record<string, {label:string; components:CharacterComponent[]}>;
  format: { columns: number; rows: number; frames: number; runtimeCell: number[]; editorCell: number[]; luminanceReference: number };
  builds: string[]; colorKeys: string[]; defaultColors: Record<string, string>;
  slots: { id: string; label: string; labelKey: string; optional: boolean; tab: string; defaultOption?: string; zOrder: { default: number } & Partial<Record<Facing, number>> }[];
  components: CharacterComponent[];
  poseSets?: Record<string, { label: string; rowDescription: string; frameDurations: number[]; requiredParts?: Record<string,string>; builds: string[]; components: CharacterComponent[] }>;
}
export type ResolvedComponent = Omit<CharacterComponent, 'tints'> & { tints: Record<string, number>; z: number };
export const characterCatalogue: CharacterCatalogue;
export function catalogueForPose(poseSet?: string, catalogue?: CharacterCatalogue): CharacterCatalogue;
export function catalogueForExpression(recipe: AvatarRecipe, expression?: string, catalogue?: CharacterCatalogue): CharacterCatalogue;
export function availableFaceExpressions(recipe: AvatarRecipe, catalogue?: CharacterCatalogue): string[];
export function normalizeAvatar(value: unknown, catalogue?: CharacterCatalogue): AvatarRecipe;
export function recipeErrors(recipe: unknown, catalogue?: CharacterCatalogue): string[];
export function resolveRecipe(recipe: AvatarRecipe, facing?: Facing, catalogue?: CharacterCatalogue): {
  layers: ResolvedComponent[]; disabled: Record<string, { reason: 'occupied' | 'excluded'; by: string }>;
  hidden: string[]; overlaps: { by: string; slot: string; coverage: string }[];
};
export function avatarTextureKey(recipe: AvatarRecipe, catalogue?: CharacterCatalogue): string;
