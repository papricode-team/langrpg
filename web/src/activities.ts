import './activities.css';
import { npcs, type Exercise, type Level } from './content';
import type { Progress } from './api';
import { escapeHtml as e, icon } from './icons';
import {
  activityDefinitions, activityScenarios, applyActivityAction, evaluateActivity, exerciseForScenario,
  initialActivityState, inventory, marketTotal, money, selectActivityScenarios,
  type ActivityAction, type ActivityId, type ActivityMode, type ActivityScenario, type ActivityState,
  type CafeState, type DetectiveState, type DeliveryBoard, type DeliveryState, type MarketState,
} from './activity-engine';
export { activityDefinitions, activityScenarios, activityAudioJobs } from './activity-engine';
export type { ActivityId, ActivityMode } from './activity-engine';

export interface ActivityContext { runId:string; activityId:ActivityId; level:Level; scenarioId:string; attemptId:string; }
export interface ActivityCompletionContext { runId:string; activityId:ActivityId; level:Level; exerciseIds:string[]; attemptIds:string[]; }
export interface ActivityExposureContext { activityId:ActivityId; level:Level; scenarioId:string; }
export interface ActivitySubmitResult { correct:boolean; progress:Progress; xpAdded:number; attemptId?:string; reason?:string; correctedAnswer?:string; }
export interface ActivityCompleteResult { progress:Progress; xpAdded:number; duplicate?:boolean; reason?:string; }
export interface ActivityVenue {
  id:string; name:string; title:string; asset:string; npcId:string; briefing:string;
}
export interface MountActivityOptions {
  id:ActivityId; level:Level; progress:Progress; sessionKey?:string;
  /** A building may host an existing mission without changing its graded tasks. */
  venue?:ActivityVenue;
  submit:(exercise:Exercise,answer:string,hinted:boolean,mode?:ActivityMode,context?:ActivityContext)=>Promise<ActivitySubmitResult>;
  complete:(context:ActivityCompletionContext)=>Promise<ActivityCompleteResult>;
  onProgress?:(progress:Progress)=>void; onClose?:()=>void; speak:(text:string)=>void;
  onSceneVisible?:(exerciseId:string,context:ActivityExposureContext)=>void;
  /** A world host can show the delivery destination after the board is solved. */
  onDelivery?:(destination:{scenarioId:string;name:string;recipient:string;level:Level})=>void;
}
export interface ActivityController { destroy():void; pause():void; resume():void; reset():void; }
interface PendingAttempt { answer:string; hinted:boolean; context:ActivityContext; }
interface SavedRun {
  version:1; runId:string; id:ActivityId; level:Level; scenarioIds:string[]; index:number; state:ActivityState;
  hinted:boolean; stage:'playing'|'scene-complete'|'complete'; exerciseIds:string[]; attemptIds:string[];
  discoveries:string[]; xp:number; reward:number; familiar:boolean; pending?:PendingAttempt;
}
const kitchen:Record<string,{label:string;icon:string}> = {
  cup:{label:'Tasse nehmen',icon:'cup'},glass:{label:'Glas nehmen',icon:'cup'},brew:{label:'Kochen / brühen',icon:'lantern'},
  pour:{label:'Einschenken',icon:'cup'},addMilk:{label:'Milch dazugeben',icon:'plus'},bill:{label:'Rechnung schreiben',icon:'scroll'},
  wash:{label:'Waschen',icon:'leaf'},tidy:{label:'Aufräumen',icon:'sparkles'},cook:{label:'Suppe kochen',icon:'cup'},
  pack:{label:'Einpacken',icon:'parcel'},serve:{label:'Servieren',icon:'send'},
};
const cellKey=(cell:{x:number;y:number})=>`${cell.x},${cell.y}`;
const uuid=()=>crypto.randomUUID();
const titleCase=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
const items=(values:Record<string,number>)=>Object.entries(values).map(([id,quantity])=>({item:inventory[id],quantity})).filter(value=>value.item);
const nextDeliveryDirection=(board:DeliveryBoard,state:DeliveryState):string|undefined=>{
  const index=board.path.findIndex(cell=>cellKey(cell)===cellKey(state.position));
  const next=index>=0?board.path[index+1]:undefined;
  if(!next)return;
  const dx=next.x-state.position.x,dy=next.y-state.position.y;
  const heading=dx>0?1:dx<0?3:dy>0?2:0,turn=(heading-state.heading+4)%4;
  return turn===0?'Gehe geradeaus.':turn===1?'Biege rechts ab.':turn===3?'Biege links ab.':'Kehre um.';
};

