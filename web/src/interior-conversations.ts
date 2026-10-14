import { baseLanguage } from './i18n';
import {npcs} from './content';
import type {AlignedLine} from './aligned-line';
import { escapeHtml as e, icon } from './icons';
import { renderNarrative, type TranslatedSentence } from './sentence-translations';

/** Authored, ungraded dialogue. Reading these lines does not earn a practice receipt. */
export interface InteriorConversationLine {
  aligned?:AlignedLine;
  localized?:boolean;
  lineId?:string;
  german: string;
  english: string;
  turkish: string;
}
export interface InteriorConversationChoice {
  id: string;
  line: InteriorConversationLine;
  next: string;
}
export interface InteriorConversationNode {
  id: string;
  line: InteriorConversationLine;
  choices: readonly InteriorConversationChoice[];
}
export interface InteriorConversation {
  id?:string;
  objectId: string;
  npcId: string;
  name: string;
  role: { english: string; turkish: string };
  title: { english: string; turkish: string };
  start: string;
  nodes: Readonly<Record<string, InteriorConversationNode>>;
}
export interface InteriorConversationState {
  objectId: string;
  nodeId: string;
  /** Previous nodes and answers are local navigation history, never learning evidence. */
  history: readonly { nodeId: string; choiceId: string }[];
}

const copy = (english: string, turkish: string): string => baseLanguage() === 'tr' ? turkish : english;

/** Only fetched conversation metadata is retained; line text loads one turn at a time. */
export const interiorConversations:InteriorConversation[]=[];
const conversationsByObject=new Map<string,InteriorConversation>();
export function installInteriorConversations(values:readonly InteriorConversation[]):void {
 for(const value of values){const current=conversationsByObject.get(value.objectId);if(current)Object.assign(current,value);else{interiorConversations.push(value);conversationsByObject.set(value.objectId,value);}}
}
export function clearInteriorConversations():void {interiorConversations.length=0;conversationsByObject.clear();}
const emptyLine=(lineId?:string):InteriorConversationLine=>({german:'',english:'',turkish:'',lineId});
function localizedLabel(value:unknown):{english:string;turkish:string}{const text=typeof value==='string'?value:(value as {english?:string;turkish?:string})?.english??'';return {english:text,turkish:text};}
interface ConversationRecord {id:string;objectId:string;npcId:string;name:string;role:unknown;title:unknown;start:string;nodes:Record<string,{id:string;line:{lineId:string};choices:Array<{id:string;line:{lineId:string};next:string}>}>;}
/** Fetch metadata once, then at most the visible node and its answer lines. */
export async function loadInteriorConversation(objectId:string,nodeId?:string):Promise<InteriorConversation|undefined>{
 const {getContentClient}=await import('./content-api');const client=getContentClient();let conversation=interiorConversationFor(objectId);
 if(!conversation){
  const bootstrap=await client.bootstrap();const metadata=(bootstrap.narratives as Array<{id:string;kind:string;objectId?:string}>|undefined)?.find(record=>record.kind==='interior-conversation'&&record.objectId===objectId);
  if(!metadata)return;
  const body=await client.narrative<ConversationRecord>(metadata.id);
  const nodes=Object.fromEntries(Object.entries(body.nodes).map(([id,node])=>[id,{id,line:emptyLine(node.line.lineId),choices:node.choices.map(choice=>({id:choice.id,line:emptyLine(choice.line.lineId),next:choice.next}))}]));
  conversation={...body,npcId:npcs.find(npc=>npc.contentId===body.npcId)?.id??body.npcId,role:localizedLabel(body.role),title:localizedLabel(body.title),nodes};installInteriorConversations([conversation]);
 }
 const current=conversation.nodes[nodeId??conversation.start];if(!current)return conversation;
 const references=[current.line,...current.choices.map(choice=>choice.line)].filter(value=>value.lineId&&!value.aligned);const ids=[...new Set(references.map(value=>value.lineId!))];
 if(ids.length>12)throw new Error('This conversation turn contains too many lines.');
 if(ids.length){const lines=await client.lines(ids);if(client!==getContentClient())return;for(const value of references){const line=lines.find(line=>line.id===value.lineId);if(!line)throw new Error('This content could not open. Try again.');const support=line.support[baseLanguage()]??line.support.en;Object.assign(value,{german:line.de.text,english:support?.text??'',turkish:support?.text??'',localized:true,aligned:line});}}
 return conversation;
}

