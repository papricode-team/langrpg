import { trainFraming } from './world-cinematic';
import { WORLD_UI } from './world-ui';
import { WORLD_TITLE_FONT, WORLD_LABEL_FONT, refreshWorldFonts } from './world-fonts';
import * as Phaser from 'phaser';
import type { MapId } from './maps';
import { cinematicBeats,type CutsceneKind,type CameraBeat,type Beat } from './cinematic-content';
export {cinematicBeats,type CutsceneKind,type CameraBeat} from './cinematic-content';
/** Whether a story beat was shown. A skipped beat (no town to show it over) has not been seen. */
export type CutsceneOutcome='played'|'skipped';
import { baseLanguage, localizedName, translatedText } from './i18n';
import { getWorldScene } from './scene-data';
import { stageBeats, stationStage } from './cinematic-staging';
import { readWorld } from './world-state';

/** A real transparent Phaser scene above the live world; keyboard/click skippable. */
export class CutsceneScene extends Phaser.Scene {
  private beats: readonly Beat[] = [];
  private index = 0;
  private typing?: Phaser.Time.TimerEvent;
  private advance?: Phaser.Time.TimerEvent;
  private line?: Phaser.GameObjects.Text;
  private speaker?: Phaser.GameObjects.Text;
  /** A support-language subtitle under the German, only where English support does not show one either. */
  private subtitle?: Phaser.GameObjects.Text;
  private finish?: () => void;
  private dialogue?: Phaser.GameObjects.Container;
  private changing = false;
  private kind:CutsceneKind='arrival';
  constructor(private cameraBeat: (beat: CameraBeat | undefined) => void,private voice?:(speaker:string,german:string,clipId:string)=>void) { super({ key: 'cinematic' }); }
  /** Reduced motion keeps the story: lines appear whole, the camera cuts instead of panning and no train passes. */
  private reduced=false;
  init(): void {
    this.beats = []; this.index = 0; this.typing = undefined; this.advance = undefined;
    this.line = this.speaker = this.subtitle = undefined; this.dialogue = undefined;
    this.finish = undefined; this.changing = false; this.reduced = false;
  }
  create(data: {kind:CutsceneKind;mapId:MapId;ending?:string;reduced?:boolean;complete:()=>void}) {
    refreshWorldFonts(this);
    this.beats = stageBeats(data.kind,cinematicBeats(data.kind,data.mapId,data.ending),stationStage(getWorldScene(data.mapId))); this.index = 0; this.finish = data.complete;
    this.kind=data.kind; this.reduced=!!data.reduced;
    const {width,height} = this.scale, density = readWorld(this.registry, 'density') ?? 1;
    if(!this.reduced&&['arrival','travel'].includes(data.kind)&&this.textures.exists('greenhouse-train')){
      const source = this.textures.get('greenhouse-train').getSourceImage() as HTMLImageElement;
      const size = trainFraming(source.naturalWidth || source.width, source.naturalHeight || source.height, width, height, density);
      const train=this.add.image(width*.5,height*.48,'greenhouse-train').setDisplaySize(size.width,size.height);
      this.tweens.add({targets:train,x:width+size.width/2,duration:data.kind==='arrival'?6000:3000,ease:'Sine.easeInOut'});
    }
    const top = this.add.rectangle(0, this.reduced ? 0 : -68*density, width, 68*density, 0x08110e, .88).setOrigin(0);
    const bottom = this.add.rectangle(0, this.reduced ? height-156*density : height, width, 156*density, 0x08110e, .92).setOrigin(0);
    if (!this.reduced) {
      this.tweens.add({targets:top, y:0, duration:400, ease:'Sine.easeOut'});
      this.tweens.add({targets:bottom, y:height-156*density, duration:400, ease:'Sine.easeOut'});
    }
    this.speaker = this.add.text(width*.08,height-126*density,'',{fontFamily:WORLD_TITLE_FONT,fontSize:`${15*density}px`,color:'#e8cb89'});
    this.line = this.add.text(width*.08,height-98*density,'',{fontFamily:WORLD_TITLE_FONT,fontSize:`${22*density}px`,color:'#fff3da',wordWrap:{width:width*.84}});
    this.subtitle = baseLanguage()==='en' ? undefined : this.add.text(width*.08,height-34*density,'',{fontFamily:WORLD_TITLE_FONT,fontSize:`${14*density}px`,color:'#e4dcc8',fontStyle:'italic',wordWrap:{width:width*.84}});
    this.dialogue = this.add.container(0, 0, [this.speaker, this.line, ...(this.subtitle ? [this.subtitle] : [])]);
    const plate = this.add.image(width*.92-106*density, 33*density, WORLD_UI.prompt).setDisplaySize(212*density, 58*density);
    this.add.text(plate.x-77*density,plate.y,'E',{fontFamily:WORLD_LABEL_FONT,fontSize:`${12*density}px`,fontStyle:'bold',color:'#30281b'}).setOrigin(.5);
    this.add.text(plate.x+18*density,plate.y,'ENTER · WEITER',{fontFamily:WORLD_LABEL_FONT,fontSize:`${12*density}px`,color:'#fff1cf'}).setOrigin(.5);
    this.input.on('pointerdown',()=>this.next());
    this.input.keyboard?.on('keydown', (event:KeyboardEvent) => { if(event.code==='Escape')this.complete(); else if(['Enter','KeyE','Space'].includes(event.code))this.next(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{ this.cameraBeat(undefined); const done=this.finish;this.finish=undefined;done?.(); });
    this.present();
  }
  /** Each beat types its line on the scene clock and advances after its authored length; both pause with the scene. */
  private present() {
    const beat=this.beats[this.index];
    if (!beat) { this.complete(); return; }
    if (!this.reduced && this.dialogue) {
      this.dialogue.setAlpha(0);
      this.tweens.add({targets:this.dialogue, alpha:1, duration:180, ease:'Sine.easeOut'});
    }
    this.typing?.remove(); this.advance?.remove();
    this.speaker?.setText(localizedName(beat.speaker==='Inspector'?'Inspector Voss':beat.speaker));this.line?.setText('');
    this.subtitle?.setText(translatedText({german:beat.german,english:''})??'');this.cameraBeat(beat);
    this.voice?.(beat.speaker.toLowerCase(),beat.german,beat.clipId??`cinematic-${this.kind}-${this.index}`);
    let shown=0;
    if(this.reduced)this.line?.setText(beat.german);
    else this.typing=this.time.addEvent({delay:25,repeat:Math.max(0,beat.german.length-1),callback:()=>this.line?.setText(beat.german.slice(0,++shown))});
    this.advance=this.time.delayedCall(beat.seconds*1000,()=>this.next());
  }
  private next() {
    if (this.changing) return;
    this.typing?.remove(); this.advance?.remove();
    if (this.index + 1 >= this.beats.length) { this.complete(); return; }
    if (this.reduced) { ++this.index; this.present(); return; }
    this.changing = true;
    this.tweens.killTweensOf(this.dialogue!);
    // Finish erasing the previous beat before changing any of its text.
    this.tweens.add({targets:this.dialogue, alpha:0, duration:180, ease:'Sine.easeIn', onComplete:() => {
      ++this.index; this.changing = false; this.present();
    }});
  }
  private complete() { this.scene.stop(); }
}
