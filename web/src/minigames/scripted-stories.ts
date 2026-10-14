import './scripted-stories.css';
import data from './story-scripts.json';
import { escapeHtml as e } from '../icons';
import { seededShuffle } from '../game-shuffle';
import type { CourseExercise } from '../course';
import type { AttemptResult } from '../api';
import type { MiniGame, MiniGameDefinition, MiniGameHost, MiniGameOptions, Modality, RoundResult, RoundSummary } from './types';

export type ScriptedStoryId = 'lost-hour'|'seed-packets'|'17-59';
interface CanonicalStoryExercise {
  id:string;itemId:string;mode:Modality;german:string;prompt:string;answer:string;acceptedAnswers?:string[];
  wordIds:string[];targetWordId:string;explanation:string;miniGameId:ScriptedStoryId;level:'A2';contentId:string;questId:string;
}
export const canonicalStoryExercises = data.exercises as unknown as readonly CanonicalStoryExercise[];
export const scriptedStoryExercises: CourseExercise[] = canonicalStoryExercises.map(row=>({...row,
  mode:({recognition:'choice',listening:'listen',production:'type'} as const)[row.mode],kind:'word',unitId:row.contentId,english:'',hint:'',
}));
export const scriptedStoryData = data;
// The server hydrates this registry after the module has initialized.
const exerciseById = { get(id: string) { return canonicalStoryExercises.find(row => row.id === id); } };
const clock=data.games['lost-hour'],garden=data.games['seed-packets'],rail=data.games['17-59'];
const slotTime=(index:number)=>`23:${String(index*5).padStart(2,'0')}`;
const clockSlotIndex=(time:string)=>Array.from({length:12},(_,index)=>slotTime(index)).indexOf(time);
const fieldKeys=['time','platform','destination','status'] as const;
type FieldKey=typeof fieldKeys[number];
type Phase='intro'|'clock'|'ledger'|'garden'|'address'|'announcements'|'tickets'|'done';
type PendingAction={kind:'clock'|'packet'|'address'|'announcement'|'ticket';id:string;slot?:number};
interface Pending {result:RoundResult;action:PendingAction;receipt?:AttemptResult;error?:string;}
const letters=[...'abcdefghijklmnopqrstuvwxyz','ä','ö','ü','ß',...'0123456789','space','backspace'];

