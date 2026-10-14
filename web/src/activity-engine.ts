import { quests, type Exercise, type Level } from './content.ts';
import type { Progress } from './api';
import { seededShuffle } from './game-shuffle.ts';
import { getContentClient } from './content-api';
import { hydrateNarrative } from './content-narratives';
import type { AlignedLine } from './aligned-line';

export type ActivityId = 'cafe' | 'market' | 'detective' | 'delivery';
export type ActivityMode = 'recognition' | 'production' | 'listening';
export interface ActivityDefinition {
  id: ActivityId; title: string; description: string; npcId: string; icon: string;
  objectKinds: string[]; levels: Level[]; scenarioCount: number;
}
export const activityDefinitions: readonly ActivityDefinition[] = [
  { id: 'cafe', title: 'A shift at the Lantern Café', description: 'Read the orders, assemble a tray and keep the kitchen running.', npcId: 'marta', icon: 'cup', objectKinds: ['fountain', 'garden'], levels: ['A1','A2','B1'], scenarioCount: 12 },
  { id: 'market', title: 'The midnight market', description: 'Trade useful things, balance a budget and count the change.', npcId: 'fritz', icon: 'basket', objectKinds: ['garden', 'noticeboard'], levels: ['A1','A2','B1'], scenarioCount: 12 },
  { id: 'detective', title: 'The evidence room', description: 'Connect the witnesses, reconstruct events and uncover a missing fact.', npcId: 'ada', icon: 'clue', objectKinds: ['instrument', 'clock'], levels: ['A1','A2','B1'], scenarioCount: 12 },
  { id: 'delivery', title: 'Letters through the mist', description: 'Follow German directions, choose a connection and deliver the right parcel.', npcId: 'lina', icon: 'parcel', objectKinds: ['parcel', 'lantern', 'noticeboard'], levels: ['A1','A2','B1'], scenarioCount: 12 },
];

export interface InventoryItem { id: string; german: string; icon: string; price?: number; }
export const inventory: Record<string, InventoryItem> = {};

export interface CafeGoal {
  items: Record<string, number>; steps: string[]; venue?: 'inside'|'outside'; service?: 'table'|'takeaway'; slot?: string;
}
export interface CafeBoard { kind: 'cafe'; stock: string[]; actions: string[]; goal: CafeGoal; }
export interface MarketBoard {
  kind: 'market'; stock: string[]; goal: Record<string,number>; budget: number; tender: number;
  method: 'cash'|'card'; initialBasket?: Record<string,number>; trade?: { give:string; receive:string; quantity:number };
}
export interface EvidenceCard { id: string; german: string; icon: string; }
export interface EvidenceSlot { id: string; german: string; }
export interface DetectiveBoard { kind: 'detective'; cards: EvidenceCard[]; slots: EvidenceSlot[]; }
export interface Cell { x:number; y:number; }
export type Turn = 'left'|'straight'|'right'|'back';
export interface DeliveryBoard {
  kind: 'delivery'; columns:number; rows:number; roads:Cell[]; start:Cell; heading:number; path:Cell[];
  goal:Cell; goalName:string; checkpoint:Cell; checkpointName:string; parcel:string; parcels:string[];
  transport:'walk'|'train'|'bus'; departure?:string; help?:boolean; directions: string[];
}
export type ActivityBoard = CafeBoard | MarketBoard | DetectiveBoard | DeliveryBoard;
export interface ActivityScenario {
  id:string; activityId:ActivityId; level:Level; exerciseId:string; title:string; briefing:string;
  german:string; aligned?:AlignedLine; audioId?:string; hint:string; discovery:string; wordTags:string[]; board:ActivityBoard;
}

