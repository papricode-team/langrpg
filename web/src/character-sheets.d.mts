export interface CharacterSheetPage { path:string; sha256:string; firstFrame:number; frameCount:number; columns:number; }
export type CharacterMaterialSheet = { runtime:string; editor:string; runtimeSha256:string; editorSha256:string } | { runtimePages:CharacterSheetPage[]; editorPages:CharacterSheetPage[] };
export function characterSheetPages(sheet:CharacterMaterialSheet, resolution:'runtime'|'editor', cell:number[], frames?:number[]):(CharacterSheetPage & {width:number;height:number})[];
