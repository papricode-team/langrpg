import {expect,it,vi} from 'vitest';
import {characterSheetPages} from './character-sheets.mjs';
import {avatarFramePixels,bakeAvatarPixels} from './avatar-baker';
import {characterCatalogue,normalizeAvatar} from './character-recipe.mjs';
import type {CharacterCatalogue} from './character-recipe.mjs';
import {composeFrame} from './character-compositor.mjs';

const pages=Array.from({length:9},(_,i)=>({path:`page-${i}.webp`,sha256:'test',firstFrame:i*4,frameCount:4,columns:2}));
const sheet={runtimePages:pages,editorPages:pages};
it('validates complete page coverage before selecting the requested frame',()=>{
  expect(characterSheetPages(sheet,'editor',[512,768],[27])).toEqual([{...pages[6],width:1024,height:1536}]);
  expect(()=>characterSheetPages({...sheet,editorPages:pages.slice(1)},'editor',[512,768],[27])).toThrow('36 frames');
  expect(()=>characterSheetPages({...sheet,editorPages:[...pages,pages[0]]},'editor',[512,768],[27])).toThrow('Overlapping');
});
it('decodes one four-frame page for a preview and preserves all 36 frames across page and facing boundaries',async()=>{
  const body=characterCatalogue.components.find(piece=>piece.id==='body-regular')!;
  const catalogue:CharacterCatalogue={...characterCatalogue,assetBase:'/test/',poseSets:undefined,expressions:undefined,components:[{...body,materials:['detail'],tints:{detail:null},sheets:{detail:sheet}}],format:{...characterCatalogue.format,runtimeCell:[2,3],editorCell:[2,3]}};
  const recipe=normalizeAvatar({},catalogue);for(const slot of Object.keys(recipe.parts))recipe.parts[slot]=null;
  const loadSheet=vi.fn(async(url:string,width:number,height:number)=>{
    const page=Number(/page-(\d+)/.exec(url)![1]),data=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=(y*width+x)*4;data[p]=page*4+Math.floor(y/3)*2+Math.floor(x/2)+1;data[p+3]=255;
    }
    return{data,width,height};
  });
  const frame=await avatarFramePixels(recipe,27,{catalogue,preview:true,loadSheet});
  expect(loadSheet).toHaveBeenCalledTimes(1);expect(loadSheet.mock.calls[0].slice(1)).toEqual([4,6]);expect(frame.data[0]).toBe(28);
  loadSheet.mockClear();
  const atlas=await bakeAvatarPixels(recipe,{catalogue,preview:true,loadSheet});
  expect(loadSheet).toHaveBeenCalledTimes(9);
  for(let n=0;n<36;n++){
    const pixels=composeFrame([{id:'atlas',materials:['detail'],tints:{detail:0xffffff}}],new Map([['atlas.detail',atlas]]),n,2,3);
    for(let p=0;p<pixels.length;p+=4)expect([...pixels.subarray(p,p+4)]).toEqual([n+1,0,0,255]);
  }
});