function restoreBoard(scenario:ActivityScenario,value:unknown):ActivityState {
  let state=initialActivityState(scenario);
  if (!value||typeof value!=='object') return state;
  const data=value as Record<string,unknown>;
  if (data.kind!==state.kind) return state;
  const replay=(action:ActivityAction)=>{state=applyActivityAction(scenario,state,action);};
  if (state.kind==='cafe'||state.kind==='market') {
    // Reconstruct through the normal reducer, so malformed saved bags cannot
    // create unknown items, negative quantities or unrestricted action lists.
    const bag=data[state.kind==='cafe'?'tray':'basket'];
    if (state.kind==='market') state={...state,basket:{}};
    if (bag&&typeof bag==='object') for(const [id,raw] of Object.entries(bag)) {
      const quantity=typeof raw==='number'&&Number.isInteger(raw)?Math.min(9,Math.max(0,raw)):0;
      for(let count=0;count<quantity;count++) replay({type:'item',id,delta:1});
    }
    if (data.kind==='cafe') {
      if (Array.isArray(data.steps)) for(const id of data.steps.slice(0,8)) if(typeof id==='string') replay({type:'step',id});
      if (data.venue==='inside'||data.venue==='outside') replay({type:'venue',value:data.venue});
      if (data.service==='table'||data.service==='takeaway') replay({type:'service',value:data.service});
      if(typeof data.slot==='string') replay({type:'slot',value:data.slot});
    } else {
      if(data.method==='cash'||data.method==='card') replay({type:'payment',value:data.method});
      if(Array.isArray(data.changeCoins)) for(const coin of data.changeCoins.slice(0,30)) if(typeof coin==='number') replay({type:'coin',value:coin});
      if(state.kind==='market') state={...state,traded:data.traded===true};
    }
  } else if(state.kind==='detective') {
    if(data.links&&typeof data.links==='object') for(const [slotId,cardId] of Object.entries(data.links)) if(typeof cardId==='string') replay({type:'link',slotId,cardId});
  } else if(state.kind==='delivery'&&scenario.board.kind==='delivery') {
    const board=scenario.board;
    const validCell=(cell:unknown):cell is {x:number;y:number} => !!cell&&typeof cell==='object'&&board.roads.some(road=>road.x===(cell as {x?:unknown}).x&&road.y===(cell as {y?:unknown}).y);
    const trail=Array.isArray(data.trail)?data.trail.filter(validCell).slice(-100):[];
    if(trail.length&&cellKey(trail[0])===cellKey(board.start)&&trail.slice(1).every((cell,index)=>Math.abs(cell.x-trail[index].x)+Math.abs(cell.y-trail[index].y)===1)) {
      state={...state,trail,position:trail.at(-1)!,heading:typeof data.heading==='number'&&Number.isInteger(data.heading)&&data.heading>=0&&data.heading<4?data.heading:board.heading};
    }
    if(typeof data.parcel==='string') replay({type:'parcel',value:data.parcel});
    if(data.transport==='walk'||data.transport==='train'||data.transport==='bus') replay({type:'transport',value:data.transport});
    if(typeof data.departure==='string') replay({type:'departure',value:data.departure});
    if(data.help===true) replay({type:'help'});
  }
  return state;
}

