import { escapeHtml as e } from '../icons';
import { seededShuffle } from '../game-shuffle';
import { scaffoldStage, scaffoldText } from '../typing-scaffold';
import { sentenceTiles } from '../learning';
import { distractors } from './pool';
import { RoundQueue, optionCount, responseLimit } from './rounds';
import { mountMiniGameScene } from './scene';
import { itemSpriteFor } from './item-manifest';
import { transcriptionResults } from './transcription';
import { departureRound, type DepartureRound } from './departure-round';
import { mechanicPool, minimumPool, needsSound as soundRequired } from './game-pools';
import { mountDepartureBoard, type DepartureBoardController } from './departure-board';
import { mountCatching, catchingNumberLabel, type CatchingController } from './catching';
import loopData from './loop-data.json';
import type { AttemptResult } from '../api';
import { quests, type Exercise } from '../content';
import type { AnswerKind, GameItem, MiniGame, MiniGameDefinition, MiniGameHost, MiniGameOptions, Modality, RoundResult, RoundSummary } from './types';

interface Choice { label:string; answer:string; sprite?:string; kind?:AnswerKind; }
interface CurrentRound {
  item:GameItem; modality:Modality; retry:boolean; choices:Choice[]; start:number;
  hinted:boolean; heard:boolean; production:boolean; exercise?:Exercise;
  order?:GameItem[]; numbers?:GameItem[]; selections:Choice[]; quantities:number[];
  previewInk?:boolean;
  freeName?:boolean;
  letterKeys?:boolean;
  context?:{before:string;after:string;printed:string;wordIds:string[]};
  board?:DepartureRound;
}
/** A flat line for the tape waveform before audio is playing. */
const silentWaveform=new Uint8Array(128).fill(128);
const numberValues:Record<string,number>={eins:1,zwei:2,drei:3,vier:4,fünf:5};
const spelling=(value:string)=>value.normalize('NFC').toLocaleLowerCase('de').replace(/[äöüß]/g,letter=>({ä:'ae',ö:'oe',ü:'ue',ß:'ss'} as Record<string,string>)[letter]);
const displayNumbers:Record<string,number>={...numberValues,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwölf:12,dreizehn:13,vierzehn:14,fünfzehn:15,sechzehn:16,siebzehn:17,achtzehn:18,neunzehn:19,zwanzig:20,dreißig:30,vierzig:40,fünfzig:50,sechzig:60,siebzig:70,achtzig:80,neunzig:90,hundert:100,einhundert:100,eintausend:1000};

