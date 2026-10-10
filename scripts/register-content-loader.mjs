/** Node's type stripper, with the same relative module/JSON resolution as Vite. */
import {registerHooks} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({
  resolve(specifier,context,nextResolve) {
    if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')&&!/\.[a-z]+$/i.test(specifier)) {
      for(const extension of ['.ts','.js','.json']) {
        const url=new URL(specifier+extension,context.parentURL);
        if(existsSync(fileURLToPath(url)))return nextResolve(url.href,context);
      }
    }
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad) {
    if(url.startsWith('file:')&&url.endsWith('.json'))return {format:'module',shortCircuit:true,source:`export default JSON.parse(${JSON.stringify(readFileSync(fileURLToPath(url),'utf8'))});`};
    return nextLoad(url,context);
  },
});
