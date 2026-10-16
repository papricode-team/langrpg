/** Shared persisted animal vocabulary, independent of rendering and editor code. */
export const animalSpecies = ['chicken', 'dog', 'cat', 'sheep'] as const;
export type AnimalSpecies = typeof animalSpecies[number];
export const animalVariants: Record<AnimalSpecies, readonly string[]> = {
  chicken: ['Ivory hen', 'Russet hen', 'Speckled hen'], dog: ['Golden retriever', 'Rusty village dog', 'Charcoal sheepdog'],
  cat: ['Ginger tabby', 'Fluffy calico', 'Tuxedo cat'], sheep: ['Ivory fleece', 'Brown fleece', 'Charcoal fleece'],
};
export interface AnimalSpawn { id: string; species: AnimalSpecies; variant: number; x: number; y: number; }
export const animalName = (animal: Pick<AnimalSpawn, 'species' | 'variant'>): string => animalVariants[animal.species][animal.variant];