/** Lifecycle, timers, retries and grading live here; games only specify their loop. */
export class RetrievalGame implements MiniGame {
  readonly id:string;readonly title:string;readonly host:string;readonly modalities:Modality[];readonly levels:MiniGameDefinition['levels'];
  private root!:HTMLElement;private services!:MiniGameHost;private opts!:MiniGameOptions;
  private pool:GameItem[]=[];private queue!:RoundQueue;private current?:CurrentRound;
  private scene?:ReturnType<typeof mountMiniGameScene>;private unbind?:()=>void;
  private raf=0;private stopFrames?:()=>void;private previous=0;
  /** Last values written to the timer and patience bar, so frames that change nothing touch no DOM. */
  private shownSeconds=-1;private shownPatience='';private unsaved=0;private elapsed=0;private roundElapsed=0;private count=0;
  private paused=false;private running=false;private destroyed=false;private submitting=false;
  private manualPaused=false;
  private generation=0;private selected?:number;private confirmTimer?:ReturnType<typeof setTimeout>;
  private advanceTimer?:ReturnType<typeof setTimeout>;private pending?:RoundResult[];
  private summary!:RoundSummary;private chain=0;private seen=new Set<string>();
  private retryExercises=new Map<string,Exercise[]>();private wrongGlyphs=0;
  private shifted=false;
  private departure?:DepartureBoardController;
  private catcher?:CatchingController;
  constructor(private definition:MiniGameDefinition){this.id=definition.id;this.title=definition.title;this.host=definition.host;this.modalities=definition.modalities;this.levels=definition.levels;}
  mount(root:HTMLElement,host:MiniGameHost,opts:MiniGameOptions){
    this.root=root;this.services=host;this.opts=opts;
    this.summary={gameId:this.id,attempts:0,correct:0,hinted:0,activeMs:0,longestChain:0};
    this.pool=mechanicPool(this.definition,query=>host.pool(query),{level:opts.level,silent:host.silent,seed:opts.seed,fixedPool:opts.fixedPool});
    this.queue=new RoundQueue(this.pool,this.definition.rounds);
    root.innerHTML=`<section class="minigame" data-game-mechanic="${e(this.definition.mechanic)}" style="--minigame-art:url('${e(opts.backdrop??'/assets/lindenhafen-preview.webp')}')"><div class="minigame-canvas" aria-hidden="true"></div><header class="minigame-heading"><div><h2>${e(this.title)}</h2></div><div class="minigame-score"><span data-game-score>0 / 0</span><time data-game-time>${this.definition.seconds}s</time></div></header><div class="minigame-lanterns" aria-hidden="true">${Array.from({length:12},()=>'<i></i>').join('')}</div><div class="minigame-play"></div><p class="minigame-feedback" role="status" aria-live="polite"></p><footer class="minigame-footer"><span>1–6 · ← → · Enter</span><button type="button" data-game-action="pause">Pause</button><button type="button" data-game-action="finish">Finish round</button></footer></section>`;
    const needsSound=soundRequired(this.definition,host.silent);
    if(this.pool.length<minimumPool(this.definition,host.silent) || needsSound){
      // Silent mode only explains a game that cannot be played without sound; a small pool is a different reason.
      this.play.innerHTML=`<div class="minigame-intro"><h3>${needsSound?'The lantern is listening.':'These words are still returning.'}</h3><p>${needsSound?'Turn off silent mode to hear this game.':'Restore more words in the town, then return for this game. Only familiar words enter the pool.'}</p><button type="button" class="primary-button" data-action="todays-words">Practise today’s words</button></div>`;this.root.querySelector<HTMLElement>('.minigame-footer')!.hidden=true;return;
    }
    this.play.innerHTML=`<div class="minigame-intro"><span class="minigame-seal">VII</span><h3>${e(this.definition.instruction)}</h3><p>${this.definition.seconds} seconds · ${this.pool.length} restored words · every answer saved</p><button type="button" class="primary-button" data-game-action="start">Light the first lantern</button><p class="minigame-best">${e(this.bestLabel())}</p></div>`;
    this.root.addEventListener('click',this.click);this.root.addEventListener('submit',this.form);
    this.root.addEventListener('input',this.inkInput);
    this.root.addEventListener('dragstart',this.dragStart);this.root.addEventListener('dragover',this.dragOver);this.root.addEventListener('drop',this.drop);
    this.unbind=host.input.bind(root);
    void host.sprites.preload(this.pool.flatMap(item=>item.sprite?[item.sprite]:[])).catch(()=>{});
    this.scene=mountMiniGameScene(root.querySelector<HTMLElement>('.minigame-canvas')!,this.definition.mechanic,host.reducedMotion,host.sprites);
    const action=({catch:'action-fritz-pointing',board:'action-otto-watch',connection:'action-otto-watch',stamp:'action-voss-stamping',sort:'action-lina-sorting',archive:'action-ada-filing',garden:'action-greta-watering'} as Record<string,string>)[this.definition.mechanic];
    if(action&&host.sprites.has(action)){const portrait=host.sprites.render(action,'Your host',110);portrait.classList.add('minigame-host-pose');this.root.querySelector('.minigame-heading')?.prepend(portrait);}
    this.root.querySelector<HTMLButtonElement>('[data-game-action="start"]')?.focus();
  }
  private get play(){return this.root.querySelector<HTMLElement>('.minigame-play')!;}
  private get feedback(){return this.root.querySelector<HTMLElement>('.minigame-feedback')!;}
  private click=(event:Event)=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    const action=button.dataset.gameAction;
    if(action==='start'){this.running=true;this.next();this.previous=performance.now();this.startFrames();}
    else if(action==='finish')this.finish();
    else if(action==='pause'){if(this.paused)this.resume(true);else this.pause(true);}
    else if(action==='replay')void this.speak(true);
    else if(action==='clarify'){if(this.current){this.current.hinted=true;this.current.modality=this.current.modality==='listening'?'recognition':this.current.modality;this.current.heard=true;this.feedback.textContent=this.current.board?this.current.board.targets.map(target=>`${this.current!.board!.fields.find(field=>field.id===target.field)!.label}: ${[...target.options].find(([,item])=>item===target.item)?.[0]}`).join(' · '):this.current.order?this.current.order.map((item,index)=>`${this.current!.numbers?.[index]?.lemma??''} · ${item.article??''} ${item.articleForm??item.lemma} (${item.english})`).join(' + '):`${this.current.item.article??''} ${this.current.item.articleForm??this.current.item.lemma} · ${this.current.item.english}`;this.services.expose([...(this.current.board?.targets.map(target=>target.item)??this.current.order??[this.current.item]),...(this.current.numbers??[])].map(item=>item.lexemeId));this.departure?.resume();this.catcher?.start();}}
    else if(action==='save')void this.save();
    else if(action==='serve')void this.serve();
    else if(action==='undo'){this.current?.selections.pop();this.renderSelections();}
    else if(action==='check')void this.production();
    else if(action==='clear-tiles'){if(this.current){this.current.selections=[];this.renderSelections();this.play.querySelectorAll<HTMLButtonElement>('[data-game-option]').forEach(button=>button.disabled=false);}}
    else if(action==='mark-loop'){
      const position=this.services.audio.positionMs?.(),clip=loopData.clips.find(clip=>clip.exerciseId===this.current?.exercise?.id);
      if(position!==undefined&&clip){const repeat=clip.coughPositionsMs[1];const matched=position>=repeat-300&&position<=repeat+clip.coughDurationMs+300;this.feedback.textContent=matched?'✓ The cough repeats here. Restore the sentence between the two coughs.':'Keep listening for the same cough at the end of the loop.';if(matched)this.services.audio.sfx('stamp');}
      else if(position!==undefined)this.feedback.textContent=`Loop marker · ${(position/1000).toFixed(1)}s`;
      else this.feedback.textContent='Replay the recording to mark its loop.';
    }
    else if(action==='keyboard'){const keyboard=this.play.querySelector<HTMLElement>('.minigame-letter-keys');if(keyboard){keyboard.hidden=!keyboard.hidden;if(!keyboard.hidden){if(this.current)this.current.letterKeys=true;keyboard.querySelector<HTMLButtonElement>('button')?.focus();}}}
    else if(button.dataset.gameKey){
      const input=this.play.querySelector<HTMLInputElement>('input');if(!input)return;const key=button.dataset.gameKey;
      if(key==='shift'){this.shifted=!this.shifted;button.setAttribute('aria-pressed',String(this.shifted));return;}
      const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;
      if(key==='backspace')input.setRangeText('',start===end?Math.max(0,start-1):start,end,'end');
      else{const letter=key==='space'?' ':this.shifted||input.value.length===0?key.toLocaleUpperCase('de'):key;input.setRangeText(letter,start,end,'end');this.shifted=false;}
      input.dispatchEvent(new Event('input',{bubbles:true}));
      this.play.querySelector('[data-game-key="shift"]')?.setAttribute('aria-pressed',String(this.shifted));
    }
    else if(button.dataset.gameQuantity){const value=button.dataset.gameQuantity,[slot,delta]=value.split(':').map(Number);if(this.current)this.current.quantities[slot]=Math.max(1,Math.min(5,this.current.quantities[slot]+delta));this.renderSelections();this.play.querySelector<HTMLButtonElement>(`[data-game-quantity="${value}"]`)?.focus();}
    else if(button.dataset.gameOption!==undefined)this.choose(Number(button.dataset.gameOption));
    else if(button.dataset.gameUmlaut){const input=this.play.querySelector<HTMLInputElement>('input');if(input){input.setRangeText(button.dataset.gameUmlaut,input.selectionStart??input.value.length,input.selectionEnd??input.value.length,'end');input.focus();}}
  };
  private form=(event:Event)=>{event.preventDefault();void this.production();};
  private inkInput=(event:Event)=>{
    const current=this.current;if(this.definition.mechanic!=='ink'||!current||this.paused||this.submitting||(event as InputEvent).isComposing)return;
    const input=event.target as HTMLInputElement;if(!input.matches('input'))return;
    const value=spelling(input.value.replace(/^(der|die|das)\s+/i,'')),expected=current.item.lemma,normalizedExpected=spelling(expected);
    let wrong=0;[...value].forEach((letter,index)=>{if(letter!==normalizedExpected[index])wrong++;});
    if(wrong>this.wrongGlyphs){this.roundElapsed+=(wrong-this.wrongGlyphs)*500;this.services.audio.sfx('smudge');}this.wrongGlyphs=wrong;
    this.play.querySelectorAll<HTMLElement>('.minigame-ink span').forEach((glyph,index)=>{if(value.startsWith(spelling(expected.slice(0,index+1)))){glyph.textContent=current.context?.printed[index]??expected[index];glyph.classList.add('is-restored');}});
  };
  private dragStart=(event:Event)=>{const drag=event as DragEvent;const option=(event.target as HTMLElement).closest<HTMLElement>('[data-game-option]');if(option){drag.dataTransfer?.setData('text/plain',option.dataset.gameOption!);if(drag.dataTransfer)drag.dataTransfer.effectAllowed='move';}};
  private dragOver=(event:Event)=>{if((event.target as HTMLElement).closest('[data-game-drop]'))event.preventDefault();};
  private drop=(event:Event)=>{const drag=event as DragEvent;if(!(event.target as HTMLElement).closest('[data-game-drop]'))return;drag.preventDefault();const value=drag.dataTransfer?.getData('text/plain');if(value!==undefined&&/^\d+$/.test(value))this.choose(Number(value));};
  private next(){
    if(this.destroyed||!this.running)return;
    this.departure?.destroy();this.departure=undefined;this.catcher?.destroy();this.catcher=undefined;
    if(this.advanceTimer){clearTimeout(this.advanceTimer);this.advanceTimer=undefined;}
    if(this.elapsed>=this.definition.seconds*1000||this.count>=this.definition.rounds+10){this.finish();return;}
    const entry=this.queue.next();if(!entry){this.finish();return;}
    const item=entry.item,mechanic=this.definition.mechanic;
    let modality=this.services.silent&&this.modalities.includes('recognition')?'recognition':this.modalities[0];
    if(['garden','workbench'].includes(mechanic)&&this.count%3===2)modality='production';
    const production=modality==='production';
    const current:CurrentRound={item,modality,retry:entry.retry,choices:[],start:performance.now(),hinted:entry.retry||this.seen.has(item.lexemeId),heard:modality!=='listening',production,selections:[],quantities:[1,1]};
    if(mechanic==='ink'&&!item.seen.production&&!this.seen.has(item.lexemeId)){current.previewInk=true;current.hinted=true;}
    if(mechanic==='ink'){
      const restored=new Set(this.services.progress().intake?.wordIds??[]);
      const pattern=new RegExp(`(?<!\\p{L})${item.lemma.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?!\\p{L})`,['Sie','sie'].includes(item.lemma)?'u':'iu');
      for(const exercise of this.services.exercises.values()){
        const context=exercise as Exercise&{wordIds?:string[];kind?:string};
        if(context.kind==='word'||!context.wordIds?.includes(item.lexemeId)||context.wordIds.length<2||!context.wordIds.every(id=>restored.has(id)))continue;
        const match=pattern.exec(context.german);if(!match)continue;
        current.context={before:context.german.slice(0,match.index),after:context.german.slice(match.index+match[0].length),printed:match[0],wordIds:context.wordIds};break;
      }
    }
    this.current=current;this.roundElapsed=0;this.wrongGlyphs=0;this.pending=undefined;this.submitting=false;this.selected=undefined;this.count++;this.generation++;
    this.feedback.textContent='';
    let choices:Choice[];
    if(['stamp','sort','archive'].includes(mechanic)){
      let kind:AnswerKind='article';
      if(mechanic==='archive'){const wave=Math.floor((this.count-1)/10)%3;if(wave===1)kind='initial';if(wave===2&&item.plural)kind='plural';}
      if(mechanic==='stamp'&&this.opts.level!=='A1'&&this.count%3===0&&item.plural)kind='plural';
      const label=(other:GameItem)=>kind==='article'?other.article??'':kind==='plural'?other.plural??'':other.lemma[0].toLocaleUpperCase('de');
      const expected=label(item);
      const options=kind==='article'?['der','die','das']:[expected,...seededShuffle(this.pool,this.opts.seed+this.count).map(label).filter(label=>label&&label!==expected).slice(0,5)];
      choices=seededShuffle([...new Set(options)],this.opts.seed+this.count).map(value=>({label:value,answer:value,kind}));
      if(!expected){this.next();return;}
    }else{
      choices=distractors(item,this.pool,this.opts.seed+this.count,optionCount(item,modality)).map(other=>({label:modality==='recognition'&&!other.sprite?other.english:other.lemma,answer:other.lemma,sprite:other.sprite,kind:'lexeme'}));
      if(mechanic==='catch')choices=choices.map(choice=>({...choice,label:String(displayNumbers[choice.label]??choice.label),sprite:itemSpriteFor(this.opts.prologue?'wagen-noun':'apfel-noun')}));
    }
    if(['tray','workbench'].includes(mechanic)&&!production){
      const second=this.pool[(this.pool.indexOf(item)+1)%this.pool.length];current.order=[item,second];
      current.choices=seededShuffle(this.pool,this.opts.seed+this.count).slice(0,8).map(other=>({label:other.lemma,answer:other.lemma,sprite:other.sprite,kind:'lexeme'}));
      for(const target of current.order)if(!current.choices.some(choice=>choice.answer===target.lemma))current.choices.unshift({label:target.lemma,answer:target.lemma,sprite:target.sprite,kind:'lexeme'});
      current.choices=seededShuffle(current.choices,this.opts.seed+this.count*83);
      if(mechanic==='tray'){
        const numbers=this.services.pool({modality:'listening',level:this.opts.level}).filter(number=>number.pos==='num'&&numberValues[number.lemma]);
        if(numbers.length)current.numbers=current.order.map((_,index)=>numbers[(this.count+index)%numbers.length]);
      }
    }else current.choices=choices;
    if(mechanic==='board')current.board=departureRound(this.pool,item,this.opts.seed+this.count);
    if(mechanic==='council'){
      const restored=new Set(this.services.progress().intake?.wordIds??[]);
      const exercises=[...this.services.exercises.values()].filter(exercise=>exercise.mode==='sentence'&&this.definition.questIds?.includes((exercise as Exercise&{questId?:string}).questId??quests.find(quest=>quest.exercises.some(row=>row.id===exercise.id))?.id??'')&&(exercise as Exercise&{wordIds?:string[]}).wordIds?.every(id=>restored.has(id)));
      if(exercises.length){current.exercise=exercises[(this.count-1)%exercises.length];current.production=true;current.modality='production';current.hinted=true;current.choices=seededShuffle(sentenceTiles(current.exercise),this.opts.seed+this.count).map(token=>({label:token,answer:token}));}
    }
    this.configureStoryRound(current);
    if(mechanic==='stamp'&&this.opts.level==='B1'&&this.count%3===2){
      const restored=new Set(this.services.progress().intake?.wordIds??[]);
      const grammar=[...this.services.exercises.values()].filter(exercise=>exercise.mode==='choice'&&(exercise as Exercise&{kind?:string}).kind==='grammar'&&/article|case|accusative|dative|genitive|akkusativ|dativ|genitiv/i.test(exercise.prompt)&&(exercise as Exercise&{wordIds?:string[]}).wordIds?.length&&(exercise as Exercise&{wordIds?:string[]}).wordIds!.every(id=>restored.has(id)));
      const exercise=grammar[(this.count-1)%Math.max(1,grammar.length)];
      if(exercise){current.exercise=exercise;current.choices=seededShuffle(exercise.options??[],this.opts.seed+this.count).map(answer=>({label:answer,answer}));}
    }
    this.renderRound();
    if(current.modality==='listening')void this.speak(false);
    if(mechanic==='ink'&&current.previewInk){
      this.services.expose(current.context?.wordIds??[item.lexemeId]);
      this.advanceTimer=setTimeout(()=>{if(this.current===current&&!this.destroyed)this.play.querySelector('.minigame-ink')?.classList.add('fading');},1500);
    }
  }
  private renderRound(){
    const current=this.current!;const mechanic=this.definition.mechanic;
    const rule=['stamp','sort','archive'].includes(mechanic)&&!current.exercise?current.choices[0]?.kind:'';
    const showWord=current.modality==='recognition'||!!rule;
    let cue=showWord?`<h3 class="minigame-cue" lang="de">${e(current.exercise?.german??current.item.lemma)}</h3>`:'<div class="minigame-listening-cue" aria-label="Listen to the German audio">♪</div>';
    if(current.order&&current.modality==='recognition')cue=`<h3 class="minigame-cue minigame-sentence-cue" lang="de">${current.order.map((item,index)=>e(`${current.numbers?.[index]?.lemma??''} · ${item.article??''} ${item.articleForm??item.lemma}`)).join(' + ')}</h3>`;
    if(current.board&&current.modality==='recognition')cue=`<h3 class="minigame-cue minigame-sentence-cue" lang="de">${current.board.targets.map(target=>e(`${current.board!.fields.find(field=>field.id===target.field)!.label}: ${[...target.options].find(([,item])=>item===target.item)?.[0]}`)).join(' · ')}</h3>`;
    if(current.exercise)cue=`<p class="minigame-story-prompt">${e(current.exercise.prompt)}</p>${current.modality==='recognition'?`<h3 class="minigame-cue minigame-sentence-cue" lang="de">${e(current.exercise.german)}</h3>`:current.modality==='listening'?'<div class="minigame-listening-cue">♪</div>':''}`;
    if(rule)cue+=`<p class="minigame-rule">${rule==='article'?'der · die · das':rule==='plural'?'Plural':'A · B · C'}</p>`;
    if(current.production){
      const stage=scaffoldStage(current.item.level,this.opts.currentLevel??this.opts.level,current.item.recalls.production);
      if(stage!=='edges'&&stage!=='none')current.hinted=true;
      const sprite=current.item.sprite?'<div class="minigame-prompt-picture"></div>':'';
      const ink=mechanic==='ink'?`${current.item.sprite?'<div class="minigame-prompt-picture"></div>':current.context?'':`<p class="minigame-context">${e(current.item.english)}</p>`}<div class="minigame-ink ${current.previewInk?'':'fading'}" lang="de">${e(current.context?.before??'')}${[...(current.context?.printed??current.item.lemma)].map((letter,i)=>`<span style="--glyph:${i}">${e(current.previewInk?letter:'_')}</span>`).join('')}${e(current.context?.after??'')}</div>`:'';
      cue=current.exercise?`<p class="minigame-story-prompt">${e(current.exercise.prompt)}</p>`:ink||sprite||(mechanic==='tape'?'<div class="minigame-listening-cue">◉</div>':`<p class="minigame-context">${e(current.item.english)}</p>`);
      if(mechanic==='tape')void this.speak(false);
      if(!current.exercise)cue+=`<p class="minigame-scaffold" lang="de">${e(scaffoldText(current.item.lemma,stage))}</p>`;
    }
    if(current.freeName)cue=`<div class="minigame-receipt"><span class="caption">MORGEN · MARTAS KESSEL</span><h3>${e(this.services.playerName.slice(0,-1)+'?')}</h3><p>Correct your name on the receipt.</p></div>`;
    if(mechanic==='sequence')cue=`<div class="minigame-hour-slots">${Array.from({length:12},(_,index)=>`<span class="${index===((this.count-1)%12)?'is-current':''}">23:${String(index*5).padStart(2,'0')}</span>`).join('')}</div>${cue}<div class="minigame-dropzone" data-game-drop>Restore this five-minute slot</div>`;
    if(mechanic==='garden')cue=`<div class="minigame-garden-beds" aria-hidden="true">${Array.from({length:12},(_,index)=>`<i class="${index<this.summary.correct?'is-growing':''}"></i>`).join('')}</div>${cue}`;
    if(mechanic==='connection')cue=`<div class="minigame-departure-trap"><b>17:59</b><span>→</span><b>18:00</b></div>${cue}`;
    if(mechanic==='tape')cue=`<button type="button" class="minigame-tape-marker" data-game-action="mark-loop">◉ Mark the repeating cough</button><canvas class="minigame-waveform" width="640" height="60" aria-label="Recording waveform"></canvas>${cue}`;
    const controls=`<div class="minigame-audio-controls">${current.modality==='listening'||mechanic==='tape'?'<button type="button" data-game-action="replay">Hear again</button>':''}<button type="button" data-game-action="clarify">Clarify</button></div>`;
    const sentence=current.exercise?.mode==='sentence'&&mechanic!=='tape';
    const form=current.production&&!sentence?`<form class="minigame-recall"><label class="sr-only" for="minigame-answer">German word or sentence</label><input id="minigame-answer" lang="de" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${e(this.opts.level==='A2'&&mechanic==='chain'?'Artikel + Wort':'…')}" required/><div class="minigame-umlauts">${['ä','ö','ü','ß'].map(letter=>`<button type="button" data-game-umlaut="${letter}">${letter}</button>`).join('')}</div><button type="submit" class="primary-button">${mechanic==='tape'?'Restore the recording':'Re-ink the word'}</button></form>`:'';
    const tray=current.order||sentence?`<div class="minigame-dropzone" data-game-drop role="group" aria-label="${sentence?'Your German sentence':'Your tray or assembly'}"><div data-game-selections></div></div><div class="minigame-tray-actions"><button type="button" data-game-action="${sentence?'clear-tiles':'undo'}">Undo</button><button type="button" class="primary-button" data-game-action="${sentence?'check':'serve'}">${sentence?'Speak for the council':mechanic==='tray'?'Ring the bell':'Build the device'}</button></div>`:'';
    const objects=current.board||mechanic==='catch'?'<div data-game-surface></div>':!current.production||sentence?`<div class="minigame-options minigame-options-${mechanic}" role="group" aria-label="Choose your answer">${current.choices.map((choice,index)=>`<button type="button" draggable="${!!current.order||sentence||mechanic==='sequence'}" data-game-option="${index}" class="minigame-object" aria-label="Option ${index+1}"><span class="minigame-object-art"></span><span class="minigame-object-label" lang="de">${e(current.modality==='recognition'&&this.definition.sprites?'':choice.sprite&&!rule?'':choice.label)}</span><kbd>${index+1}</kbd></button>`).join('')}</div>`:'';
    this.play.innerHTML=`<div class="minigame-round">${cue}${controls}${form}${tray}${objects}<div class="minigame-patience"><i></i></div></div>`;this.shownPatience='';
    if(current.production&&!sentence){this.play.querySelector('form')?.insertAdjacentHTML('beforeend',`<button type="button" data-game-action="keyboard">Letter keys</button><div class="minigame-letter-keys" hidden role="group" aria-label="German letter keys">${[...'abcdefghijklmnopqrstuvwxyzäöüß','space','shift','backspace'].map(key=>`<button type="button" data-game-key="${key}" ${key==='shift'?'aria-pressed="false"':''}>${key==='space'?'␣':key==='shift'?'⇧':key==='backspace'?'⌫':key}</button>`).join('')}</div>`);}
    if(current.production&&current.item.sprite){this.play.querySelector('.minigame-prompt-picture')?.append(this.services.sprites.render(current.item.sprite,'Word to recall',136));}
    this.play.querySelectorAll<HTMLButtonElement>('[data-game-option]').forEach((button,index)=>{
      const choice=current.choices[index];
      if(choice.sprite&&!rule){button.querySelector('.minigame-object-art')!.append(this.services.sprites.render(choice.sprite,`Option ${index+1}`,104));}
      if(mechanic==='catch'){button.classList.add('minigame-apple');}
      else if(['sort','archive','stamp'].includes(mechanic)){button.classList.add('minigame-chute');}
      // The accessible name must not reveal a listening/picture answer.
      if(!choice.sprite||rule)button.setAttribute('aria-label',choice.label);
    });
    this.renderSelections();
    const surface=this.play.querySelector<HTMLElement>('[data-game-surface]');
    if(surface&&current.board){this.departure=mountDepartureBoard(surface,{fields:current.board.fields,sprites:this.services.sprites,reducedMotion:this.services.reducedMotion,onFlap:()=>this.services.audio.sfx('flap'),onConfirm:values=>void this.submitDeparture(values)});if(!current.heard)this.departure.pause();}
    if(surface&&mechanic==='catch'){
      this.catcher=mountCatching(surface,{choices:current.choices,targetAnswer:current.item.lemma,sprites:this.services.sprites,reducedMotion:this.services.reducedMotion,durationMs:Math.max(1400,Math.min(2800,responseLimit(current.item,false)*.5)),onCatch:index=>void this.answer(current.choices[index].answer,current.choices[index].kind),onMiss:()=>void this.answer('__timeout__','lexeme')});
      if(current.heard)this.catcher.start();
    }
    this.play.querySelector<HTMLInputElement>('input')?.focus();
  }
  private renderSelections(){
    const current=this.current;if(!current)return;const tray=this.play.querySelector<HTMLElement>('[data-game-selections]');if(!tray)return;
    tray.innerHTML=current.selections.length?current.selections.map((choice,index)=>`<span class="minigame-tray-item">${e(current.exercise?choice.label:choice.sprite?'':choice.label)}<span data-selected-art="${index}"></span>${current.numbers?`<span class="minigame-quantity"><button type="button" data-game-quantity="${index}:-1" aria-label="Remove one">−</button>${current.quantities[index]??1}<button type="button" data-game-quantity="${index}:1" aria-label="Add one">+</button></span>`:''}</span>`).join(''):'<span class="minigame-drop-hint">Drag here, or tap the objects below</span>';
    for(const [index,choice]of current.selections.entries())if(choice.sprite)tray.querySelector(`[data-selected-art="${index}"]`)?.append(this.services.sprites.render(choice.sprite,'Selected object',56));
  }
  private choose(index:number){
    const current=this.current;if(!current||this.paused||this.submitting||this.pending||!this.running)return;const choice=current.choices[index];if(!choice)return;
    if(current.order||current.exercise?.mode==='sentence'&&this.definition.mechanic!=='tape'){
      if(current.order&&current.selections.length>=current.order.length)return;
      current.selections.push(choice);if(current.exercise)this.play.querySelector<HTMLButtonElement>(`[data-game-option="${index}"]`)!.disabled=true;this.renderSelections();return;
    }
    if(current.modality==='listening'&&!current.heard){this.feedback.textContent='Listen to the whole word first, or open Clarify.';return;}
    if(this.confirmTimer)clearTimeout(this.confirmTimer);
    if(this.selected===index){void this.answer(choice.answer,choice.kind);return;}
    this.selected=index;this.play.querySelectorAll('[data-game-option]').forEach((button,i)=>button.classList.toggle('is-selected',i===index));
    this.confirmTimer=setTimeout(()=>{this.confirmTimer=undefined;void this.answer(choice.answer,choice.kind);},300);
  }
  private configureStoryRound(current:CurrentRound){
    if(this.definition.tier!=='B')return;
    if(this.definition.mechanic==='forecast'&&this.count===3){current.freeName=true;current.production=true;current.modality='production';current.choices=[];return;}
    const restored=new Set(this.services.progress().intake?.wordIds??[]);
    const eligible=[...this.services.exercises.values()].filter(exercise=>this.definition.questIds?.includes((exercise as Exercise&{questId?:string}).questId??quests.find(quest=>quest.exercises.some(row=>row.id===exercise.id))?.id??'')&&(exercise as Exercise&{wordIds?:string[]}).wordIds?.length&&(exercise as Exercise&{wordIds?:string[]}).wordIds!.every(id=>restored.has(id)));
    const mechanic=this.definition.mechanic;
    const mode=mechanic==='sequence'?'choice':mechanic==='tape'?'type':current.production?'sentence':mechanic==='connection'?(this.count%2?'listen':'choice'):mechanic==='forecast'?'listen':undefined;
    if(!mode)return;
    const candidates=eligible.filter(exercise=>mechanic==='tape'?loopData.clips.some(clip=>clip.exerciseId===exercise.id):exercise.mode===mode).sort((a,b)=>mechanic==='tape'?loopData.clips.findIndex(clip=>clip.exerciseId===a.id)-loopData.clips.findIndex(clip=>clip.exerciseId===b.id):0);
    const retried=current.retry?this.retryExercises.get(current.item.lexemeId)?.shift():undefined;
    const exercise=retried??candidates[(this.count-1)%Math.max(1,candidates.length)];if(!exercise)return;
    current.exercise=exercise;current.order=undefined;current.numbers=undefined;
    current.production=mode==='sentence'||mode==='type';current.modality=mode==='choice'?'recognition':mode==='listen'?'listening':'production';current.heard=current.modality!=='listening'&&mechanic!=='tape';
    if(mode==='sentence'){current.hinted=true;current.choices=seededShuffle(sentenceTiles(exercise),this.opts.seed+this.count).map(token=>({label:token,answer:token}));}
    else if(mode==='choice'||mode==='listen')current.choices=seededShuffle(exercise.options??[],this.opts.seed+this.count).map(answer=>({label:answer,answer}));
    if(mechanic==='tape')current.hinted=true;
  }
  private async speak(replay:boolean){
    const current=this.current;if(!current)return;const generation=this.generation;
    if(replay)current.hinted=true;current.heard=false;this.departure?.pause();this.catcher?.pause();
    const active=()=>generation===this.generation&&!this.destroyed&&this.running&&!this.paused;
    try{
      if(current.board){for(const target of current.board.targets){if(!active())return;await this.services.speakText(`${current.board.fields.find(field=>field.id===target.field)!.label}:`);if(!active())return;await this.services.speak(target.item);}}
      else if(current.exercise){const tape=this.definition.mechanic==='tape'&&loopData.clips.find(clip=>clip.exerciseId===current.exercise?.id);await this.services.speakText(current.exercise.german,tape?tape.path:(current.exercise as Exercise&{audio?:{path?:string};audioPath?:string}).audio?.path??(current.exercise as Exercise&{audioPath?:string}).audioPath);}
      else for(const [index,item]of(current.order??[current.item]).entries()){
        if(!active())return;
        if(current.numbers?.[index])await this.services.speak(current.numbers[index]);
        if(!active())return;
        await this.services.speak(item);
      }
      if(active()){current.heard=true;this.departure?.resume();this.catcher?.start();this.catcher?.resume();}
    }catch(error){if(this.generation===generation&&!this.destroyed&&!this.paused)this.feedback.textContent=(error as Error).message;}
  }
  private async production(){
    const current=this.current;if(!current||this.submitting||this.pending||this.paused)return;
    if(this.definition.mechanic==='tape'&&!current.heard){this.feedback.textContent='Listen to the recording first, or open Clarify.';return;}
    const answer=current.exercise?.mode==='sentence'&&this.definition.mechanic!=='tape'?current.selections.map(choice=>choice.answer).join(' '):this.play.querySelector<HTMLInputElement>('input')?.value.trim();
    if(!answer)return;
    if(current.freeName){
      if(answer.normalize('NFC').toLocaleLowerCase('de')===this.services.playerName.normalize('NFC').toLocaleLowerCase('de')){this.services.audio.sfx('chime');this.feedback.textContent=`✓ ${this.services.playerName}`;this.advanceTimer=setTimeout(()=>this.finish(),650);}
      else this.feedback.textContent=`${this.services.playerName} · the kettle’s names are free alphabet practice.`;
      return;
    }
    const requireArticle=this.opts.level!=='A1'&&this.definition.mechanic==='chain'&&current.item.article;
    if(requireArticle&&!/^(der|die|das)\s/i.test(answer)){this.feedback.textContent='Artikel + Wort, bitte.';return;}
    if(this.definition.mechanic==='tape'&&current.exercise){
      this.pending=[{lexemeId:current.item.lexemeId,modality:'production',hinted:current.hinted,responseMs:this.roundElapsed,answer,exerciseId:current.exercise.id},...transcriptionResults(current.exercise,answer,this.pool,current.hinted,this.roundElapsed)];
      await this.save();return;
    }
    await this.answer(answer);
  }
  private async serve(){
    const current=this.current;if(!current?.order||this.submitting||this.pending||this.paused)return;
    if(!current.heard&&current.modality==='listening'){this.feedback.textContent='Listen to the whole order first, or open Clarify.';return;}
    const responseMs=this.roundElapsed;
    this.pending=current.order.flatMap((item,index)=>{
      const selected=current.selections[index];
      const hinted=current.hinted||this.seen.has(item.lexemeId)||current.order!.slice(0,index).some(previous=>previous.lexemeId===item.lexemeId);
      const result:RoundResult={lexemeId:item.lexemeId,modality:current.modality,hinted,responseMs,answer:selected?.answer??'__timeout__',answerKind:'lexeme'};
      const number=current.numbers?.[index];
      return number?[result,{lexemeId:number.lexemeId,modality:current.modality,hinted:current.hinted||this.seen.has(number.lexemeId)||!!current.numbers?.slice(0,index).some(previous=>previous.lexemeId===number.lexemeId),responseMs,answer:Object.entries(numberValues).find(([,value])=>value===(current.quantities[index]??1))?.[0]??'__timeout__',answerKind:'lexeme' as const}]:[result];
    });
    await this.save();
  }
  private async submitDeparture(values:Record<string,string>){
    const current=this.current;if(!current?.board||this.submitting||this.pending||this.paused||!this.running||!current.heard)return;
    this.pending=current.board.targets.map((target,index)=>({lexemeId:target.item.lexemeId,modality:current.modality,hinted:current.hinted||this.seen.has(target.item.lexemeId)||current.board!.targets.slice(0,index).some(previous=>previous.item.lexemeId===target.item.lexemeId),responseMs:this.roundElapsed,answer:target.options.get(values[target.field])?.lemma??'__timeout__',answerKind:'lexeme'}));
    await this.save();
  }
  private async answer(answer:string,kind?:AnswerKind){
    const current=this.current;if(!current||this.submitting||this.pending||this.paused||!this.running)return;
    if(this.confirmTimer){clearTimeout(this.confirmTimer);this.confirmTimer=undefined;}
    this.pending=[{lexemeId:current.item.lexemeId,modality:current.modality,hinted:current.hinted,responseMs:this.roundElapsed,answer,answerKind:current.exercise?undefined:kind,exerciseId:current.exercise?.id}];
    await this.save();
  }
  private async save(){
    const current=this.current,results=this.pending;if(!current||!results||this.submitting||this.destroyed)return;
    this.submitting=true;this.play.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);this.feedback.textContent='Saving the ink…';
    this.departure?.pause();this.catcher?.pause();
    const generation=this.generation;
    try{
      const settled=await Promise.allSettled(results.map(result=>this.services.submit(result)));
      if(this.destroyed||generation!==this.generation)return;
      const failed=settled.find(result=>result.status==='rejected');
      if(failed?.status==='rejected')throw failed.reason;
      const grades=settled.map(result=>(result as PromiseFulfilledResult<AttemptResult>).value);
      const correct=grades.every(grade=>grade.correct);
      this.summary.attempts+=grades.length;this.summary.correct+=grades.filter(grade=>grade.correct).length;this.summary.hinted+=results.filter(result=>result.hinted).length;
      results.forEach(result=>this.seen.add(result.lexemeId));
      if(correct){this.chain++;this.summary.longestChain=Math.max(this.summary.longestChain,this.chain);}else{this.chain=0;if(current.board)current.board.targets.forEach((target,index)=>{if(!grades[index].correct)this.queue.miss(target.item);});else this.queue.miss(current.item);if(current.exercise){const pending=this.retryExercises.get(current.item.lexemeId)??[];pending.push(current.exercise);this.retryExercises.set(current.item.lexemeId,pending);}}
      this.services.audio.sfx(correct?this.definition.mechanic==='stamp'?'stamp':this.definition.mechanic==='tray'?'bell':'chime':'miss');
      this.scene?.feedback(correct,this.chain);
      this.root.querySelector('[data-game-score]')!.textContent=`${this.summary.correct} / ${this.summary.attempts}`;
      this.root.querySelectorAll('.minigame-lanterns i').forEach((lamp,index)=>lamp.classList.toggle('is-lit',index<this.chain));
      this.feedback.classList.toggle('is-miss',!correct);
      if(current.exercise&&grades[0]?.correctedAnswer)current.exercise.answer=grades[0].correctedAnswer;
      const correction=current.board?current.board.targets.map(target=>`${current.board!.fields.find(field=>field.id===target.field)!.label}: ${[...target.options].find(([,item])=>item===target.item)?.[0]}`).join(' · '):current.exercise?.answer??`${current.item.article??''} ${current.item.articleForm??current.item.lemma}${correct?'':` · ${current.item.english}`}`;
      this.feedback.textContent=correct?`✓ ${correction}`:`${correction} · returns in two turns`;
      if(!correct)void(current.board?this.services.speakText(correction):current.exercise?this.services.speakText(current.exercise.german,(current.exercise as Exercise&{audio?:{path?:string};audioPath?:string}).audio?.path??(current.exercise as Exercise&{audioPath?:string}).audioPath):this.services.speak(current.item)).catch(()=>{});
      this.pending=undefined;
      this.advanceTimer=setTimeout(()=>{this.advanceTimer=undefined;if(!this.paused)this.next();},correct?650:1600);
    }catch(error){
      if(this.destroyed||generation!==this.generation)return;
      this.submitting=false;this.feedback.textContent=(error as Error).message;
      this.play.insertAdjacentHTML('beforeend','<button type="button" data-game-action="save" class="primary-button">Retry saving this answer</button>');
    }
  }
  /**
   * The round clock runs on the shared mini-game Phaser loop when the scene offers it, so the page has one
   * frame loop; a scene without one (or a test stand-in) falls back to requestAnimationFrame.
   */
  private startFrames(){
    if(this.stopFrames||this.raf)return;
    const subscribe=this.scene?.onFrame;
    if(subscribe){this.stopFrames=subscribe(this.tick);return;}
    const loop=(now:number)=>{this.tick(now);if(!this.destroyed&&this.running)this.raf=requestAnimationFrame(loop);else this.raf=0;};
    this.raf=requestAnimationFrame(loop);
  }
  private stopFrameLoop(){this.stopFrames?.();this.stopFrames=undefined;if(this.raf){cancelAnimationFrame(this.raf);this.raf=0;}}
  private tick=(now:number)=>{
    if(this.destroyed)return;
    const delta=Math.min(100,Math.max(0,now-this.previous));this.previous=now;
    if(this.running&&!this.paused){
      this.elapsed+=delta;
      const remaining=Math.max(0,this.definition.seconds-Math.floor(this.elapsed/1000));
      if(remaining!==this.shownSeconds){this.shownSeconds=remaining;this.root.querySelector('[data-game-time]')!.textContent=`${remaining}s`;}
      const current=this.current;
      if(current&&!this.submitting&&!this.pending&&(current.modality!=='listening'||current.heard)){
        this.roundElapsed+=delta;
        const limit=(current.exercise?20000:responseLimit(current.item,current.production)*(current.board?current.board.targets.length:current.order?2:1))*(current.letterKeys?3:1);
        const patience=`scaleX(${Math.max(0,1-this.roundElapsed/limit)})`;
        if(patience!==this.shownPatience){const bar=this.play.querySelector<HTMLElement>('.minigame-patience i');if(bar){bar.style.transform=patience;this.shownPatience=patience;}}
        if(this.roundElapsed>=limit&&!current.freeName&&!this.catcher&&(this.definition.mechanic!=='tape'||current.heard)){if(current.board)void this.submitDeparture({});else if(current.order)void this.serve();else void this.answer('__timeout__',current.production?undefined:current.choices[0]?.kind);}
      }
      if(this.elapsed>=this.definition.seconds*1000&&!this.submitting)this.finish();
      if(this.definition.mechanic==='tape'){
        const canvas=this.play.querySelector<HTMLCanvasElement>('.minigame-waveform'),ctx=canvas?.getContext('2d'),data=this.services.audio.waveform?.();
        if(canvas&&ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#efcd80';ctx.lineWidth=2;ctx.beginPath();const values=data??silentWaveform;for(let index=0;index<values.length;index++){const x=index*canvas.width/(values.length-1),y=values[index]*canvas.height/256;if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
      }
    }
  };
  pause(manual=false){if(manual)this.manualPaused=true;if(this.destroyed||this.paused)return;this.paused=true;this.scene?.pause();this.departure?.pause();this.catcher?.pause();this.services.audio.stop();if(this.confirmTimer){clearTimeout(this.confirmTimer);this.confirmTimer=undefined;}this.root.querySelector<HTMLButtonElement>('[data-game-action="pause"]')!.textContent='Resume';this.root.classList.add('minigame-paused');}
  resume(manual=false){if(this.manualPaused&&!manual)return;if(manual)this.manualPaused=false;if(this.destroyed||!this.paused)return;this.paused=false;this.previous=performance.now();this.scene?.resume();this.root.querySelector<HTMLButtonElement>('[data-game-action="pause"]')!.textContent='Pause';this.root.classList.remove('minigame-paused');if(this.submitting&&!this.pending)this.next();else if(this.current&&(this.current.modality==='listening'||this.definition.mechanic==='tape')&&!this.current.heard)void this.speak(true);else if(!this.submitting&&!this.pending){this.departure?.resume();this.catcher?.resume();}}
  /** Answers whose save failed and were not retried; the round can still finish, and says so. */
  private dropUnsaved(){
    if(!this.pending||this.submitting)return;
    this.unsaved+=this.pending.length;this.pending=undefined;
  }
  /** Stop the round and report it once: on Finish, when time runs out, or when the round is closed. */
  private endRound(){
    this.departure?.destroy();this.departure=undefined;this.catcher?.destroy();this.catcher=undefined;
    this.running=false;this.generation++;this.stopFrameLoop();
    if(this.advanceTimer){clearTimeout(this.advanceTimer);this.advanceTimer=undefined;}if(this.confirmTimer){clearTimeout(this.confirmTimer);this.confirmTimer=undefined;}
    this.services.audio.stop();this.summary.activeMs=this.elapsed;this.saveBest();this.services.end(this.summary);
  }
  private finish(){
    // A save still in flight decides this answer first; a save that failed no longer holds the round open.
    if(!this.running||this.destroyed||this.submitting&&this.pending)return;
    this.dropUnsaved();
    this.endRound();
    const rate=this.elapsed>0?Math.round(this.summary.attempts*3600000/this.elapsed):0;
    const unsaved=this.unsaved?`<p class="minigame-unsaved" role="alert">${this.unsaved===1?'1 answer could not be saved and was not counted.':`${this.unsaved} answers could not be saved and were not counted.`}</p>`:'';
    this.play.innerHTML=`<div class="minigame-intro"><span class="minigame-seal">${this.summary.correct}</span><h3>The ink remembers.</h3><p>${this.summary.correct} / ${this.summary.attempts} answers · ${this.summary.hinted} supported recalls</p><p>${rate} retrievals per active hour · longest chain ${this.summary.longestChain}</p>${unsaved}<p>${e(this.bestLabel())}</p><button type="button" class="primary-button" data-minigame="${e(this.id)}">Another lantern round</button><button type="button" data-action="close-dialog">Back to the town</button></div>`;
    this.feedback.textContent=this.unsaved?'The saved answers are in the Atlas. Due words will return.':'Your answers are in the Atlas. Due words will return.';
  }
  private bestKey(){const date=new Date();date.setDate(date.getDate()-(date.getDay()+6)%7);const week=`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;return`atlas.minigame.chain:${this.services.playerId??'local'}:${this.id}:${week}`;}
  private bestLabel(){try{return`This week’s longest chain: ${Number(localStorage.getItem(this.bestKey())??0)}`;}catch{return'';}}
  private saveBest(){try{const best=Number(localStorage.getItem(this.bestKey())??0);localStorage.setItem(this.bestKey(),String(Math.max(best,this.summary.longestChain)));}catch{/* Optional record only. */}}
  destroy(){
    // Closing a round that was in progress still reports what was saved; an answer still saving is not counted.
    if(this.running&&!this.destroyed)this.endRound();
    this.destroyed=true;this.generation++;this.stopFrameLoop();if(this.advanceTimer)clearTimeout(this.advanceTimer);if(this.confirmTimer)clearTimeout(this.confirmTimer);this.departure?.destroy();this.catcher?.destroy();this.unbind?.();this.scene?.destroy();this.services.audio.stop();this.root.removeEventListener('click',this.click);this.root.removeEventListener('submit',this.form);this.root.removeEventListener('input',this.inkInput);this.root.removeEventListener('dragstart',this.dragStart);this.root.removeEventListener('dragover',this.dragOver);this.root.removeEventListener('drop',this.drop);}
}
