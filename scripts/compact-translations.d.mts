import type {Plugin} from 'vite';
export function packTranslationJSON(value:unknown):string;
export function unpackTranslationJSON(encoded:string):unknown;
export function translationModule(value:unknown):string;
export function compactTranslationsPlugin(root:string):Plugin;