/** Authored boards submit the actual slot, packet, fields or ticket. Only receipts grow the world. */
export class ScriptedStoryGame implements MiniGame {
  readonly id:ScriptedStoryId; readonly title:string; readonly host:string;
  readonly modalities:Modality[]; readonly levels:MiniGameDefinition['levels'];
  private root!:HTMLElement;private services!:MiniGameHost;private opts!:MiniGameOptions;
  private phase:Phase='intro';private alive=false;private running=false;private paused=false;private manualPaused=false;
  private elapsed=0;private roundStart=0;private previous=0;private raf=0;
  private generation=0;private speechGeneration=0;private pending?:Pending;
  private selected?:string;private feedbackText='';private miss=false;private chain=0;
  private summary!:RoundSummary;private unbind?:()=>void;
  private hinted=new Set<string>();private seenTargets=new Set<string>();private heard=new Set<string>();
  private clockSlots=new Map<number,string>();private planted:string[]=[];private addressIndex=0;
  private marked=new Set<string>();private drafts=new Map<string,Partial<Record<FieldKey,string>>>();
  private focusedAnnouncement=0;private speaking=false;private transcript=false;private ledgerHinted=false;private ledgerReturn=false;
  private letterKeys=false;private shifted=false;private addressDraft='';
  private nativeVoices=new Set<HTMLAudioElement>();private voiceTimers=new Set<ReturnType<typeof setTimeout>>();
  private unplayed=new Set<string>();private voiceStarts=new Map<string,number>();private focusVersion=0;
  constructor(definition:MiniGameDefinition){
    if(!['lost-hour','seed-packets','17-59'].includes(definition.id))throw new Error('Unknown authored story board');
    this.id=definition.id as ScriptedStoryId;this.title=definition.title;this.host=definition.host;this.modalities=definition.modalities;this.levels=definition.levels;
  }
  private get script(){return data.games[this.id];}
  private get play(){return this.root.querySelector<HTMLElement>('.story-play')!;}
  private get feedback(){return this.root.querySelector<HTMLElement>('.story-feedback')!;}
  mount(root:HTMLElement,host:MiniGameHost,opts:MiniGameOptions):void{
    this.root=root;this.services=host;this.opts=opts;this.alive=true;
    this.summary={gameId:this.id,attempts:0,correct:0,hinted:0,activeMs:0,longestChain:0};
    const restored=new Set(host.progress().intake?.wordIds??[]),missing=this.script.requiredWordIds.filter(id=>!restored.has(id));
    root.innerHTML=`<section class="story-game story-${this.id}" data-story-game="${this.id}"><header class="story-heading"><div><h2>${e(this.title)}</h2></div><div><output data-story-score>0 / 0</output><time data-story-time>${this.script.seconds}s</time></div></header><div class="story-play"></div><p class="story-feedback" role="status" aria-live="polite"></p><footer class="story-footer"><span class="caption">Choose an object · arrows / Enter / controller</span><button type="button" data-game-action="pause">Pause</button><button type="button" data-game-action="finish">Finish</button></footer></section>`;
    root.querySelector<HTMLElement>('.story-game')!.classList.toggle('story-reduced-motion',host.reducedMotion);
    root.querySelector<HTMLElement>('.story-game')!.style.setProperty('--story-backdrop',`url('${opts.backdrop??(this.id==='lost-hour'?'/assets/minigames/workbench.webp':'/assets/waldruh-preview.webp')}')`);
    const action=this.id==='seed-packets'?'action-greta-watering':this.id==='17-59'?'action-otto-watch':undefined;
    if(action&&host.sprites.has(action)){const pose=host.sprites.render(action,'Your host',72);pose.classList.add('story-host');root.querySelector('.story-heading')!.prepend(pose);}
    if(missing.length){
      this.play.innerHTML=`<div class="story-intro"><h3>The script is still returning.</h3><p>This board needs ${missing.length} more restored words. Its German cards, cues and choices stay within the intake record.</p><button type="button" class="primary-button" data-action="todays-words">Practise today’s words</button></div>`;
      root.querySelector<HTMLElement>('.story-footer')!.hidden=true;return;
    }
    this.play.innerHTML=`<div class="story-intro"><span class="story-seal">VII</span><p>${e(this.script.brief)}</p><p>${this.script.seconds} seconds · every decision saved by the Atlas</p><button type="button" class="primary-button" data-game-action="start">Restore the story</button></div>`;
    root.addEventListener('click',this.click);root.addEventListener('submit',this.form);root.addEventListener('input',this.input);
    root.addEventListener('dragstart',this.dragStart);root.addEventListener('dragover',this.dragOver);root.addEventListener('drop',this.drop);
    this.unbind=host.input.bind(root);root.querySelector<HTMLButtonElement>('[data-game-action="start"]')?.focus();
  }
  private start():void{
    if(this.running)return;this.running=true;this.previous=performance.now();this.raf=requestAnimationFrame(this.tick);
    if(this.id==='lost-hour'){this.setPhase('clock');this.renderClock();}
    else if(this.id==='seed-packets'){
      let studied=false;try{studied=localStorage.getItem(this.ledgerKey)==='1';}catch{/* Browser storage is optional. */}
      if(studied){this.setPhase('garden');this.renderGarden();}else this.openLedger();
    }else{this.setPhase('announcements');this.renderAnnouncements();if(this.services.silent)this.showTranscript();else this.startChorus();}
  }
  private setPhase(next:Phase):void{if(this.phase!==next){this.phase=next;this.play.scrollTop=0;}}
  private get ledgerKey(){return `lantern-story-ledger:${this.services.playerId??this.services.playerName}:greta-memory-garden-v1`;}
  private click=(event:Event):void=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    const action=button.dataset.gameAction;
    if(action==='start'){this.start();return;}
    if(action==='pause'){if(this.paused)this.resume(true);else this.pause(true);return;}
    if(action==='finish'){if(!this.pending)this.finish();return;}
    if(this.paused||!this.running)return;
    if(action==='save'){void this.save();return;}
    if(this.pending)return;
    if(action==='ledger'){this.openLedger();return;}
    if(action==='ledger-close'){this.setPhase('garden');this.roundStart=this.elapsed;try{localStorage.setItem(this.ledgerKey,'1');}catch{/* Optional. */}this.renderGarden();return;}
    if(action==='replay'){void this.replay();return;}
    if(action==='transcript'){this.showTranscript();return;}
    if(action==='card-listen'){const card=clock.events.find(row=>row.id===this.selected);if(card){this.hinted.add(card.exerciseId);void this.speak(card.german,card.audio);}return;}
    if(action==='letters'){this.letterKeys=!this.letterKeys;this.renderAddress();this.play.querySelector<HTMLButtonElement>('[data-game-key]')?.focus();return;}
    if(button.dataset.gameKey){this.typeKey(button.dataset.gameKey);return;}
    if(button.dataset.clockCard){this.selected=button.dataset.clockCard;this.renderClock();this.focus(`[data-clock-card="${this.selected}"]`);return;}
    if(button.dataset.clockSlot){this.placeClock(Number(button.dataset.clockSlot));return;}
    if(button.dataset.packet){this.selected=button.dataset.packet;this.renderGarden();this.focus(`[data-packet="${this.selected}"]`);return;}
    if(button.dataset.bed){if(Number(button.dataset.bed)===this.planted.length)this.plantPacket();else this.setFeedback('Follow the lit bed along the old railway.');return;}
    if(button.dataset.announcement){this.focusedAnnouncement=Number(button.dataset.announcement);this.transcript=false;this.stopVoices();this.renderAnnouncements();if(!this.heard.has(this.activeAnnouncement.id))void this.replay();return;}
    if(button.dataset.boardField){this.cycleField(button.dataset.boardField as FieldKey);return;}
    if(action==='mark-announcement'){this.markAnnouncement();return;}
    if(button.dataset.ticket){this.selected=button.dataset.ticket;this.renderTickets();this.focus(`[data-ticket="${this.selected}"]`);return;}
    if(action==='hand-ticket'){if(this.selected)this.record(rail.ticketExerciseId,this.selected,{kind:'ticket',id:this.selected});return;}
  };
  private form=(event:Event):void=>{event.preventDefault();if(this.phase==='address'&&!this.pending&&!this.paused)this.submitAddress();};
  private input=(event:Event):void=>{const input=event.target as HTMLInputElement;if(input.matches('[data-address-input]'))this.addressDraft=input.value;};
  private dragStart=(event:Event):void=>{
    const drag=event as DragEvent,button=(event.target as HTMLElement).closest<HTMLElement>('[data-clock-card],[data-packet],[data-ticket]');if(!button)return;
    const value=button.dataset.clockCard??button.dataset.packet??button.dataset.ticket;drag.dataTransfer?.setData('text/plain',value??'');if(drag.dataTransfer)drag.dataTransfer.effectAllowed='move';
  };
  private dragOver=(event:Event):void=>{if((event.target as HTMLElement).closest('[data-clock-slot],[data-bed],[data-otto-drop]'))event.preventDefault();};
  private drop=(event:Event):void=>{
    if(this.paused||this.pending)return;const drag=event as DragEvent,target=(event.target as HTMLElement).closest<HTMLElement>('[data-clock-slot],[data-bed],[data-otto-drop]');if(!target)return;drag.preventDefault();
    const value=drag.dataTransfer?.getData('text/plain');if(!value)return;
    if(this.phase==='clock'&&clock.events.some(row=>row.id===value)){this.selected=value;this.placeClock(Number(target.dataset.clockSlot));}
    else if(this.phase==='garden'&&garden.packets.some(row=>row.id===value)){this.selected=value;if(Number(target.dataset.bed)===this.planted.length)this.plantPacket();}
    else if(this.phase==='tickets'&&rail.tickets.some(row=>row.id===value)){this.selected=value;this.record(rail.ticketExerciseId,value,{kind:'ticket',id:value});}
  };
  private focus(selector:string){this.play.querySelector<HTMLButtonElement>(selector)?.focus();}
  private paint(selector:string,frame:string,size:number,alt:string){const target=this.play.querySelector(selector);if(target&&this.services.sprites.has(frame))target.append(this.services.sprites.render(frame,alt,size));}
  private renderClock():void{
    const placed=new Set(this.clockSlots.values()),cards=seededShuffle(clock.events,this.opts.seed);
    let contiguous=0;while(this.clockSlots.has(contiguous))contiguous++;
    this.play.innerHTML=`<div class="story-clock-layout"><div class="story-clock-wrap"><div class="story-clock ${this.miss?'is-stuttering':''}" aria-label="The hour before midnight"><div class="story-clock-face"><span>23:00</span><i class="story-clock-hand" style="--clock-angle:${contiguous*30}deg"></i><strong>${contiguous}/12</strong></div>${Array.from({length:12},(_,index)=>{const id=this.clockSlots.get(index),card=clock.events.find(row=>row.id===id);return `<button type="button" class="story-clock-slot ${card?'is-restored':''}" data-game-option="slot-${index}" data-clock-slot="${index}" style="--slot:${index}" ${card?'disabled':''} aria-label="Place selected event at ${slotTime(index)}"><time>${slotTime(index)}</time>${card?'<span>✓</span>':''}</button>`;}).join('')}</div><p>Select a card, then its five-minute slot.</p><button type="button" data-game-action="card-listen" ${this.selected?'':'disabled'}>Hear selected card</button></div><div class="story-clock-cards" aria-label="Shuffled clockmill log">${cards.filter(card=>!placed.has(card.id)).map((card,index)=>`<button type="button" class="story-log-card ${this.selected===card.id?'is-selected':''}" draggable="true" data-game-option="${index}" data-clock-card="${card.id}" aria-pressed="${this.selected===card.id}"><span lang="de">${e(card.german)}</span></button>`).join('')}</div></div>`;
    this.applyLock();
  }
  private placeClock(slot:number):void{
    const card=clock.events.find(row=>row.id===this.selected);if(!card||!Number.isInteger(slot)||slot<0||slot>=12||this.clockSlots.has(slot))return;
    this.record(card.exerciseId,slotTime(slot),{kind:'clock',id:card.id,slot});
  }
  private openLedger():void{
    this.ledgerHinted=true;this.ledgerReturn=this.phase==='garden';this.setPhase('ledger');this.stopVoices();
    this.services.expose(this.script.requiredWordIds);
    this.play.innerHTML=`<div class="story-ledger"><h3>Greta’s memory ledger</h3><p>Each plant motif marks one moment in Voss’s story. Study the German associations; this round records supported practice.</p><div class="story-ledger-grid">${garden.packets.map(packet=>`<article><span class="story-packet-code">${packet.code}</span><span data-ledger-art="${packet.id}"></span><strong lang="de">${e(packet.ledgerGerman)}</strong><span class="caption">${e(garden.addresses.find(row=>row.id===packet.addressId)!.text)}</span></article>`).join('')}</div><button type="button" class="primary-button" data-game-action="ledger-close">${this.ledgerReturn?'Return to the bed':'Close the ledger and plant'}</button></div>`;
    for(const packet of garden.packets)this.paint(`[data-ledger-art="${packet.id}"]`,packet.sprite,64,`Memory motif ${packet.code}`);
  }
  private get activePacket(){return garden.packets[this.planted.length];}
  private renderGarden():void{
    const request=this.activePacket;if(!request){this.setPhase('address');this.addressIndex=0;this.addressDraft='';this.renderAddress();void this.cueAddress();return;}
    const stock=seededShuffle(garden.packets,this.opts.seed);
    this.play.innerHTML=`<div class="story-garden"><div class="story-request"><span>GRETA · ${this.planted.length+1}/12</span><p lang="de">${e(request.german)}</p><button type="button" data-game-action="ledger">Open memory ledger</button></div><div class="story-rail-beds" aria-label="Twelve beds along Waldruh’s old railway">${Array.from({length:12},(_,index)=>{const id=this.planted[index];return `<button type="button" class="story-bed ${id?'is-growing':index===this.planted.length?'is-active':''}" data-game-option="bed-${index}" data-bed="${index}" ${id?'disabled':''} aria-label="Plant selected packet in bed ${index+1}"><span>${index+1}</span><i data-bed-art="${index}"></i>${id?'<b>✓</b>':''}</button>`;}).join('')}</div><div class="story-packet-stock">${stock.filter(packet=>!this.planted.includes(packet.id)).map((packet,index)=>`<button type="button" class="story-seed-packet ${this.selected===packet.id?'is-selected':''}" data-game-option="${index}" data-packet="${packet.id}" draggable="true" aria-label="Seed packet ${packet.code}" aria-pressed="${this.selected===packet.id}"><span class="story-packet-code">${packet.code}</span><i data-packet-art="${packet.id}"></i><span lang="de">${e(garden.addresses.find(row=>row.id===packet.addressId)!.text)}</span></button>`).join('')}</div></div>`;
    for(const packet of stock)this.paint(`[data-packet-art="${packet.id}"]`,packet.sprite,70,`Memory motif ${packet.code}`);
    for(const [index,id]of this.planted.entries()){const packet=garden.packets.find(row=>row.id===id)!;this.paint(`[data-bed-art="${index}"]`,packet.sprite,48,'Growing memory plant');}
    this.applyLock();
  }
  private plantPacket():void{
    const packet=this.activePacket;if(packet&&this.selected&&garden.packets.some(row=>row.id===this.selected))this.record(packet.exerciseId,this.selected,{kind:'packet',id:packet.id});
  }
  private get activeAddress(){return garden.addresses[this.addressIndex];}
  private renderAddress():void{
    const address=this.activeAddress;if(!address){this.finish();return;}
    const heard=this.heard.has(address.id);
    this.play.innerHTML=`<div class="story-address"><h3>Restore the old address</h3><p>The printed packets have faded. Listen, then write the German address.</p>${this.transcript?`<p class="story-transcript" lang="de">${e(address.text)}</p>`:''}<div class="story-cue-controls"><button type="button" data-game-action="replay">${this.speaking?'Speaking…':'Replay address'}</button><button type="button" data-game-action="transcript">Show the spoken address</button></div><form><label>Address<input data-address-input value="${e(this.addressDraft)}" autocomplete="off" spellcheck="false" ${heard?'':'disabled'}></label><div class="story-umlauts">${['ä','ö','ü','ß'].map(letter=>`<button type="button" data-game-key="${letter}" aria-label="Insert ${letter}">${letter}</button>`).join('')}</div><button type="submit" class="primary-button" ${heard?'':'disabled'}>Give the address to Greta</button></form><button type="button" data-game-action="letters">Controller letters</button><div class="story-letter-keys" ${this.letterKeys?'':'hidden'}>${letters.map(letter=>`<button type="button" data-game-key="${letter}">${letter==='space'?'Space':letter==='backspace'?'⌫':letter}</button>`).join('')}<button type="button" data-game-key="shift" aria-pressed="${this.shifted}">Shift</button></div></div>`;
    this.applyLock();if(heard&&!this.letterKeys)this.play.querySelector<HTMLInputElement>('input')?.focus();
  }
  private typeKey(key:string):void{
    const input=this.play.querySelector<HTMLInputElement>('[data-address-input]');if(!input||input.disabled)return;
    if(key==='shift'){this.shifted=!this.shifted;this.play.querySelector('[data-game-key="shift"]')?.setAttribute('aria-pressed',String(this.shifted));return;}
    const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;
    if(key==='backspace')input.setRangeText('',start===end?Math.max(0,start-1):start,end,'end');
    else{const value=key==='space'?' ':this.shifted||start===0?key.toLocaleUpperCase('de'):key;input.setRangeText(value,start,end,'end');this.shifted=false;}
    this.addressDraft=input.value;this.play.querySelector('[data-game-key="shift"]')?.setAttribute('aria-pressed','false');
  }
  private async cueAddress():Promise<void>{
    const address=this.activeAddress;if(!address||this.phase!=='address'||this.paused)return;
    if(this.services.silent){this.showTranscript();return;}
    const version=this.generation;if(await this.speak(address.spoken,address.audio)&&this.alive&&!this.paused&&version===this.generation&&this.activeAddress?.id===address.id){this.heard.add(address.id);this.roundStart=this.elapsed;this.renderAddress();}
  }
  private submitAddress():void{
    const address=this.activeAddress;if(!address||!this.heard.has(address.id)||!this.addressDraft.trim())return;
    this.record(address.exerciseId,this.addressDraft.trim(),{kind:'address',id:address.id},'production');
  }
  private get activeAnnouncement(){return rail.announcements[this.focusedAnnouncement];}
  private fieldOptions(key:FieldKey,index:number):string[]{
    return seededShuffle([...new Set(rail.announcements.map(row=>row.fields[key]))],this.opts.seed+index*4+fieldKeys.indexOf(key));
  }
  private renderAnnouncements():void{
    const current=this.activeAnnouncement,draft=this.drafts.get(current.id)??{},heard=this.heard.has(current.id);
    this.play.innerHTML=`<div class="story-departures"><div class="story-arrival">ARRIVAL <strong>18:00</strong> · DESTINATION <strong>Waldruh</strong></div><div class="story-announcement-tabs">${rail.announcements.map((row,index)=>`<button type="button" data-game-option="${index}" data-announcement="${index}" class="${index===this.focusedAnnouncement?'is-selected':''}" aria-pressed="${index===this.focusedAnnouncement}">Announcement ${index+1} ${this.marked.has(row.id)?'✓':this.heard.has(row.id)?'♪':''}</button>`).join('')}</div><div class="story-departure-board">${rail.announcements.map(row=>{const value=this.drafts.get(row.id)??{};return `<div class="story-board-row ${this.marked.has(row.id)?'is-restored':''}"><span>${this.marked.has(row.id)?'✓':'·'}</span>${fieldKeys.map(key=>`<output>${e(value[key]??'—')}</output>`).join('')}</div>`;}).join('')}</div>${this.transcript?`<p class="story-transcript" lang="de">${e(current.german)}</p>`:''}<div class="story-cue-controls"><button type="button" data-game-action="replay">${this.speaking?'Speaking…':'Replay focused announcement'}</button><button type="button" data-game-action="transcript">Read focused announcement</button></div><div class="story-board-controls">${fieldKeys.map(key=>`<button type="button" data-game-option="field-${key}" data-board-field="${key}" ${heard&&!this.marked.has(current.id)?'':'disabled'}><span class="caption">${{time:'DEPARTURE',platform:'PLATFORM',destination:'DESTINATION',status:'RUNNING'}[key]}</span><strong>${e(draft[key]??'Set')}</strong></button>`).join('')}</div><button type="button" class="primary-button" data-game-action="mark-announcement" ${heard&&!this.marked.has(current.id)?'':'disabled'}>Mark this announcement</button><p class="story-small">Mark all four announcements before choosing a ticket. Each control cycles through the actual station choices.</p></div>`;
    this.applyLock();
  }
  private cycleField(key:FieldKey):void{
    const row=this.activeAnnouncement;if(!this.heard.has(row.id)||this.marked.has(row.id))return;
    const draft=this.drafts.get(row.id)??{},options=this.fieldOptions(key,this.focusedAnnouncement);draft[key]=options[(options.indexOf(draft[key]??'')+1)%options.length];this.drafts.set(row.id,draft);this.renderAnnouncements();this.focus(`[data-board-field="${key}"]`);
  }
  private markAnnouncement():void{
    const row=this.activeAnnouncement,draft=this.drafts.get(row.id);if(!this.heard.has(row.id)||!draft)return;
    if(fieldKeys.some(key=>!draft[key])){this.setFeedback('Set all four announcement fields.');return;}
    this.record(row.exerciseId,fieldKeys.map(key=>draft[key]).join('|'),{kind:'announcement',id:row.id},this.services.silent||this.transcript?'recognition':'listening');
  }
  private renderTickets():void{
    this.play.innerHTML=`<div class="story-ticket-board"><div class="story-arrival">ARRIVAL <strong>18:00</strong> · DESTINATION <strong>Waldruh</strong></div><div class="story-departure-board">${rail.announcements.map(row=>`<div class="story-board-row is-restored"><span>✓</span>${fieldKeys.map(key=>`<output>${e(row.fields[key])}</output>`).join('')}</div>`).join('')}</div><p lang="de">Du kommst um 18:00 am Bahnhof an. Welche Fahrkarte ist gültig?</p><div class="story-ticket-stock">${seededShuffle(rail.tickets,this.opts.seed).map((ticket,index)=>`<button type="button" class="story-ticket ${this.selected===ticket.id?'is-selected':''}" data-game-option="${index}" data-ticket="${ticket.id}" draggable="true" aria-pressed="${this.selected===ticket.id}"><i data-ticket-art="${ticket.id}"></i><strong>${e(ticket.code)}</strong><time>${ticket.time}</time><span lang="de">${e(ticket.destination)} · Gleis ${ticket.platform}</span></button>`).join('')}</div><button type="button" class="story-otto-drop primary-button" data-otto-drop data-game-action="hand-ticket" ${this.selected?'':'disabled'}>Hand selected ticket to Otto</button></div>`;
    for(const ticket of rail.tickets)this.paint(`[data-ticket-art="${ticket.id}"]`,'item-ticket-noun',70,'Rail ticket');this.applyLock();
  }
  private showTranscript():void{
    this.transcript=true;
    if(this.phase==='address'){const row=this.activeAddress;this.hinted.add(row.exerciseId);this.heard.add(row.id);this.services.expose(exerciseById.get(row.exerciseId)!.wordIds);this.renderAddress();}
    else if(this.phase==='announcements'){const row=this.activeAnnouncement;this.hinted.add(row.exerciseId);this.heard.add(row.id);this.services.expose(exerciseById.get(row.exerciseId)!.wordIds);this.renderAnnouncements();}
  }
  private async replay():Promise<void>{
    this.stopVoices();
    if(this.phase==='address'){this.hinted.add(this.activeAddress.exerciseId);this.heard.delete(this.activeAddress.id);await this.cueAddress();}
    else if(this.phase==='announcements'){
      const row=this.activeAnnouncement,version=this.generation;this.hinted.add(row.exerciseId);this.heard.delete(row.id);this.renderAnnouncements();
      if(this.services.silent){this.showTranscript();return;}
      if(await this.speak(row.german,row.audio)&&this.alive&&!this.paused&&this.phase==='announcements'&&this.activeAnnouncement.id===row.id&&version===this.generation){this.heard.add(row.id);this.voiceStarts.set(row.id,this.elapsed);this.renderAnnouncements();}
    }
  }
  private async speak(text:string,path:string):Promise<boolean>{
    if(!this.alive||this.paused)return false;const version=++this.speechGeneration;this.speaking=true;this.applyLock();
    try{await this.services.speakText(text,path);return this.alive&&!this.paused&&version===this.speechGeneration;}
    catch(error){if(this.alive&&!this.paused&&version===this.speechGeneration)this.setFeedback((error as Error).message);return false;}
    finally{if(this.alive&&version===this.speechGeneration){this.speaking=false;this.applyLock();}}
  }
  private startChorus():void{
    if(this.services.silent)return;const version=++this.speechGeneration;this.unplayed=new Set(rail.announcements.map(row=>row.id));this.services.audio.narration?.(true);
    for(const row of rail.announcements){
      const timer=setTimeout(()=>{
        this.voiceTimers.delete(timer);if(!this.alive||this.paused||version!==this.speechGeneration||this.phase!=='announcements')return;
        const audio=new Audio(row.audio);audio.volume=.65;this.nativeVoices.add(audio);
        const finish=(success:boolean)=>{
          audio.onended=null;audio.onerror=null;this.nativeVoices.delete(audio);this.unplayed.delete(row.id);
          if(!this.alive||this.paused||version!==this.speechGeneration)return;
          if(success){this.heard.add(row.id);this.voiceStarts.set(row.id,this.elapsed);}else this.setFeedback('The station audio could not play. Replay the focused announcement.');
          if(!this.nativeVoices.size&&!this.voiceTimers.size)this.services.audio.narration?.(false);
          this.renderAnnouncements();
        };
        audio.onended=()=>finish(true);audio.onerror=()=>finish(false);void audio.play().catch(()=>finish(false));
      },row.startsAtMs);this.voiceTimers.add(timer);
    }
  }
  private stopVoices():void{
    this.speechGeneration++;this.speaking=false;
    for(const timer of this.voiceTimers)clearTimeout(timer);this.voiceTimers.clear();
    for(const audio of this.nativeVoices){audio.onended=null;audio.onerror=null;audio.pause();}this.nativeVoices.clear();
    this.services.audio.stop();this.services.audio.narration?.(false);
  }
  private record(exerciseId:string,answer:string,action:PendingAction,mode?:Modality):void{
    if(!this.alive||this.paused||this.pending)return;const exercise=exerciseById.get(exerciseId);if(!exercise)return;
    const hinted=this.hinted.has(exerciseId)||this.seenTargets.has(exercise.targetWordId)||(this.id==='seed-packets'&&action.kind==='packet'&&this.ledgerHinted);
    const start=action.kind==='announcement'?this.voiceStarts.get(action.id)??this.roundStart:this.roundStart;
    const result:RoundResult=Object.freeze({lexemeId:exercise.targetWordId,exerciseId,modality:mode??exercise.mode,answer,hinted,responseMs:Math.max(0,this.elapsed-start),level:'A2',contentId:exercise.contentId});
    this.pending={result,action};this.stopVoices();this.applyLock();void this.save();
  }
  private async save():Promise<void>{
    const pending=this.pending;if(!pending||pending.receipt)return;pending.error=undefined;this.applyLock();
    try{pending.receipt=await this.services.submit(pending.result);if(this.alive&&!this.paused&&this.pending===pending)this.applyReceipt();}
    catch(error){if(this.alive&&this.pending===pending){pending.error=(error as Error).message;this.setFeedback(`${pending.error} · retry saving this same decision.`);this.applyLock();}}
  }
  private applyReceipt():void{
    const pending=this.pending,receipt=pending?.receipt;if(!pending||!receipt||this.paused||!this.alive)return;
    this.pending=undefined;this.summary.attempts++;if(receipt.correct)this.summary.correct++;if(pending.result.hinted)this.summary.hinted++;
    this.seenTargets.add(pending.result.lexemeId);this.miss=!receipt.correct;this.chain=receipt.correct?this.chain+1:0;this.summary.longestChain=Math.max(this.summary.longestChain,this.chain);
    this.services.audio.sfx(receipt.correct?'chime':'miss');
    const exercise=exerciseById.get(pending.result.exerciseId!)!;
    if(receipt.correct){
      this.setFeedback('✓ The Atlas remembers this part.');
      if(pending.action.kind==='clock'){this.clockSlots.set(pending.action.slot!,pending.action.id);this.selected=undefined;this.renderClock();if(this.clockSlots.size===12)this.finish();}
      else if(pending.action.kind==='packet'){this.planted.push(pending.result.answer);this.selected=undefined;this.renderGarden();}
      else if(pending.action.kind==='address'){this.addressIndex++;this.addressDraft='';this.transcript=false;this.letterKeys=false;this.renderAddress();if(this.phase!=='done')void this.cueAddress();}
      else if(pending.action.kind==='announcement'){
        this.marked.add(pending.action.id);this.transcript=false;
        if(this.marked.size===4){this.setPhase('tickets');this.selected=undefined;this.renderTickets();}
        else{this.focusedAnnouncement=rail.announcements.findIndex(row=>!this.marked.has(row.id));this.renderAnnouncements();if(!this.heard.has(this.activeAnnouncement.id))void this.replay();}
      }else this.finish();
    }else{
      this.hinted.add(exercise.id);this.services.expose(exercise.wordIds);
      const correction=pending.action.kind==='packet'?garden.packets.find(row=>row.id===receipt.correctedAnswer)?.code??receipt.correctedAnswer:receipt.correctedAnswer;
      this.setFeedback(`${exercise.explanation} ${correction?`→ ${correction}`:''}`,true);
      this.renderPhase();
    }
    this.roundStart=this.elapsed;this.updateHud();
  }
  private setFeedback(text:string,miss=false):void{this.feedbackText=text;this.miss=miss;if(this.alive){this.feedback.textContent=text;this.feedback.classList.toggle('is-miss',miss);}}
  private renderPhase():void{
    if(this.phase==='clock')this.renderClock();else if(this.phase==='garden')this.renderGarden();else if(this.phase==='address')this.renderAddress();else if(this.phase==='announcements')this.renderAnnouncements();else if(this.phase==='tickets')this.renderTickets();
  }
  private applyLock():void{
    if(!this.alive)return;
    const locked=Boolean(this.pending)||this.paused;
    this.play.toggleAttribute('inert',locked);this.root.classList.toggle('story-paused',this.paused);
    this.root.querySelector<HTMLButtonElement>('[data-game-action="finish"]')!.disabled=Boolean(this.pending);
    const old=this.root.querySelector('[data-story-save]');old?.remove();
    if(this.pending?.error){const button=document.createElement('button');button.type='button';button.dataset.gameAction='save';button.dataset.storySave='';button.textContent='Retry saving this decision';this.root.querySelector('.story-footer')?.prepend(button);}
  }
  private updateHud():void{
    if(!this.alive)return;this.root.querySelector<HTMLOutputElement>('[data-story-score]')!.textContent=`${this.summary.correct} / ${this.summary.attempts}`;
    this.root.querySelector<HTMLElement>('[data-story-time]')!.textContent=`${Math.max(0,Math.ceil(this.script.seconds-this.elapsed/1000))}s`;
  }
  private tick=(time:number):void=>{
    if(!this.alive||!this.running)return;const delta=Math.max(0,Math.min(100,time-this.previous));this.previous=time;
    if(!this.paused&&!this.pending&&this.phase!=='ledger'){this.elapsed+=delta;this.summary.activeMs=this.elapsed;this.updateHud();if(this.elapsed>=this.script.seconds*1000){this.finish();return;}}
    this.raf=requestAnimationFrame(this.tick);
  };
  pause(manual=false):void{
    if(manual)this.manualPaused=true;if(this.paused||!this.alive)return;this.paused=true;this.generation++;
    this.focusVersion++;this.stopVoices();this.applyLock();const button=this.root.querySelector<HTMLButtonElement>('[data-game-action="pause"]');if(button)button.textContent='Resume';
  }
  resume(manual=false):void{
    if(manual)this.manualPaused=false;if(this.manualPaused||!this.paused||!this.alive)return;this.paused=false;this.previous=performance.now();
    const button=this.root.querySelector<HTMLButtonElement>('[data-game-action="pause"]');if(button)button.textContent='Pause';
    if(this.pending?.receipt){this.applyReceipt();return;}this.applyLock();
    if(!this.pending&&this.phase==='address')void this.replay();
    else if(!this.pending&&this.phase==='announcements'&&!this.heard.has(this.activeAnnouncement.id))void this.replay();
  }
  private finish():void{
    if(!this.alive||this.phase==='done'||this.pending)return;this.running=false;this.setPhase('done');this.paused=false;this.manualPaused=false;this.generation++;this.stopVoices();cancelAnimationFrame(this.raf);
    this.summary.activeMs=this.elapsed;this.play.innerHTML=`<div class="story-intro story-complete"><span class="story-seal">VII</span><h3>The story is saved.</h3><p>${this.summary.correct} correct decisions out of ${this.summary.attempts} · ${this.summary.hinted} supported</p><p>${Math.round(this.summary.attempts/Math.max(1,this.elapsed)*3600000)} graded decisions per active hour</p></div>`;
    this.applyLock();this.root.querySelector<HTMLElement>('.story-footer')!.hidden=true;this.services.end({...this.summary});
  }
  destroy():void{
    if(!this.alive)return;this.alive=false;this.running=false;this.generation++;this.stopVoices();cancelAnimationFrame(this.raf);this.unbind?.();
    this.root.removeEventListener('click',this.click);this.root.removeEventListener('submit',this.form);this.root.removeEventListener('input',this.input);
    this.root.removeEventListener('dragstart',this.dragStart);this.root.removeEventListener('dragover',this.dragOver);this.root.removeEventListener('drop',this.drop);
  }
}
export function createScriptedStoryGame(definition:MiniGameDefinition):MiniGame{return new ScriptedStoryGame(definition);}
