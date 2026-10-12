/** Lossless production transport: authored overlays remain readable JSON. */
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const CLEAR=256,MAX_CODE=65535;
/** Fixed-width UTF-8 LZW keeps its decoder small and independent of browser codecs. */
export function packTranslationJSON(value){
 const bytes=Buffer.from(JSON.stringify(value),'utf8'),codes=[];
 let dictionary,nextCode;
 const reset=()=>{dictionary=new Map(Array.from({length:256},(_,index)=>[String.fromCharCode(index),index]));nextCode=257;};
 reset();let previous='';
 for(const byte of bytes){
  const character=String.fromCharCode(byte),combined=previous+character;
  if(dictionary.has(combined)){previous=combined;continue;}
  codes.push(dictionary.get(previous));
  if(nextCode<=MAX_CODE)dictionary.set(combined,nextCode++);else{codes.push(CLEAR);reset();}
  previous=character;
 }
 if(previous)codes.push(dictionary.get(previous));
 const output=Buffer.alloc(codes.length*2);codes.forEach((code,index)=>output.writeUInt16BE(code,index*2));
 return output.toString('base64');
}
/** Self-contained: this function is embedded into the lazily loaded browser module. */
export function unpackTranslationJSON(encoded){
 const binary=atob(encoded);if(binary.length%2)throw new Error('Invalid packed translation stream.');
 let dictionary,previous='';const output=[];
 const reset=()=>{dictionary=Array.from({length:256},(_,index)=>String.fromCharCode(index));dictionary.push('');previous='';};reset();
 for(let offset=0;offset<binary.length;offset+=2){
  const code=(binary.charCodeAt(offset)<<8)|binary.charCodeAt(offset+1);
  if(code===256){reset();continue;}
  let entry=dictionary[code];
  if(entry===undefined){if(code===dictionary.length&&previous)entry=previous+previous[0];else throw new Error('Invalid packed translation code.');}
  output.push(entry);
  if(previous&&dictionary.length<=65535)dictionary.push(previous+entry[0]);
  previous=entry;
 }
 const bytes=Uint8Array.from(output.join(''),character=>character.charCodeAt(0));
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function translationModule(value){return `export default (${unpackTranslationJSON.toString()})(${JSON.stringify(packTranslationJSON(value))});`;}
/** Only production imports of the three authored Turkish overlays are replaced. */
export function compactTranslationsPlugin(root){
 const sources=new Set(['tr-course.json','tr-story.json','tr-ui.json'].map(name=>resolve(root,'web/src/data/i18n',name))),prefix='\0atlas-packed-translation:';
 return {name:'atlas-compact-translations',apply:'build',enforce:'pre',
  resolveId(source,importer){if(!importer||!source.endsWith('.json'))return null;const path=resolve(dirname(importer.split('?')[0]),source);return sources.has(path)?`${prefix}${path}.mjs`:null;},
  async load(id){if(!id.startsWith(prefix))return null;const path=id.slice(prefix.length,-4);if(!sources.has(path))throw new Error('Unknown packed translation source.');const data=JSON.parse(await readFile(path,'utf8'));return {code:translationModule(data),map:null};}
 };
}