const cellKey = (cell: Cell) => `${cell.x},${cell.y}`;
const scenarios: ActivityScenario[] = [];
export const activityScenarios: readonly ActivityScenario[] = scenarios;
export const activityAudioJobs: {id:string;text:string}[] = [];
interface ActivityContent { id?:string; scenarios:ActivityScenario[]; inventory:Record<string,InventoryItem>; }
const activityRecordIds:Record<ActivityId,Record<Level,string>>={
 cafe:{A1:'minigames:activity:cafe:A1',A2:'minigames:activity:cafe:A2',B1:'minigames:activity:cafe:B1'},
 market:{A1:'minigames:activity:market:A1',A2:'minigames:activity:market:A2',B1:'minigames:activity:market:B1'},
 detective:{A1:'minigames:activity:detective:A1',A2:'minigames:activity:detective:A2',B1:'minigames:activity:detective:B1'},
 delivery:{A1:'minigames:activity:delivery:A1',A2:'minigames:activity:delivery:A2',B1:'minigames:activity:delivery:B1'},
};
export function installActivityContent(value:ActivityContent):void {
 Object.assign(inventory,value.inventory);
 for(const authored of value.scenarios){
  const scenario=authored.board.kind==='detective'?{...authored,board:{...authored.board,slots:authored.board.slots.map(({id,german})=>({id,german}))}}:authored;
  const index=scenarios.findIndex(current=>current.id===scenario.id);
  if(index<0)scenarios.push(scenario);else scenarios[index]=scenario;
  const clip=scenario.audioId??scenario.id;
  const jobs=[{id:`activity-${clip}-order`,text:scenario.german},...(scenario.board.kind==='detective'?scenario.board.cards.map(card=>({id:`activity-${clip}-${card.id}`,text:card.german})):[])];
  for(const job of jobs){const existing=activityAudioJobs.findIndex(current=>current.id===job.id);if(existing<0)activityAudioJobs.push(job);else activityAudioJobs[existing]=job;}
 }
}
export function clearActivityContent():void {scenarios.splice(0);activityAudioJobs.splice(0);for(const key of Object.keys(inventory))delete inventory[key];}
export async function loadActivityContent(id:ActivityId,level:Level):Promise<void>{
 const client=getContentClient();
 const value=await hydrateNarrative(await client.minigame<ActivityContent>(activityRecordIds[id][level]));
 installActivityContent(value);
 await client.exercises(value.scenarios.map(scenario=>scenario.exerciseId));
}
export const exerciseForScenario = (scenario:ActivityScenario): Exercise => {
  const exercise = quests.flatMap(quest=>quest.exercises).find(item=>item.id===scenario.exerciseId);
  if (!exercise) throw new Error(`Missing authored activity exercise: ${scenario.exerciseId}`);
  return exercise;
};

export interface CafeState { kind:'cafe'; tray:Record<string,number>; steps:string[]; venue:'inside'|'outside'; service:'table'|'takeaway'; slot:string; }
export interface MarketState { kind:'market'; basket:Record<string,number>; method:'cash'|'card'; changeCoins:number[]; traded:boolean; }
export interface DetectiveState { kind:'detective'; links:Record<string,string>; }
export interface DeliveryState { kind:'delivery'; position:Cell; heading:number; trail:Cell[]; parcel:string; transport:DeliveryBoard['transport']; departure:string; help:boolean; lastEvent:string; }
export type ActivityState = CafeState|MarketState|DetectiveState|DeliveryState;
export type ActivityAction =
  | {type:'item';id:string;delta:number} | {type:'step';id:string} | {type:'undo-step'}
  | {type:'venue';value:'inside'|'outside'} | {type:'service';value:'table'|'takeaway'} | {type:'slot';value:string}
  | {type:'payment';value:'cash'|'card'} | {type:'coin';value:number} | {type:'undo-coin'} | {type:'trade'}
  | {type:'link';slotId:string;cardId:string} | {type:'unlink';slotId:string}
  | {type:'turn';value:Turn} | {type:'parcel';value:string} | {type:'transport';value:DeliveryBoard['transport']}
  | {type:'departure';value:string} | {type:'help'} | {type:'reset'};

export function initialActivityState(scenario:ActivityScenario): ActivityState {
  const board = scenario.board;
  if (board.kind==='cafe') return {kind:'cafe',tray:{},steps:[],venue:'outside',service:'table',slot:''};
  if (board.kind==='market') return {kind:'market',basket:{...board.initialBasket},method:'cash',changeCoins:[],traded:false};
  if (board.kind==='detective') return {kind:'detective',links:{}};
  return {kind:'delivery',position:{...board.start},heading:board.heading,trail:[{...board.start}],parcel:'',transport:'walk',departure:'',help:false,lastEvent:'Choose the parcel, then follow the streets.'};
}

function adjust(items:Record<string,number>,id:string,delta:number): Record<string,number> {
  const next={...items}, quantity=Math.max(0,Math.min(9,(next[id]??0)+Math.sign(delta)));
  if (quantity) next[id]=quantity; else delete next[id];
  return next;
}