export function interiorConversationFor(objectId: string): InteriorConversation | undefined {
  return conversationsByObject.get(objectId);
}

export function createInteriorConversationState(objectId: string): InteriorConversationState | undefined {
  const conversation = interiorConversationFor(objectId);
  return conversation ? { objectId, nodeId: conversation.start, history: [] } : undefined;
}

export function interiorConversationNode(state: InteriorConversationState): InteriorConversationNode | undefined {
  return interiorConversationFor(state.objectId)?.nodes[state.nodeId];
}

/** Invalid or stale UI actions leave the current turn intact. */
export function chooseInteriorConversation(state: InteriorConversationState, choiceId: string): InteriorConversationState {
  const answer = interiorConversationNode(state)?.choices.find(option => option.id === choiceId);
  if (!answer || !interiorConversationFor(state.objectId)?.nodes[answer.next]) return state;
  return { ...state, nodeId: answer.next, history: [...state.history, { nodeId: state.nodeId, choiceId }] };
}

export function backInteriorConversation(state: InteriorConversationState): InteriorConversationState {
  const previous = state.history.at(-1);
  return previous ? { ...state, nodeId: previous.nodeId, history: state.history.slice(0, -1) } : state;
}

export function replayInteriorConversation(state: InteriorConversationState): InteriorConversationState {
  return createInteriorConversationState(state.objectId) ?? state;
}

/** Use the shared delayed hover/focus and immediate touch translation controller. */
export function interiorLineNarrative(value: InteriorConversationLine): readonly TranslatedSentence[] {
  return [{ german: value.german, english: copy(value.english, value.turkish), localized: true,aligned:value.aligned }];
}

export function renderInteriorConversation(state: InteriorConversationState, options: { portraitMarkup?: string } = {}): string {
  const conversation = interiorConversationFor(state.objectId), current = interiorConversationNode(state);
  if (!conversation || !current) return '';
  const speaker = (value: InteriorConversationLine) => `<button class="icon-button" data-speak="${e(value.german)}" aria-label="${e(copy('Listen', 'Dinle'))}">${icon('volume')}</button>`;
  return `<div class="interior-encounter interior-conversation" data-conversation-object="${e(state.objectId)}"><header class="interior-encounter-heading">${options.portraitMarkup ?? ''}<div><h2>${e(conversation.name)}</h2><p class="encounter-role">${e(copy(conversation.role.english, conversation.role.turkish))}</p></div></header><blockquote class="interior-dialogue">${renderNarrative(interiorLineNarrative(current.line))}${speaker(current.line)}</blockquote>${current.choices.length ? `<div class="conversation-choices">${current.choices.map(answer => `<div class="conversation-choice"><button type="button" class="outline-button translated-sentence" lang="de" data-interior-choice="${e(answer.id)}" data-translation="${e(copy(answer.line.english,answer.line.turkish))}" data-translation-lang="${baseLanguage()}">${e(answer.line.german)}</button>${speaker(answer.line)}</div>`).join('')}</div>` : `<button class="primary-button" data-interior-conversation="replay">${icon('refresh')} ${e(copy('Talk again', 'Yeniden konuş'))}</button>`}<div class="encounter-secondary conversation-controls">${state.history.length ? `<button class="text-button" data-interior-conversation="back">${e(copy('Back', 'Geri'))}</button>` : ''}<button class="text-button" data-interior-conversation="encounter">${e(copy('Back to the encounter', 'Karşılaşmaya dön'))}</button><button class="text-button" data-action="close-dialog">${e(copy('Leave', 'Ayrıl'))}</button></div></div>`;
}
