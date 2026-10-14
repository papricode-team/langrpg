import type { Plugin } from 'vite';
export function identifierIndex(ids: Record<string, string>): Map<string, string>;
export function rewriteContentIdentifiers(code: string, filename: string, ids: Record<string, string> | Map<string, string>): string;
export function contentIdentifiersPlugin(root: string): Plugin;