/** Pure state changes: no server answer is generated by an inventory click. */
export function applyActivityAction(scenario:ActivityScenario,state:ActivityState,action:ActivityAction): ActivityState {
  if (action.type==='reset') return initialActivityState(scenario);
  const board=scenario.board;
  if (board.kind==='cafe'&&state.kind==='cafe') {
    if (action.type==='item'&&board.stock.includes(action.id)&&Number.isFinite(action.delta)) return {...state,tray:adjust(state.tray,action.id,action.delta)};
    if (action.type==='step'&&board.actions.includes(action.id)&&state.steps.length<8) return {...state,steps:[...state.steps,action.id]};
    if (action.type==='undo-step') return {...state,steps:state.steps.slice(0,-1)};
    if (action.type==='venue') return {...state,venue:action.value};
    if (action.type==='service') return {...state,service:action.value};
    if (action.type==='slot'&&['08:00','09:00','18:00','18:30','19:30'].includes(action.value)) return {...state,slot:action.value};
  }
  if (board.kind==='market'&&state.kind==='market') {
    if (action.type==='item'&&board.stock.includes(action.id)&&Number.isFinite(action.delta)) return {...state,basket:adjust(state.basket,action.id,action.delta),changeCoins:[]};
    if (action.type==='payment') return {...state,method:action.value,changeCoins:[]};
    if (action.type==='coin'&&[10,20,50,100,200,500,1000].includes(action.value)&&state.changeCoins.length<30) return {...state,changeCoins:[...state.changeCoins,action.value]};
    if (action.type==='undo-coin') return {...state,changeCoins:state.changeCoins.slice(0,-1)};
    if (action.type==='trade'&&board.trade&&!state.traded&&(state.basket[board.trade.give]??0)>0) {
      const basket=adjust(state.basket,board.trade.give,-1);
      basket[board.trade.receive]=(basket[board.trade.receive]??0)+board.trade.quantity;
      return {...state,basket,traded:true,changeCoins:[]};
    }
  }
  if (board.kind==='detective'&&state.kind==='detective') {
    if (action.type==='unlink') {const links={...state.links};delete links[action.slotId];return {...state,links};}
    if (action.type==='link'&&board.slots.some(slot=>slot.id===action.slotId)&&board.cards.some(card=>card.id===action.cardId)) {
      const links=Object.fromEntries(Object.entries(state.links).filter(([,id])=>id!==action.cardId));
      links[action.slotId]=action.cardId;return {...state,links};
    }
  }
  if (board.kind==='delivery'&&state.kind==='delivery') {
    if (action.type==='parcel'&&board.parcels.includes(action.value)) return {...state,parcel:action.value};
    if (action.type==='transport'&&['walk','train','bus'].includes(action.value)) return {...state,transport:action.value};
    if (action.type==='departure'&&['08:00','09:00','09:20','09:40'].includes(action.value)) return {...state,departure:action.value};
    if (action.type==='help') return {...state,help:true,lastEvent:'The harbor workers secure the crossing. You can continue.'};
    if (action.type==='turn') {
      const offsets={left:3,straight:0,right:1,back:2}, heading=(state.heading+offsets[action.value])%4;
      const directions=[[0,-1],[1,0],[0,1],[-1,0]], [dx,dy]=directions[heading];
      const position={x:state.position.x+dx,y:state.position.y+dy};
      if (!board.roads.some(cell=>cellKey(cell)===cellKey(position))) return {...state,lastEvent:'A wall or water blocks that way. Your parcel is safe; choose another turn.'};
      if (board.help&&!state.help&&cellKey(position)===cellKey(board.checkpoint)) return {...state,lastEvent:'The crossing needs help. Call the harbor workers before continuing.'};
      return {...state,position,heading,trail:[...state.trail,position].slice(-100),lastEvent:cellKey(position)===cellKey(board.goal)?`Arrived at ${board.goalName}. Check the parcel and deliver.`:cellKey(position)===cellKey(board.checkpoint)?`${board.checkpointName} reached. Continue toward ${board.goalName}.`:'On the way. Read the next direction.'};
    }
  }
  return state;
}

export const marketTotal = (state:MarketState): number => Object.entries(state.basket).reduce((total,[id,quantity])=>total+(inventory[id]?.price??0)*quantity,0);
export const money = (cents:number): string => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
const sameInventory = (actual:Record<string,number>,expected:Record<string,number>): boolean =>
  Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([id,quantity])=>actual[id]===quantity);