/** Each mount owns only its root. The host owns the native dialog and world input gate. */
export function mountActivity(container:HTMLElement,options:MountActivityOptions):ActivityController {
  const found=activityDefinitions.find(item=>item.id===options.id);
  if (!found) throw new Error('Unknown activity.');
  const definition=found;
  const storageKey=`atlas.activity.v1:${options.sessionKey??'visitor'}:${options.id}:${options.level}`;
  let disposed=false, paused=false, busy=false, selectedCard='', feedback:string[]=[], error='', success=false;
  let panel=options.id==='market'?'goods':'counter', guideOpen=false, routeOpen=false, feedbackOpen=false, referenceTrigger='guide';
  const seenScenes=new Set<string>();
  let progress=options.progress;
  const newRun=():SavedRun=>{
    const runId=uuid(),selected=selectActivityScenarios(options.id,options.level,progress,runId);
    return {version:1,runId,id:options.id,level:options.level,scenarioIds:selected.scenarios.map(scene=>scene.id),index:0,
      state:initialActivityState(selected.scenarios[0]),hinted:false,stage:'playing',exerciseIds:[],attemptIds:[],discoveries:[],xp:0,reward:0,familiar:selected.familiar};
  };
  let run:SavedRun=newRun();
  try {
    const raw=localStorage.getItem(storageKey),saved:unknown=raw?JSON.parse(raw):undefined;
    if(saved&&typeof saved==='object') {
      const candidate=saved as SavedRun;
      const selected=Array.isArray(candidate.scenarioIds)?candidate.scenarioIds.map(id=>activityScenarios.find(scene=>scene.id===id&&scene.activityId===options.id&&scene.level===options.level)):[];
      if(candidate.version===1&&candidate.id===options.id&&candidate.level===options.level&&typeof candidate.runId==='string'&&selected.length===3&&selected.every(Boolean)
        &&new Set(candidate.scenarioIds).size===3&&Number.isInteger(candidate.index)&&candidate.index>=0&&candidate.index<3
        &&['playing','scene-complete','complete'].includes(candidate.stage)&&Array.isArray(candidate.exerciseIds)&&Array.isArray(candidate.attemptIds)&&Array.isArray(candidate.discoveries)) {
        run={...candidate,state:restoreBoard(selected[candidate.index]!,candidate.state),hinted:candidate.hinted===true,xp:Number.isFinite(candidate.xp)?candidate.xp:0,reward:Number.isFinite(candidate.reward)?candidate.reward:0};
        if(run.pending&&(!run.pending.context||typeof run.pending.answer!=='string'||run.pending.context.runId!==run.runId||run.pending.context.scenarioId!==selected[run.index]!.id)) delete run.pending;
      }
    }
  } catch { /* Unavailable or corrupt storage starts a fresh safe session. */ }
  const scenario=()=>activityScenarios.find(scene=>scene.id===run.scenarioIds[run.index])!;
  const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(run));}catch{/* The game still works without local storage. */}};
  const locked=()=>busy||!!run.pending;
  const focusKey=()=>container.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.focusKey:undefined;
  const actionButton=(action:string,label:string,extra='',className='activity-tool')=>`<button type="button" class="${className}" data-act="${action}" data-focus-key="${e(`${action}:${/data-value="([^"]*)"/.exec(extra)?.[1]??''}`)}" ${extra} ${locked()?'disabled':''}>${label}</button>`;
  const choice=(action:string,value:string,label:string,active:boolean)=>actionButton(action,label,`data-value="${e(value)}" aria-pressed="${active}"`,active?'activity-choice selected':'activity-choice');
  const panelTabs=(panels:[string,string][])=>`<nav class="activity-panel-tabs" aria-label="Mission panels">${panels.map(([value,label])=>`<button type="button" data-act="panel" data-value="${value}" data-focus-key="panel:${value}" aria-pressed="${panel===value}">${label}</button>`).join('')}</nav>`;
  const closeReferences=()=>{guideOpen=false;routeOpen=false;feedbackOpen=false;};
  const renderItems=(bag:Record<string,number>,empty:string)=>items(bag).length?items(bag).map(({item,quantity})=>`<button type="button" class="activity-inventory-piece ${e(item.id)}" data-act="remove-item" data-value="${e(item.id)}" data-focus-key="remove:${e(item.id)}" aria-label="Remove one ${e(item.german)}" ${locked()?'disabled':''}>${icon(item.icon)}<span>${e(item.german)}</span><b>×${quantity}</b><i>${icon('minus')}</i></button>`).join(''):`<span class="activity-empty">${e(empty)}</span>`;
  const renderStock=(stock:string[],bag:Record<string,number>)=>stock.map(id=>{
    const item=inventory[id];return actionButton('add-item',`${icon(item.icon)}<span>${e(item.german)}${scenario().board.kind==='market'?`<small>${money(item.price??0)}</small>`:''}</span><b>${bag[id]??0}</b>${icon('plus')}`,`data-value="${e(id)}"`,'activity-stock-item');
  }).join('');

  function cafeBoard(scene:ActivityScenario,state:CafeState):string {
    if(scene.board.kind!=='cafe')return '';
    const board=scene.board;
    return `${panelTabs([['counter','Order'],['kitchen','Kitchen'],...(board.goal.venue||board.goal.service||board.goal.slot?[['service','Service']] as [string,string][]:[])])}<div class="activity-cafe-counter"><div class="activity-bench-label">${icon('cup')} DEINE BESTELLUNG</div><div class="activity-tray" aria-label="Your assembled tray">${renderItems(state.tray,'Your tray is empty. Tap ingredients below.')}</div><div class="activity-pantry">${renderStock(board.stock,state.tray)}</div></div><div class="activity-kitchen"><div class="activity-bench-label">${icon('lantern')} IN DER KÜCHE <span>${state.steps.length} steps</span></div><ol class="activity-recipe-track">${state.steps.map((step,index)=>`<li><b>${index+1}</b>${icon(kitchen[step]?.icon??'cup')}<span>${e(kitchen[step]?.label??step)}</span></li>`).join('')||'<li class="activity-empty">Build your preparation sequence.</li>'}</ol><div class="activity-kitchen-tools">${board.actions.map(step=>actionButton('step',`${icon(kitchen[step]?.icon??'cup')}<span>${e(kitchen[step]?.label??step)}</span>`,`data-value="${e(step)}"`)).join('')}</div>${actionButton('undo-step',`${icon('refresh')} Undo the last step`,'','activity-link')}</div>${board.goal.venue||board.goal.service||board.goal.slot?`<div class="activity-service-settings">${board.goal.venue?`<div><span>WO?</span>${choice('venue','inside','Drinnen',state.venue==='inside')}${choice('venue','outside','Draußen',state.venue==='outside')}</div>`:''}${board.goal.service?`<div><span>WIE?</span>${choice('service','table','Am Tisch',state.service==='table')}${choice('service','takeaway','Zum Mitnehmen',state.service==='takeaway')}</div>`:''}${board.goal.slot?`<div><span>WANN?</span>${['09:00','18:00','18:30','19:30'].map(slot=>choice('slot',slot,slot,state.slot===slot)).join('')}</div>`:''}</div>`:''}`;
  }

  function marketBoard(scene:ActivityScenario,state:MarketState):string {
    if(scene.board.kind!=='market')return '';
    const board=scene.board,total=marketTotal(state),change=state.changeCoins.reduce((sum,coin)=>sum+coin,0);
    return `${panelTabs([['goods','Goods'],['payment','Payment']])}<div class="activity-market-goods"><div class="activity-market-ledger"><span>${icon('basket')} IM BEUTEL <b>${money(board.budget)}</b></span><span class="${total>board.budget?'over-budget':''}">WARENKORB <b>${money(total)}</b></span><span>ÜBRIG <b>${money(board.budget-total)}</b></span></div><div class="activity-market-stall">${renderStock(board.stock,state.basket)}</div>${board.trade?`<div class="activity-trade-offer">${icon('refresh')}<span><strong>Ein Tausch</strong>${e(inventory[board.trade.give].german)} → ${board.trade.quantity} × ${e(inventory[board.trade.receive].german)}</span>${actionButton('trade',state.traded?`${icon('check')} Getauscht`:'Tauschen',state.traded?'disabled':'','activity-choice')}</div>`:''}<div class="activity-tray market-basket" aria-label="Your goods">${renderItems(state.basket,'Choose the goods for your basket.')}</div></div><div class="activity-payment"><div><span class="activity-bench-label">BEZAHLEN</span>${choice('payment','cash','Bar',state.method==='cash')}${choice('payment','card','Mit Karte',state.method==='card')}</div><div class="activity-change-purse"><span>${state.method==='cash'?`GEGEBEN ${money(board.tender)} · WECHSELGELD`:'KARTENZAHLUNG · KEIN WECHSELGELD'}</span><strong>${money(change)}</strong><div class="activity-coins">${[10,20,50,100,200,500,1000].map(coin=>actionButton('coin',money(coin),`data-value="${coin}" aria-label="Add ${money(coin)} to the change"`,'activity-coin')).join('')}</div>${actionButton('undo-coin',`${icon('refresh')} Take back a coin`,'','activity-link')}</div></div>`;
  }

  function detectiveBoard(scene:ActivityScenario,state:DetectiveState):string {
    if(scene.board.kind!=='detective')return '';
    const board=scene.board;
    return `<div class="activity-evidence-room"><div class="activity-evidence-pile"><div class="activity-bench-label">${icon('clue')} BEWEISE</div>${board.cards.map(card=>actionButton('select-card',`${icon(card.icon)}<span lang="de">${e(card.german)}</span><small>${Object.values(state.links).includes(card.id)?'On the board':'Select, then place'}</small>`,`data-value="${e(card.id)}" aria-pressed="${selectedCard===card.id}"`,selectedCard===card.id?'activity-evidence selected':'activity-evidence')).join('')}</div><div class="activity-investigation-board"><div class="activity-bench-label">${icon('scroll')} DIE REKONSTRUKTION</div><p>${selectedCard?'Choose where this evidence belongs.':'Select an evidence slip from the desk.'}</p>${board.slots.map((slot,index)=>{const card=board.cards.find(item=>item.id===state.links[slot.id]);return `<div class="activity-evidence-link"><span class="activity-link-number">${index+1}</span>${actionButton('place-card',`<strong lang="de">${e(slot.german)}</strong><span>${card?`${icon(card.icon)} ${e(card.german)}`:'Place an evidence slip here'}</span>`,`data-value="${e(slot.id)}"`,'activity-evidence-slot')}${card?actionButton('unlink',icon('close'),`data-value="${e(slot.id)}" aria-label="Remove evidence from ${e(slot.german)}"`,'activity-unpin'):''}</div>`;}).join('')}</div></div>`;
  }

  function deliveryBoard(scene:ActivityScenario,state:DeliveryState):string {
    if(scene.board.kind!=='delivery')return '';
    const board=scene.board,pathLines=board.roads.filter(cell=>board.roads.some(other=>other.x===cell.x+1&&other.y===cell.y||other.x===cell.x&&other.y===cell.y+1));
    const road=board.roads.map(cell=>{const visited=state.trail.some(point=>cellKey(point)===cellKey(cell)),here=cellKey(state.position)===cellKey(cell),goal=cellKey(board.goal)===cellKey(cell),checkpoint=cellKey(board.checkpoint)===cellKey(cell),start=cellKey(board.start)===cellKey(cell);return `<div class="activity-route-cell ${visited?'visited':''} ${here?'here':''}" style="grid-column:${cell.x+1};grid-row:${cell.y+1}">${here?`<span class="activity-courier" style="--heading:${state.heading*90}deg">${icon('send')}</span>`:goal?icon('flag'):checkpoint?icon(board.help?'users':'lantern'):start?icon('parcel'):''}${goal?`<small>${e(board.goalName)}</small>`:checkpoint?`<small>${e(board.checkpointName)}</small>`:''}</div>`;}).join('');
    const directionIndex=board.path.findIndex(cell=>cellKey(cell)===cellKey(state.position));
    const currentDirection=nextDeliveryDirection(board,state);
    const directions=`<div class="activity-route-instructions"><div class="activity-bench-label">${icon('route')} DER WEG</div><div class="activity-active-direction">${currentDirection?`<span><small>Next step ${directionIndex+1} of ${board.directions.length}</small><b lang="de">${e(currentDirection)}</b></span><button type="button" data-act="speak-current-direction" aria-label="Hear the next direction">${icon('volume')}</button>`:`<span>${directionIndex===board.path.length-1?'At the destination. Deliver your parcel.':'Check the full route to find your way back.'}</span>`}</div><button type="button" class="activity-route-toggle activity-link" data-act="route" data-focus-key="route" aria-expanded="${routeOpen}">All directions ${icon('route')}</button></div>`;
    return `<div class="activity-dispatch-kit"><div><span class="activity-bench-label">FÜR WEN?</span>${board.parcels.map(parcel=>choice('parcel',parcel,`${icon('parcel')} ${e(parcel)}`,state.parcel===parcel)).join('')}</div><div><span class="activity-bench-label">VERBINDUNG</span>${([['walk','Zu Fuß'],['train','Zug'],['bus','Bus']] as const).map(([transport,label])=>choice('transport',transport,label,state.transport===transport)).join('')}</div>${board.departure?`<div><span class="activity-bench-label">ABFAHRT</span>${['08:00','09:00','09:20','09:40'].map(time=>choice('departure',time,time,state.departure===time)).join('')}</div>`:''}</div><div class="activity-delivery-main"><div class="activity-route-map" role="img" aria-label="Route map. ${e(board.checkpointName)} checkpoint and ${e(board.goalName)} destination. Use the turn buttons below." style="--columns:${board.columns};--rows:${board.rows}"><svg class="activity-road-lines" viewBox="0 0 ${board.columns*100} ${board.rows*100}" preserveAspectRatio="none" aria-hidden="true">${pathLines.flatMap(cell=>board.roads.filter(other=>other.x===cell.x+1&&other.y===cell.y||other.x===cell.x&&other.y===cell.y+1).map(other=>`<path d="M${cell.x*100+50},${cell.y*100+50} L${other.x*100+50},${other.y*100+50}"/>`)).join('')}</svg>${road}<span class="activity-route-compass">${icon('compass')} N</span></div>${directions}</div><div class="activity-navigation"><div class="activity-turn-controls">${actionButton('turn',`${icon('arrow')}<span>Links</span>`,'data-value="left"','activity-turn left')}${actionButton('turn',`${icon('arrow')}<span>Geradeaus</span>`,'data-value="straight"','activity-turn straight')}${actionButton('turn',`${icon('arrow')}<span>Rechts</span>`,'data-value="right"','activity-turn right')}${actionButton('turn',`${icon('refresh')}<span>Zurück</span>`,'data-value="back"','activity-turn back')}</div><p role="status">${e(state.lastEvent)}</p>${board.help?actionButton('help',state.help?`${icon('check')} Hilfe ist da`:`${icon('users')} Hilfe holen`,state.help?'disabled':'','activity-choice'):''}</div>`;
  }

  function render(focusTarget?:string):void {
    if(disposed)return;
    const activeFocus=focusTarget??focusKey(),scene=scenario(),npc=npcs.find(item=>item.id===(options.venue?.npcId??definition.npcId)),image=options.venue?.asset??`/assets/${{A1:'lindenhafen',A2:'waldruh',B1:'nebelstadt'}[options.level]}.webp`;
    let content='';
    if(paused) content=`<div class="activity-intermission">${icon('lantern')}<span class="activity-kicker">YOUR PLACE IS KEPT</span><h2>A moment by the lantern.</h2><p>Your ${definition.id==='delivery'?'parcel':'work'} stays exactly where you left it. There is no clock to race.</p><button type="button" class="activity-primary" data-act="resume">Return to the mission ${icon('arrow')}</button><button type="button" class="activity-link" data-act="leave">Save and leave</button></div>`;
    else if(run.familiar&&run.stage==='playing'&&run.index===0&&!run.pending) content=`<div class="activity-intermission">${icon('leaf')}<span class="activity-kicker">FAMILIAR WORDS ARE RESTING</span><h2>${e(npc?.name??'Your host')} remembers your help.</h2><p>These expressions are comfortable in your memory right now. You can keep exploring, or choose another shift for the story.</p><button type="button" class="activity-primary" data-act="free-play">Play another mission ${icon('arrow')}</button><button type="button" class="activity-link" data-act="leave">Back to exploring</button></div>`;
    else if(run.stage==='complete') content=`<div class="activity-intermission activity-finale">${icon('lantern')}<span class="activity-kicker">A SMALL PART OF THE MYSTERY RESTORED</span><h2>Three tasks. One new lead.</h2><div class="activity-discoveries">${run.discoveries.map(discovery=>`<p>${icon('clue')}<span>${e(discovery)}</span></p>`).join('')}</div><div class="activity-reward"><strong>${run.reward?`+${run.reward}`:'✓'}</strong><span>${run.reward?'adventure XP · reward saved':'Mission recorded · familiar rewards stay earned'}</span></div><button type="button" class="activity-primary" data-act="leave">${options.venue ? `Return to ${e(options.venue.name)}` : 'Return to the world'} ${icon('arrow')}</button><button type="button" class="activity-link" data-act="new-run">Try a different mission</button></div>`;
    else if(run.stage==='scene-complete') content=`<div class="activity-intermission activity-discovery"><span class="activity-discovery-stamp">${icon('check')}</span><span class="activity-kicker">${definition.id==='delivery'?'DELIVERED':definition.id==='detective'?'RECONSTRUCTION ACCEPTED':definition.id==='market'?'DEAL COMPLETE':'ORDER SERVED'}</span><h2>${e(titleCase(scene.title))}</h2><blockquote lang="de">${e(exerciseForScenario(scene).answer)}</blockquote><p>${e(scene.discovery)}</p><div class="activity-reward"><strong>✓</strong><span>Saved to your learning record${run.hinted?' · with help':''}</span></div>${error?`<p class="activity-error" role="alert">${e(error)}</p>`:''}<button type="button" class="activity-primary" data-act="next" ${busy?'disabled':''}>${busy?'Saving the mission…':run.index===2?'Follow the new lead':'The next task'} ${icon('arrow')}</button><button type="button" class="activity-link" data-act="pause" ${busy?'disabled':''}>Pause here</button></div>`;
    else {
      const board=run.state.kind==='cafe'?cafeBoard(scene,run.state):run.state.kind==='market'?marketBoard(scene,run.state):run.state.kind==='detective'?detectiveBoard(scene,run.state):deliveryBoard(scene,run.state);
      content=`<div class="activity-task-header"><div><span class="activity-kicker">${e(npc?.name??'Your host')} · ${options.level}</span><h2>${e(titleCase(scene.title))}</h2></div></div><div class="activity-order"><div>${icon(definition.icon)}<span>${definition.id==='detective'?'DIE AUSSAGE':definition.id==='delivery'?'DER AUFTRAG':'DIE BESTELLUNG'}</span><button type="button" data-act="speak" aria-label="Hear the German ${definition.id==='detective'?'statement':'instructions'}">${icon('volume')}</button></div><p lang="de">${e(scene.german)}</p></div><div class="activity-scene-board activity-${definition.id}-board" data-panel="${e(panel)}">${board}</div><div class="activity-response ${success?'positive':''}" role="status" aria-live="polite">${busy?`${icon('clock')} Saving your actions…`:error?`<p class="activity-error">${e(error)}</p>`:feedback.length?`<p>${icon('clue')}<span>${e(feedback[0])}</span></p>${feedback.length>1?'<button type="button" class="activity-link" data-act="feedback" data-focus-key="feedback" aria-label="Read all feedback">Details</button>':''}`:''}</div><footer class="activity-task-actions">${actionButton('hint',`${icon('chat')} Clarify`,'','activity-link')}${actionButton('reset-board',`${icon('refresh')} Reset`,'','activity-link')}<button type="button" class="activity-primary" data-act="submit" ${busy?'disabled':''}>${busy?'Saving…':run.pending?'Retry this save':definition.id==='cafe'?'Serve the order':definition.id==='market'?'Close the deal':definition.id==='detective'?'Present the evidence':'Deliver the parcel'} ${icon('arrow')}</button></footer>`;
    }
    const reference=guideOpen?`<aside class="activity-guide" role="dialog" aria-modal="true" aria-label="Mission help"><header><h3>How to play</h3><button type="button" data-act="guide" data-focus-key="guide-close" aria-label="Close mission help">${icon('close')}</button></header><p>${e(options.venue?.briefing??scene.briefing)}</p>${run.hinted?`<div class="activity-clarification">${icon('sparkles')}<p>${e(scene.hint)}</p></div>`:''}<p class="activity-no-pressure">No time limit. Mistakes keep the scene open. Clarification counts as help.</p></aside>`:feedbackOpen?`<aside class="activity-feedback-details" role="dialog" aria-modal="true" aria-label="Task feedback"><header><h3>Check your actions</h3><button type="button" data-act="feedback" data-focus-key="feedback-close" aria-label="Close feedback">${icon('close')}</button></header>${feedback.map(line=>`<p>${icon('clue')}<span>${e(line)}</span></p>`).join('')}</aside>`:routeOpen&&scene.board.kind==='delivery'?`<aside class="activity-route-list" role="dialog" aria-modal="true" aria-label="Full delivery route"><header><h3>The full route</h3><button type="button" data-act="route" data-focus-key="route-close" aria-label="Close full route">${icon('close')}</button></header><p>From the start, facing ${['north','east','south','west'][scene.board.heading]}.</p><ol>${scene.board.directions.map((line,index)=>`<li><span lang="de">${e(line)}</span><button type="button" data-act="speak-direction" data-value="${index}" aria-label="Hear direction ${index+1}">${icon('volume')}</button></li>`).join('')}</ol></aside>`:'';
    container.innerHTML=`<section class="activity-shell ${definition.id}" data-saving="${busy}" style="--activity-art:url('${e(image)}')"><header class="activity-banner" ${reference?'inert':''}><span>${icon(definition.icon)}<b>${e(options.venue?.title??definition.title)}</b></span><div class="activity-rounds" aria-label="${Math.min(run.index+1,3)} of 3 tasks">${[0,1,2].map(index=>`<i class="${index<run.exerciseIds.length?'done':index===run.index?'current':''}">${icon('lantern')}</i>`).join('')}</div><button type="button" class="activity-guide-toggle" data-act="guide" data-focus-key="guide" aria-expanded="${guideOpen}" aria-label="How to play">${icon('book')}</button><button type="button" class="activity-pause" data-act="pause" aria-label="Pause activity" ${busy?'disabled':''}>${icon('clock')}</button></header><div class="activity-content" ${reference?'inert':''}>${content}</div>${reference}</section>`;
    if(!paused&&!run.familiar&&run.stage==='playing'&&!seenScenes.has(scene.id)) {
      seenScenes.add(scene.id);
      options.onSceneVisible?.(scene.exerciseId,{activityId:scene.activityId,level:scene.level,scenarioId:scene.id});
    }
    if(activeFocus) Array.from(container.querySelectorAll<HTMLButtonElement>('[data-focus-key]')).find(button=>button.dataset.focusKey===activeFocus&&!button.disabled)?.focus({preventScroll:true});
  }

  async function submit():Promise<void> {
    if(busy||run.stage!=='playing'||disposed)return;
    const active=run,scene=scenario(),evaluation=evaluateActivity(scene,active.state);
    if(!active.pending) active.pending={answer:evaluation.answer,hinted:active.hinted,context:{runId:active.runId,activityId:options.id,level:options.level,scenarioId:scene.id,attemptId:uuid()}};
    const pending=active.pending;
    busy=true;error='';feedback=[];persist();render();
    try {
      // Physical task controls assess contextual recognition, not unaided
      // sentence production. Showing the printed German does not count as listening.
      const exercise=exerciseForScenario(scene);
      const supported=pending.hinted||exercise.mode!=='choice';
      const result=await options.submit(exercise,pending.answer,supported,'recognition',pending.context);
      progress=result.progress;options.onProgress?.(result.progress);
      if(run!==active)return;
      delete active.pending;
      if(result.correct&&evaluation.valid) {
        active.exerciseIds.push(scene.exerciseId);active.attemptIds.push(result.attemptId??pending.context.attemptId);
        active.discoveries.push(scene.discovery);active.xp+=result.xpAdded;active.stage='scene-complete';
        if(scene.board.kind==='delivery'&&!disposed) options.onDelivery?.({scenarioId:scene.id,name:scene.board.goalName,recipient:scene.board.parcel,level:scene.level});
        success=true;
      } else {
        success=false;
        active.hinted=true; // Corrective English feedback is support on the retry.
        feedback=evaluation.feedback.length?evaluation.feedback:[result.reason??'The town could not confirm that answer. Try again or ask for clarification.'];
      }
    } catch(cause) {
      if(run===active) error=`${cause instanceof Error?cause.message:'The connection was interrupted.'} Your task is safe. Retry saves the same attempt.`;
    } finally {busy=false;persist();render();}
  }

  async function next():Promise<void> {
    if(busy||run.stage!=='scene-complete'||disposed)return;
    if(run.index<2) {
      run.index++;run.state=initialActivityState(scenario());run.stage='playing';run.hinted=false;selectedCard='';panel=options.id==='market'?'goods':'counter';closeReferences();feedback=[];error='';success=false;persist();render();return;
    }
    const active=run;busy=true;error='';render();
    try {
      const result=await options.complete({runId:active.runId,activityId:options.id,level:options.level,exerciseIds:[...active.exerciseIds],attemptIds:[...active.attemptIds]});
      progress=result.progress;options.onProgress?.(result.progress);
      if(run!==active)return;
      active.reward=result.xpAdded;active.stage='complete';
    } catch(cause) {if(run===active) error=`${cause instanceof Error?cause.message:'The mission could not be recorded.'} Your three completed tasks are safe. Try again.`;}
    finally {busy=false;persist();render();}
  }

  function reset():void {if(disposed||busy||run.pending)return;run=newRun();paused=false;selectedCard='';panel=options.id==='market'?'goods':'counter';closeReferences();feedback=[];error='';success=false;persist();render();}
  function dispatch(action:ActivityAction):void {if(locked()||run.stage!=='playing'||paused)return;run.state=applyActivityAction(scenario(),run.state,action);feedbackOpen=false;feedback=[];error='';persist();render();}
  const click=(event:MouseEvent)=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if(!button||!container.contains(button)||button.disabled)return;
    event.stopPropagation();
    const act=button.dataset.act,value=button.dataset.value??'';
    if(act==='leave'){persist();options.onClose?.();return;}
    if(act==='panel'){if(['counter','kitchen','service','goods','payment'].includes(value)){panel=value;render();}return;}
    if(act==='guide'){const open=!guideOpen;if(open)referenceTrigger=focusKey()??'guide';closeReferences();guideOpen=open;render(open?'guide-close':referenceTrigger);return;}
    if(act==='route'){const open=!routeOpen;if(open)referenceTrigger=focusKey()??'route';closeReferences();routeOpen=open;render(open?'route-close':referenceTrigger);return;}
    if(act==='feedback'){const open=!feedbackOpen;if(open)referenceTrigger=focusKey()??'feedback';closeReferences();feedbackOpen=open;render(open?'feedback-close':referenceTrigger);return;}
    if(act==='pause'){if(!busy){paused=true;closeReferences();persist();render();}return;}
    if(act==='resume'){paused=false;render();return;}
    if(act==='free-play'){run.familiar=false;persist();render();return;}
    if(act==='new-run'){reset();return;}
    if(act==='speak'){options.speak(scenario().german);return;}
    if(act==='speak-current-direction'&&scenario().board.kind==='delivery'&&run.state.kind==='delivery'){const direction=nextDeliveryDirection(scenario().board as DeliveryBoard,run.state);if(direction)options.speak(direction);return;}
    if(act==='speak-direction'&&scenario().board.kind==='delivery'){options.speak((scenario().board as DeliveryBoard).directions[Number(value)]??'');return;}
    if(act==='submit'){void submit();return;}
    if(act==='next'){void next();return;}
    if(locked())return;
    if(act==='hint'){run.hinted=true;referenceTrigger='hint:';closeReferences();guideOpen=true;persist();render('guide-close');return;}
    if(act==='select-card'){selectedCard=value;render();return;}
    if(act==='place-card'){if(selectedCard){dispatch({type:'link',slotId:value,cardId:selectedCard});selectedCard='';render();}else{feedback=['Select an evidence slip first, then choose its place on the board.'];render();}return;}
    const actions:Record<string,ActivityAction>={
      'add-item':{type:'item',id:value,delta:1},'remove-item':{type:'item',id:value,delta:-1},
      step:{type:'step',id:value},'undo-step':{type:'undo-step'},venue:{type:'venue',value:value as 'inside'|'outside'},
      service:{type:'service',value:value as 'table'|'takeaway'},slot:{type:'slot',value},payment:{type:'payment',value:value as 'cash'|'card'},
      coin:{type:'coin',value:Number(value)},'undo-coin':{type:'undo-coin'},trade:{type:'trade'},unlink:{type:'unlink',slotId:value},
      turn:{type:'turn',value:value as 'left'|'straight'|'right'|'back'},parcel:{type:'parcel',value},transport:{type:'transport',value:value as 'walk'|'train'|'bus'},
      departure:{type:'departure',value},help:{type:'help'},'reset-board':{type:'reset'},
    };
    if(act&&actions[act])dispatch(actions[act]);
  };
  const keydown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&(guideOpen||routeOpen||feedbackOpen)){event.preventDefault();event.stopPropagation();closeReferences();render(referenceTrigger);return;}
    if(guideOpen||routeOpen||feedbackOpen){
      if(event.key==='Tab'){
        const buttons=Array.from(container.querySelectorAll<HTMLButtonElement>('.activity-guide button,.activity-route-list button,.activity-feedback-details button')).filter(button=>!button.disabled);
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        if(buttons.length){event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus({preventScroll:true});}
      }
      return;
    }
    if(run.state.kind!=='delivery'||locked()||paused||run.stage!=='playing'||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const turns:Record<string,'left'|'straight'|'right'|'back'>={ArrowUp:'straight',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right'};
    dispatch({type:'turn',value:turns[event.key]});
  };
  container.addEventListener('click',click);container.addEventListener('keydown',keydown);
  persist();render();
  return {
    destroy(){if(disposed)return;persist();disposed=true;container.removeEventListener('click',click);container.removeEventListener('keydown',keydown);container.replaceChildren();},
    pause(){if(!disposed){paused=true;closeReferences();persist();render();}},resume(){if(!disposed){paused=false;render();}},reset,
  };
}
