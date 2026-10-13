export interface PixelSheet { data: Uint8Array | Uint8ClampedArray; width: number; height: number; }
export interface PixelLayer { id: string; materials: string[]; tints: Record<string, number>; }
export function combineMaterials(materials: { data: Uint8Array | Uint8ClampedArray; tint?: number }[]): Uint8ClampedArray<ArrayBuffer>;
export function over(target: Uint8ClampedArray, source: Uint8Array | Uint8ClampedArray): Uint8ClampedArray;
export function composeFrame(layers: PixelLayer[], images: Map<string, PixelSheet>, frame: number, cellWidth: number, cellHeight: number, columns?: number): Uint8ClampedArray<ArrayBuffer>;
export function composeAtlas(facings: PixelLayer[][], images: Map<string, PixelSheet>, cellWidth: number, cellHeight: number): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
