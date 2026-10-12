import type { Plugin } from 'vite';
export function gameDistributionPlugin(root: string): Plugin;
export const legacyMapPlates: readonly string[];
export function optimizeGameDistribution(options?: {root?: string;outputDir?: string}): Promise<{saved:number;plates:{asset:string;width:number;height:number;before:number;after:number}[]}>;
