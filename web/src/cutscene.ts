import * as Phaser from 'phaser';
import type { MapId } from './maps';
import { cinematicBeats,type CutsceneKind,type CameraBeat,type Beat } from './cinematic-content';
export {cinematicBeats,type CutsceneKind,type CameraBeat} from './cinematic-content';
import { baseLanguage, localizedName, translatedText } from './i18n';

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
  private kind:CutsceneKind='arrival';
  constructor(private cameraBeat: (beat: CameraBeat | undefined) => void,private voice?:(speaker:string,german:string,clipId:string)=>void) { super({ key: 'cinematic' }); }
  create(data: {kind:CutsceneKind;mapId:MapId;ending?:string;complete:()=>void}) {
    this.beats = cinematicBeats(data.kind,data.mapId,data.ending); this.index = 0; this.finish = data.complete;
    this.kind=data.kind;
    const {width,height} = this.scale, density = Math.min(2, window.devicePixelRatio || 1);
    if(['arrival','travel'].includes(data.kind)&&this.textures.exists('greenhouse-train')){
      const train=this.add.image(-width*.4,height*.52,'greenhouse-train').setDisplaySize(width*.92,width*.92*1024/1536);
      this.tweens.add({targets:train,x:width*1.4,duration:data.kind==='arrival'?6000:3000,ease:'Sine.easeInOut'});
    }
    const bars = this.add.graphics().fillStyle(0x08110e,.88);
    bars.fillRect(0,0,width,68*density).fillRect(0,height-140*density,width,140*density);
    this.speaker = this.add.text(width*.08,height-126*density,'',{fontFamily:'Georgia, serif',fontSize:`${15*density}px`,color:'#e8cb89'});
    this.line = this.add.text(width*.08,height-98*density,'',{fontFamily:'Georgia, serif',fontSize:`${22*density}px`,color:'#fff3da',wordWrap:{width:width*.84}});
    this.subtitle = baseLanguage()==='en' ? undefined : this.add.text(width*.08,height-34*density,'',{fontFamily:'Georgia, serif',fontSize:`${14*density}px`,color:'#e4dcc8',fontStyle:'italic',wordWrap:{width:width*.84}});
    this.add.text(width*.92,23*density,'E / ENTER · WEITER',{fontFamily:'Arial',fontSize:`${11*density}px`,color:'#e4dcc8'}).setOrigin(1,0);
    this.input.on('pointerdown',()=>this.next());
    this.input.keyboard?.on('keydown', (event:KeyboardEvent) => { if(event.code==='Escape')this.complete(); else if(['Enter','KeyE','Space'].includes(event.code))this.next(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{ this.cameraBeat(undefined); const done=this.finish;this.finish=undefined;done?.(); });
    this.present();
  }
  /** Each beat types its line on the scene clock and advances after its authored length; both pause with the scene. */
  private present() {
    const beat=this.beats[this.index];
    this.typing?.remove(); this.advance?.remove();
    this.speaker?.setText(localizedName(beat.speaker==='Inspector'?'Inspector Voss':beat.speaker));this.line?.setText('');
    this.subtitle?.setText(translatedText({german:beat.german,english:''})??'');this.cameraBeat(beat);
    this.voice?.(beat.speaker.toLowerCase(),beat.german,beat.clipId??`cinematic-${this.kind}-${this.index}`);
    let shown=0;
    this.typing=this.time.addEvent({delay:25,repeat:Math.max(0,beat.german.length-1),callback:()=>this.line?.setText(beat.german.slice(0,++shown))});
    this.advance=this.time.delayedCall(beat.seconds*1000,()=>this.next());
  }
  private next() { if(++this.index>=this.beats.length)this.complete();else this.present(); }
  private complete() { this.scene.stop(); }
}
