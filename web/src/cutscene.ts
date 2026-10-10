import * as Phaser from 'phaser';
import type { MapId } from './maps';
import { cinematicBeats,type CutsceneKind,type CameraBeat,type Beat } from './cinematic-content';
export {cinematicBeats,type CutsceneKind,type CameraBeat} from './cinematic-content';

/** A real transparent Phaser scene above the live world; keyboard/click skippable. */
export class CutsceneScene extends Phaser.Scene {
  private beats: readonly Beat[] = [];
  private index = 0;
  private elapsed = 0;
  private line?: Phaser.GameObjects.Text;
  private speaker?: Phaser.GameObjects.Text;
  private finish?: () => void;
  private kind:CutsceneKind='arrival';
  constructor(private cameraBeat: (beat: CameraBeat | undefined) => void,private voice?:(speaker:string,german:string,clipId:string)=>void) { super({ key: 'cinematic' }); }
  create(data: {kind:CutsceneKind;mapId:MapId;complete:()=>void}) {
    this.beats = cinematicBeats(data.kind,data.mapId); this.index = 0; this.elapsed = 0; this.finish = data.complete;
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
    this.add.text(width*.92,23*density,'E / ENTER · WEITER',{fontFamily:'Arial',fontSize:`${11*density}px`,color:'#e4dcc8'}).setOrigin(1,0);
    this.input.on('pointerdown',()=>this.next());
    this.input.keyboard?.on('keydown', (event:KeyboardEvent) => { if(event.code==='Escape')this.complete(); else if(['Enter','KeyE','Space'].includes(event.code))this.next(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{ this.cameraBeat(undefined); const done=this.finish;this.finish=undefined;done?.(); });
    this.present();
  }
  private present() { const beat=this.beats[this.index]; this.elapsed=0;this.speaker?.setText(beat.speaker);this.line?.setText('');this.cameraBeat(beat);this.voice?.(beat.speaker.toLowerCase(),beat.german,`cinematic-${this.kind}-${this.index}`); }
  private next() { if(++this.index>=this.beats.length)this.complete();else this.present(); }
  private complete() { this.scene.stop(); }
  update(_time:number,delta:number) {
    const beat=this.beats[this.index]; if(!beat)return;
    this.elapsed+=Math.min(delta,100)/1000;
    this.line?.setText(beat.german.slice(0,Math.floor(this.elapsed*40)));
    if(this.elapsed>=beat.seconds)this.next();
  }
}
