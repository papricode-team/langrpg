import { createScreenFilter } from './screen-filters';
import { worldGrade } from './world-grade';
/** Local MCP preview, supplied by the headless renderer; no world mutations or game session. */
import * as Phaser from 'phaser';
import type {InteriorSpec} from './interiors';
import {WorldInterior} from './world-interior';
import {loadInteriorAssets} from './interior-scene';

declare global {
  interface Window {
    __ROOM_SPEC__?:InteriorSpec;
    __ROOM_VIEW__?:{ready?:boolean;error?:string};
  }
}
const spec=window.__ROOM_SPEC__;
if(import.meta.env.DEV && spec) {
  const current=spec;
  class Preview extends Phaser.Scene {
    private room?:WorldInterior;
    init(){this.room=undefined;window.__ROOM_VIEW__={};}
    preload(){loadInteriorAssets(this.load,current);this.load.on('loaderror',()=>{window.__ROOM_VIEW__={error:'Room artwork could not load.'};});}
    create(){
      if(window.__ROOM_VIEW__?.error)return;
      try {
        createScreenFilter(this)?.setGrade(worldGrade('lindenhafen', 12, true));
        this.room=new WorldInterior(this,current);this.room.setReducedMotion(true);
        this.cameras.main.centerOn(current.width/2,current.height/2);
        this.room.update(0,{x:0,y:0,right:current.width,bottom:current.height});
        this.events.once('postupdate',()=>{window.__ROOM_VIEW__={ready:true};});
        this.events.once('shutdown',()=>this.room?.destroy());
      }catch(error){window.__ROOM_VIEW__={error:String(error)};}
    }
  }
  new Phaser.Game({type:Phaser.AUTO,width:current.width,height:current.height,scene:Preview,banner:false,render:{antialias:true,roundPixels:false,mipmapFilter:'LINEAR_MIPMAP_LINEAR'},audio:{noAudio:true}});
}