export interface ActivityEvaluation { valid:boolean; answer:string; feedback:string[]; }
/** Local readiness feedback; correctness comes from the server's board assessment. */
export function evaluateActivity(scenario:ActivityScenario,state:ActivityState): ActivityEvaluation {
  const board=scenario.board, feedback:string[]=[];
  if (state.kind!==board.kind) feedback.push('This task needs a fresh board. Restart the scene.');
  else if (board.kind==='cafe'&&state.kind==='cafe') {
    if (!sameInventory(state.tray,board.goal.items)) feedback.push('The tray does not match the German order. Check the ingredients and quantities.');
    if (state.steps.join('|')!==board.goal.steps.join('|')) feedback.push('The kitchen steps are out of order or incomplete. Undo a step and check zuerst / dann.');
    if (board.goal.venue&&state.venue!==board.goal.venue) feedback.push('Check where the guests will eat: drinnen is inside, draußen is outside.');
    if (board.goal.service&&state.service!==board.goal.service) feedback.push('Check the service: am Tisch means at the table; zum Mitnehmen means takeaway.');
    if (board.goal.slot&&state.slot!==board.goal.slot) feedback.push('The reservation time does not match. Halb sieben means half past six.');
  } else if (board.kind==='market'&&state.kind==='market') {
    if (!sameInventory(state.basket,board.goal)) feedback.push('The basket has the wrong goods or quantities. Extras also cost money.');
    if (marketTotal(state)>board.budget) feedback.push('The basket exceeds the budget. Remove an item or choose a more affordable trade.');
    if (state.method!==board.method) feedback.push('The customer requested a different payment method: bar is cash, mit Karte is by card.');
    const change=state.changeCoins.reduce((sum,coin)=>sum+coin,0), expected=board.method==='cash'?board.tender-marketTotal(state):0;
    if (change!==expected) feedback.push(`Check the change: payment ${money(board.tender)} minus basket ${money(marketTotal(state))}${board.method==='card'?'; card payments need no coins':''}.`);
    if (board.trade&&!state.traded) feedback.push('Use the agreed exchange offer; buying new goods does not complete the trade.');
  } else if (board.kind==='detective'&&state.kind==='detective') {
    const placed=new Set<string>();
    for (const slot of board.slots) {
      const cardId=state.links[slot.id];
      if (!board.cards.some(card=>card.id===cardId)||placed.has(cardId)) feedback.push(`Link one evidence slip to “${slot.german}”.`);
      if(cardId) placed.add(cardId);
    }
  } else if (board.kind==='delivery'&&state.kind==='delivery') {
    if (cellKey(state.position)!==cellKey(board.goal)) feedback.push(`The parcel has not reached ${board.goalName} yet.`);
    if (!state.trail.some(cell=>cellKey(cell)===cellKey(board.checkpoint))) feedback.push(`The dispatch requires a stop at ${board.checkpointName}.`);
    if (state.parcel!==board.parcel) feedback.push('The parcel’s address belongs to a different recipient. Check für on the dispatch.');
    if (state.transport!==board.transport) feedback.push('The selected connection does not match the German announcement.');
    if (board.departure&&state.departure!==board.departure) feedback.push('Check the departure time against the dispatch.');
    if (board.help&&!state.help) feedback.push('The bridge needs help before the delivery can be completed.');
  }
  const valid=feedback.length===0;
  const model=board.kind==='detective'?undefined:exerciseForScenario(scenario).answer;
  return {valid,answer:valid&&model?model:`Meine Lösung: ${JSON.stringify(state).slice(0,240)}`,feedback};
}

const seededHash = (text:string):number => {let value=2166136261;for(const char of text)value=Math.imul(value^char.charCodeAt(0),16777619);return value>>>0;};

/** The action palette must never print the recipe's steps in solution order. */
export function shuffledCafeActions(board: CafeBoard, seed: string): string[] {
  const actions = seededShuffle(board.actions, seed);
  const recipe = actions.filter(action => board.goal.steps.includes(action));
  if (recipe.length > 1 && recipe.every((action, index) => action === board.goal.steps[index])) {
    const a = actions.indexOf(recipe[0]), b = actions.indexOf(recipe[1]);
    [actions[a], actions[b]] = [actions[b], actions[a]];
  }
  return actions;
}

/** Shuffle both independent palettes without needing the server's answer key. */
export function shuffledDetectiveBoard(board:DetectiveBoard,seed:string):DetectiveBoard {
  const cards=seededShuffle(board.cards,`${seed}:cards`),slots=seededShuffle(board.slots,`${seed}:slots`);
  return {...board,cards,slots};
}

export function selectActivityScenarios(id:ActivityId,level:Level,progress:Progress,seed:string,now=Date.now()): { scenarios:ActivityScenario[]; familiar:boolean } {
  const pool=scenarios.filter(scene=>scene.activityId===id&&scene.level===level);
  const ready=(scene:ActivityScenario):boolean=>{const item=progress.items[exerciseForScenario(scene).itemId];return !item||!Number.isFinite(Date.parse(item.dueAt))||Date.parse(item.dueAt)<=now;};
  const score=(scene:ActivityScenario):number=>{
    const item=progress.items[exerciseForScenario(scene).itemId];
    if (!item) return 2;
    return ready(scene)?3+Math.min(3,Math.max(0,now-Date.parse(item.dueAt))/86400000):0;
  };
  return {scenarios:[...pool].sort((a,b)=>score(b)-score(a)||seededHash(`${seed}:${a.id}`)-seededHash(`${seed}:${b.id}`)).slice(0,3),familiar:pool.every(scene=>!ready(scene))};
}
