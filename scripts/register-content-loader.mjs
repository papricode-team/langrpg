/** Node's type stripper, with the same relative module/JSON resolution as Vite. */
import {registerHooks} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import ts from 'typescript';
const sourceRoot=fileURLToPath(new URL('../content/source/',import.meta.url));
const authoredModules=new Map(['content','expeditions','expedition-games','interiors','interior-conversations','word-detail','story','story-glossary','contextual-grammar','beginner-dialogue','cinematic-content','activity-engine','npc-dialogue','quest-graph','learning-context','i18n','i18n-units','i18n-course-coverage'].map(name=>[`${name}.ts`,`${name}.ts`]));
authoredModules.set('course.ts','course-runtime.ts');
function originalToolingSource(url){
  if(!url.startsWith('file:'))return;
  const path=fileURLToPath(url),marker='/web/src/',offset=path.lastIndexOf(marker);
  if(offset<0)return;
  const name=path.slice(offset+marker.length),snapshot=authoredModules.get(name);
  const jsonSources={'data/course.json':'course.json','data/dialogue-graphs.json':'dialogue-graphs.json','data/story-text.json':'story-text.json','data/expedition-learning.json':'expedition-learning.json','data/i18n/tr-story.json':'tr-story.json','data/i18n/tr-course.json':'tr-course.json','minigames/story-scripts.json':'minigame-stories.json'};
  if(jsonSources[name])return `export default JSON.parse(${JSON.stringify(readFileSync(resolve(sourceRoot,jsonSources[name]),'utf8'))});`;
  if(name==='data/course-meta.json'){
    const {exercises,...metadata}=JSON.parse(readFileSync(resolve(sourceRoot,'course.json'),'utf8'));
    return `export default ${JSON.stringify(metadata)};`;
  }
  const part=/^data\/course-exercises-(a1|a2|b1)\.json$/.exec(name);
  if(part){
    const source=JSON.parse(readFileSync(resolve(sourceRoot,'course.json'),'utf8')),indices=[],exercises=[];
    source.exercises.forEach((exercise,index)=>{if(exercise.level.toLowerCase()===part[1]){indices.push(index);exercises.push(exercise);}});
    return `export default ${JSON.stringify({indices,exercises})};`;
  }
  if(snapshot){const sourcePath=resolve(sourceRoot,snapshot);if(!existsSync(sourcePath))throw new Error(`Missing private authoring snapshot ${snapshot}.`);return ts.transpileModule(readFileSync(sourcePath,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;}
  if(name==='i18n-tr.ts'){
    const data={story:JSON.parse(readFileSync(resolve(sourceRoot,'tr-story.json'),'utf8')),course:JSON.parse(readFileSync(resolve(sourceRoot,'tr-course.json'),'utf8')),ui:JSON.parse(readFileSync(resolve(sourceRoot,'tr-ui.json'),'utf8'))};
    return `export const turkishOverlay=${JSON.stringify(data)};`;
  }
}
registerHooks({
  resolve(specifier,context,nextResolve) {
    if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')&&!context.parentURL.includes('/node_modules/')){
      const candidate=new URL(/\.ts$/.test(specifier)?specifier:`${specifier}.ts`,context.parentURL),path=fileURLToPath(candidate),marker='/web/src/',offset=path.lastIndexOf(marker);
      const snapshot=offset<0?undefined:authoredModules.get(path.slice(offset+marker.length));
      // A deleted browser module can still have a private authoring snapshot.
      if(snapshot&&existsSync(resolve(sourceRoot,snapshot)))return {url:candidate.href,shortCircuit:true};
    }
    if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')&&!context.parentURL.includes('/node_modules/')&&!/\.[a-z]+$/i.test(specifier)) {
      for(const extension of ['.ts','.js','.json']) {
        const url=new URL(specifier+extension,context.parentURL);
        if(existsSync(fileURLToPath(url)))return nextResolve(url.href,context);
      }
    }
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad) {
    // Authoring scripts deliberately see the private corpus at the original URL,
    // so relative helper imports resolve normally. Vite never installs this hook.
    const authored=originalToolingSource(url);
    if(authored!==undefined)return {format:'module',shortCircuit:true,source:authored};
    if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default JSON.parse(${JSON.stringify(readFileSync(fileURLToPath(url),'utf8'))});`};
    return nextLoad(url,context);
  },
});
