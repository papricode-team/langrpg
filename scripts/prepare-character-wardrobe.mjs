/** Prepare retained prompts and registered page selections for missing build options.
 * Generation is performed by ImageGen; this script never synthesizes artwork.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {missingWardrobeOptions} from './character-wardrobe-parity.mjs';

const root = resolve(import.meta.dirname, '..');
const hd = 'art/source/character-kit/hd';
const catalogue = JSON.parse(await readFile(resolve(root, hd, 'catalogue.json')));
let previous = {entries:[]};
try { previous = JSON.parse(await readFile(resolve(root,hd,'wardrobe-catalogue.json'))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const jobs = [];
const candidates = [];
for (const missing of missingWardrobeOptions(catalogue)) {
  const source = catalogue.entries.find(entry => entry.id === missing.sourceId);
  const retained = previous.entries.find(entry => entry.id === missing.id);
  if (retained) {
    candidates.push(retained);
    for (const [page,selection] of retained.authoring.pages.entries()) {
      jobs.push({id:retained.id,build:retained.build,slot:retained.slot,page,reference:selection.reference ?? selection.mapping.replace('.json','.png'),output:selection.path,prompt:selection.prompt});
    }
    continue;
  }
  // Full native frames preserve garment volume and all attachment landmarks.
  const group = ['face','markings','eyewear','facial-hair'].includes(source.slot) ? 'head' : ['hair','headwear'].includes(source.slot) ? 'head' : ['bottom','footwear'].includes(source.slot) ? 'lower' : 'full';
  const count = {head:4,lower:6,full:9}[group];
  const pages = [];
  for (let page = 0; page < count; page++) {
    const reference = `${hd}/references/body-${missing.build}-native-${group}/page-${page}.png`;
    const mapping = reference.replace('.png', '.json');
    const grid = JSON.parse(await readFile(resolve(root, mapping)));
    const name = `${missing.id}-page-${page}-candidate-1`;
    const promptPath = `${hd}/prompts/${name}.txt`;
    const output = `${hd}/candidates/${name}.png`;
    const prompt = `Use case: precise-object-edit. Asset type: native-resolution modular game wardrobe sprite page. Edit the supplied ${missing.build} mannequin reference. Preserve its exact ${grid.size.join('x')} layout, all ${grid.crops.length} cells, every pose, facing, figure scale, head and foot position, and exposed cyan #5a9a9a surfaces. ${source.prompt} Repaint the requested component at native resolution with crisp painterly detail matching the game. Keep the mannequin's ${missing.build} body proportions. Do not add other clothing, accessories, text, shadows or a border. Keep the pure white background. Change only the requested component. Output exactly ${grid.size.join('x')}.`;
    await mkdir(resolve(root, hd, 'prompts'), {recursive:true});
    // Preserve prompts of already generated candidates, including refinements.
    try { await readFile(resolve(root, promptPath)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(resolve(root, promptPath), prompt + '\n'); }
    pages.push({path:output,prompt:promptPath,mapping});
    jobs.push({id:missing.id,build:missing.build,slot:source.slot,page,reference,output,prompt:promptPath});
  }
  const entry = {...structuredClone(source),id:missing.id,build:missing.build,status:'candidate',candidate:`${hd}/${missing.id}-candidate.png`,locked:`${hd}/${missing.id}.png`,preparedCandidate:`${hd}/${missing.id}-candidate.png.json`,generationPrompt:pages[0].prompt,authoring:{kind:'native-repaint',pages}};
  delete entry.review;
  delete entry.sourceNotes;
  candidates.push(entry);
}
await writeFile(resolve(root,hd,'wardrobe-jobs.json'),JSON.stringify({version:1,jobs},null,2)+'\n');
await writeFile(resolve(root,hd,'wardrobe-candidates.json'),JSON.stringify(candidates,null,2)+'\n');
await writeFile(resolve(root,hd,'wardrobe-catalogue.json'),JSON.stringify({...catalogue,entries:[...catalogue.entries,...candidates]},null,2)+'\n');
console.log(`Prepared ${candidates.length} components across ${jobs.length} native pages. No catalogue approvals changed.`);
