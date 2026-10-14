import type { Plugin } from 'vite';

export const uiLayout: Readonly<{ phone: 600; tablet: 1000; landscapeShort: 520 }>;
export const uiMedia: Readonly<Record<'--phone' | '--above-phone' | '--tablet' | '--desktop' | '--short-landscape' | '--above-short', string>>;
export function resolveUiMedia(source: string): string;
export function uiLayoutPlugin(): Plugin;
