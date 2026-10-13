import {afterEach,expect,it,vi} from 'vitest';
import {LevelEditorCanvas} from './level-editor-canvas';
import type {WorldScene} from './scene-schema';

vi.mock('phaser',()=>({default:{Scene:class {}}}));
afterEach(()=>vi.unstubAllGlobals());

it('includes an unused manifest storefront and thumbnails its native base instead of the legacy atlas',()=>{
  const drawImage=vi.fn(),source={id:'native-inn-image'};
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({drawImage}),toDataURL:()=> 'data:image/png;base64,native'})});
  const frame=(width:number,height:number,image:unknown)=>({width,height,cutWidth:width,cutHeight:height,cutX:4,cutY:4,source:{image}});
  const atlas={tree:frame(300,300,{id:'legacy-tree'}),'house-1':frame(200,240,{id:'undersized-house'})};
  const native={'inn-painted-base':frame(1248,1163,source)};
  const pages:Record<string,Record<string,ReturnType<typeof frame>>>={'lindenhafen-props':atlas,'native-inn':native};
  const world:WorldScene={id:'lindenhafen',width:1600,height:1200,coordinateVersion:1,spawn:{x:100,y:100},npcs:[],objects:[],scenery:[],walkable:[],obstacles:[],terrain:[],districts:[]};
  const scene={world,period:'day',cache:{json:{get:()=>({assets:{'house-inn':{key:'unused-legacy',frames:['unused-frame'],referenceWidth:1248,
    base:{key:'native-inn',frame:'inn-painted-base'}}}})}},textures:{
      exists:(key:string)=>!!pages[key],get:(key:string)=>({has:(name:string)=>!!pages[key]?.[name],getFrameNames:()=>Object.keys(pages[key])}),
      getFrame:(key:string,name:string)=>pages[key][name],
    }} as unknown as LevelEditorCanvas;
  const palette=LevelEditorCanvas.prototype.palette.call(scene);
  expect(palette.map(item=>item.frame)).toEqual(['house-inn','tree']);
  expect(palette[0]).toMatchObject({asset:'house',width:216.33,thumbnail:'data:image/png;base64,native'});
  expect(drawImage.mock.calls.some(call=>call[0]===source&&call[1]===4&&call[2]===4&&call[3]===1248&&call[4]===1163)).toBe(true);
});
