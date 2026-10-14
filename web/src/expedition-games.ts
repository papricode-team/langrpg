import type { Level } from './content';
import { escapeHtml as e, icon } from './icons';
import { seededShuffle } from './game-shuffle.ts';
import { MiniGameInput } from './minigames/input';
import presentation from './data/expedition-presentation.json';
import {installExpeditionLearning} from './expedition-learning';

export const expeditionGameIds = ['saffroncourt', 'rainmarket', 'windplain', 'riverweave', 'terracielo', 'sunpatch', 'kigalights', 'cedarbay', 'seoulsteps', 'dunegarden'] as const;
export type ExpeditionGameId = typeof expeditionGameIds[number];
interface PlanOption { value: number; label: string; english: string; }
interface PlanField { id: string; label: string; english: string; options: PlanOption[]; }
interface PlanStep { id: string; label: string; english: string; }
export interface ExpeditionPlan {
  version: 1;
  level: Level;
  values: Record<string, number>;
  order: string[];
  completed: boolean;
  attempts: number;
}
export interface PlanCheck { correct: boolean; feedback: string[]; meter: string; }
export type ServerExpeditionPlan = Omit<ExpeditionPlan, 'version'>;
export type AuthoritativeExpeditionPlans = Record<string, ServerExpeditionPlan>;
export interface ExpeditionGameOptions {
  level: Level;
  onComplete(): void;
  onLevelChange?(level: Level): void;
  speak(text: string): void;
  seed?: string;
  /** Seeing or hearing scene text records exposure independently of changed-action recall. */
  onExposure?(context: {mapId:ExpeditionGameId;level:Level;text:string;kind:'placement'|'sequence'|'brief'}): void;
  onPlacement?(context:{mapId:ExpeditionGameId;level:Level;fieldId:string;value:number;label:string;responseMs:number}):Promise<{message:string}>;
  placementPrompt?(level:Level,fieldId:string):string;
  placementReady?(level:Level,fieldId:string):boolean;
  pendingLearning?():number;
  retryLearning?():Promise<number>;
  initialPlan?(level: Level): ServerExpeditionPlan | undefined;
  submitPlan?(plan: ExpeditionPlan): Promise<{ correct: boolean; plan: ServerExpeditionPlan; feedback?: string[] }>;
}
export interface ExpeditionGame {
  id: ExpeditionGameId;
  recordId?:string;
  title: string;
  summary: string;
  german: Record<Level, string>;
  glossary: string;
  fields: PlanField[];
  steps: PlanStep[];
  orderPrompt: string;
  orderExplanation: string;
  validate(values: Record<string, number>): string[];
  meter(values: Record<string, number>): string;
  solution: Record<string, number>;
  note: string;
  agreement: string;
  /** Only authoring audits install this formatter; live receipts come from the server. */
  formatAgreement?(values:Record<string,number>):string;
}
export const expeditionGames:ExpeditionGame[] = presentation.plans.map(plan=>({...plan,id:plan.id as ExpeditionGameId,summary:'',german:{A1:'',A2:'',B1:''},glossary:'',fields:[],steps:[],orderPrompt:'',orderExplanation:'',solution:{},note:'',agreement:'',validate:()=>['Submit the plan to check your agreement.'],meter:()=>''}));
export function installExpeditionGames(values:readonly ExpeditionGame[]):void {for(const value of values){const current=expeditionGames.find(game=>game.id===value.id);if(current)Object.assign(current,value);else expeditionGames.push(value);}}
export function clearExpeditionGames():void {for(const game of expeditionGames){Object.assign(game,{summary:'',german:{A1:'',A2:'',B1:''},glossary:'',fields:[],steps:[],orderPrompt:'',orderExplanation:'',solution:{},note:'',agreement:'',validate:()=>['Submit the plan to check your agreement.'],meter:()=>''});delete game.formatAgreement;}}
export async function loadExpeditionGame(game:ExpeditionGame):Promise<ExpeditionGame>{
 if(!game.recordId)return game;
 const {getContentClient}=await import('./content-api');const body=await getContentClient().minigame<Record<string,unknown>&{id:string}>(game.recordId);
 installExpeditionLearning(body);Object.assign(game,body,{id:game.id,recordId:game.recordId,solution:{},validate:()=>['Submit the plan to check your agreement.'],meter:()=>''});return game;
}
export function getExpeditionGame(id: string): ExpeditionGame | undefined { return expeditionGames.find(game => game.id===id); }
/** Completed paper props describe the learner's actual accepted allocation. */
export function expeditionAgreement(game: ExpeditionGame, values: Record<string,number>): string {
  if(game.formatAgreement)return game.formatAgreement(values);
  return game.agreement || Object.entries(values).map(([key,value])=>`${key}: ${value}`).join(' · ');
}
export const expeditionGameAudioJobs = expeditionGames.flatMap(game => (['A1','A2','B1'] as const).map(level => ({id:`expedition-${game.id}-brief-${level.toLowerCase()}`,text:game.german[level]})));
export function shuffledExpeditionSteps(game: ExpeditionGame, seed: string): PlanStep[] {
  const pieces = seededShuffle(game.steps, `${seed}:${game.id}`);
  if (pieces.length > 1 && pieces.every((piece,index) => piece.id === game.steps[index].id)) [pieces[0],pieces[1]] = [pieces[1],pieces[0]];
  return pieces;
}
export function freshExpeditionPlan(game: ExpeditionGame, level: Level): ExpeditionPlan {
  return { version:1, level, values:Object.fromEntries(game.fields.map(field => [field.id,field.options[0].value])), order:[], completed:false, attempts:0 };
}
export function checkExpeditionPlan(game: ExpeditionGame, plan: ExpeditionPlan): PlanCheck {
  const invalidFields = game.fields.filter(field => !field.options.some(option => option.value===plan.values[field.id]));
  const feedback = invalidFields.length ? ['Please select a valid value for every part of your plan.'] : game.validate(plan.values);
  if (plan.order.length!==game.steps.length || game.steps.some((step,index)=>plan.order[index]!==step.id)) feedback.push(game.orderExplanation);
  return {correct:feedback.length===0, feedback, meter:game.meter(plan.values)};
}
interface StorageLike { getItem(key: string): string | null; setItem(key: string,value: string): void; }
const planKey = (id: string,level: Level) => `atlas.expedition.plan.v1.${id}.${level}`;
export function loadExpeditionPlan(game: ExpeditionGame,level: Level,storage?: StorageLike): ExpeditionPlan {
  const fresh = freshExpeditionPlan(game,level);
  try {
    const saved: unknown = JSON.parse((storage ?? localStorage).getItem(planKey(game.id,level)) || 'null');
    if (!saved || typeof saved!=='object') return fresh;
    const data = saved as Partial<ExpeditionPlan>;
    if (data.version!==1 || data.level!==level) return fresh;
    for (const field of game.fields) { const value=data.values?.[field.id]; if (field.options.some(option=>option.value===value)) fresh.values[field.id]=value!; }
    if (Array.isArray(data.order)) fresh.order=data.order.filter((id,index,array):id is string=>typeof id==='string'&&game.steps.some(step=>step.id===id)&&array.indexOf(id)===index).slice(0,game.steps.length);
    fresh.attempts=typeof data.attempts==='number'&&Number.isFinite(data.attempts)?Math.max(0,Math.floor(data.attempts)):0;
    fresh.completed=data.completed===true&&checkExpeditionPlan(game,fresh).correct;
  } catch { /* A malformed or blocked storage record starts a fresh plan. */ }
  return fresh;
}
export function saveExpeditionPlan(game: ExpeditionGame,plan: ExpeditionPlan,storage?: StorageLike): void { try { (storage ?? localStorage).setItem(planKey(game.id,plan.level),JSON.stringify(plan)); } catch { /* The game remains playable when browser storage is unavailable. */ } }
export function expeditionGameStatus(id:string,level:Level,authoritativePlans?:AuthoritativeExpeditionPlans): 'new'|'started'|'completed' {
  const game=getExpeditionGame(id); if (!game) return 'new';
  const plan=loadExpeditionPlan(game,level);
  const completed = authoritativePlans ? authoritativePlans[`${id}:${level}`]?.completed === true : plan.completed;
  return completed?'completed':plan.attempts||plan.order.length||game.fields.some(field=>plan.values[field.id]!==field.options[0].value)?'started':'new';
}
export function expeditionNotebook(authoritativePlans?:AuthoritativeExpeditionPlans): string {
  const entries=expeditionGames.flatMap(game=>(['A1','A2','B1'] as const).filter(level=>expeditionGameStatus(game.id,level,authoritativePlans)==='completed').map(level=>({game,level})));
  if (!entries.length) return '';
  return `<section class="field-notes expedition-notebook"><h3>People you helped connect</h3>${entries.map(({game,level})=>`<article class="grammar-route"><span class="caption">${level} · ${e(game.title)}</span><p>${e(game.note)}</p><blockquote>${e(expeditionAgreement(game,authoritativePlans?.[`${game.id}:${level}`]?.values??loadExpeditionPlan(game,level).values))}</blockquote><button class="text-button" data-expedition-game="${game.id}" data-expedition-level="${level}">Revisit this plan ${icon('arrow')}</button></article>`).join('')}</section>`;
}

export function mountExpeditionGame(root: HTMLElement, game: ExpeditionGame, options: ExpeditionGameOptions): {destroy():void;pause():void;resume():void;reset():void} {
  let currentLevel = options.level;
  const selectPlan = (level: Level): ExpeditionPlan => {
    const saved = options.initialPlan?.(level);
    if (saved) {
      const restored=freshExpeditionPlan(game,level);
      for(const field of game.fields){
        const value=saved.values[field.id];
        if(field.options.some(option=>option.value===value))restored.values[field.id]=value;
        else if(saved.completed&&value===undefined)restored.values[field.id]=game.solution[field.id];
      }
      restored.order=saved.order.filter((id,index,array)=>game.steps.some(step=>step.id===id)&&array.indexOf(id)===index);
      restored.attempts=saved.attempts;restored.completed=saved.completed;
      return restored;
    }
    const draft = loadExpeditionPlan(game,level);
    if (options.submitPlan) draft.completed = false;
    return draft;
  };
  let plan = selectPlan(currentLevel);
  let feedback: PlanCheck | undefined;
  let hint = currentLevel === 'A1', alive = true, submitting = false, paused = false;
  let selectedField = game.fields[0]?.id??'', layoutRevision = 0;
  let placementStarted=performance.now(),placementRevision=0,placementPausedAt=0,learningStatus='';
  const sessionSeed = options.seed ?? crypto.randomUUID();
  const seenBriefs = new Set<Level>();
  const persist = () => saveExpeditionPlan(game,plan);
  const expose = (text:string,kind:'placement'|'sequence'|'brief') => options.onExposure?.({mapId:game.id,level:currentLevel,text,kind});
  const speakPlacement = (text:string,kind:'placement'|'sequence') => { options.speak(text); expose(text,kind); };
  const layoutSeed = () => `${sessionSeed}:${currentLevel}:${plan.attempts}:${layoutRevision}`;
  const locked = () => plan.completed || submitting || paused;
  const tokenIcon = (field:PlanField) => /minute|wasser|garten|pflanzen|bäume/i.test(`${field.id} ${field.label}`) ? 'leaf' : /zimmer|room|ort|eingang|tür|weg/i.test(`${field.id} ${field.label}`) ? 'lock' : /zeit|beginn|ende|abfahrt|termin/i.test(`${field.id} ${field.label}`) ? 'clock' : 'parcel';
  const redraw = (focusKey?:string) => {
    if (!alive) return;
    const active = game.fields.find(field => field.id === selectedField)!;
    const disabled = locked() ? 'disabled' : '';
    const focus = focusKey ?? (root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.expFocus : undefined);
    const placed = game.fields.map(field => {
      const value = field.options.find(option => option.value === plan.values[field.id])!;
      return `<button type="button" class="expedition-placement ${selectedField===field.id?'selected':''}" data-exp-zone="${field.id}" data-game-action="plan-zone-${field.id}" data-exp-focus="zone:${field.id}" aria-pressed="${selectedField===field.id}" aria-label="${e(field.label)}: ${e(value.label)}. ${hint?'Choose this place to change its token.':'Tippe hier, um das Teil zu ändern.'}" ${disabled}>${icon(tokenIcon(field))}<span><span class="caption">${e(field.label)}</span><strong lang="de">${e(value.label)}</strong>${hint?`<em>${e(field.english)}</em>`:''}</span>${icon('arrow')}</button>`;
    }).join('');
    const tokens = seededShuffle(active.options,`${layoutSeed()}:${active.id}`).map((option,position) => `<button type="button" class="expedition-resource-token ${plan.values[active.id]===option.value?'selected':''}" draggable="${!locked()}" data-exp-token="${active.id}" data-game-option="${position}" data-exp-value="${option.value}" data-exp-focus="token:${active.id}:${option.value}" aria-pressed="${plan.values[active.id]===option.value}" aria-label="${e(option.label)}. ${e(active.label)}" ${disabled}>${icon(tokenIcon(active))}<strong lang="de">${e(option.label)}</strong>${hint&&option.english!==option.label?`<span class="caption">${e(option.english)}</span>`:''}</button>`).join('');
    root.innerHTML = `<section class="expedition-game" ${paused?'inert':''}><header class="expedition-game-heading"><h2>${e(game.title)}</h2><p>${e(game.summary)}</p><div class="expedition-levels" aria-label="Language scaffold">${(['A1','A2','B1'] as const).map(level=>`<button type="button" class="${currentLevel===level?'selected':''}" data-exp-level="${level}" data-game-action="plan-level-${level}" aria-pressed="${currentLevel===level}">${level}</button>`).join('')}<span>${plan.completed?'Agreement remembered':submitting?'Saving your plan…':'Your plan takes shape'}</span></div></header><blockquote class="expedition-brief"><span lang="de">${e(game.german[currentLevel])}</span><button class="icon-button" data-exp-speak data-game-action="plan-audio" aria-label="Listen to the German instructions">${icon('volume')}</button></blockquote><button class="text-button" data-exp-hint data-game-action="plan-help" aria-expanded="${hint}">${icon('book')} ${hint?'Hide':'Show'} English support</button>${hint?`<p class="expedition-glossary">${e(game.glossary)}</p>`:''}<div class="expedition-workbench"><div class="expedition-region-board" style="--expedition-preview:url('/assets/${game.id}-preview.webp')" aria-label="Neighborhood placement board"><div class="expedition-plan-fields">${placed}</div></div>${!plan.completed?`<section class="expedition-token-tray" aria-label="Tokens for ${e(active.label)}"><h3>${icon(tokenIcon(active))} ${e(active.label)}</h3><p>${hint?'Tap a token to place it here, or drag it to the matching place. Choose another place on the painting to work on it.':'Tippe auf ein Teil oder ziehe es an den passenden Ort. Wähle einen anderen Ort auf dem Bild.'}</p><p class="expedition-placement-prompt" lang="de">${e(options.placementPrompt?.(currentLevel,active.id)??'')}</p><div class="expedition-resource-tokens">${tokens}</div><p class="expedition-learning-state" role="status" aria-live="polite">${e(!options.placementReady?.(currentLevel,active.id)?'Exposure only · restore this instruction’s words before it can count as recall.':'Placements save supported recognition. Printed labels and speech do not create listening evidence.')}${learningStatus?`<span>${e(learningStatus)}</span>`:''}</p>${options.pendingLearning?.()?'<button type="button" class="text-button" data-exp-retry-learning data-game-action="plan-retry-learning">Retry learning saves</button>':''}</section>`:''}<output class="expedition-resource" aria-live="polite">${icon('basket')} ${e(game.meter(plan.values))}</output><div class="expedition-order"><h3>${e(game.orderPrompt)}</h3><p>${hint?'Tap or drag pieces onto the route. Tap a placed piece to return it to the tray.':'Tippe auf die Teile oder ziehe sie auf den Weg. Tippe erneut, um ein Teil zurückzulegen.'}</p><ol class="expedition-order-result" data-exp-sequence aria-label="Your assembled sequence">${plan.order.map((id,index)=>{const item=game.steps.find(step=>step.id===id)!;return `<li><button type="button" data-exp-remove="${index}" data-game-action="plan-remove-${id}" data-exp-focus="remove:${id}" ${disabled}><span>${index+1}</span><strong lang="de">${e(item.label)}</strong>${hint?`<span class="caption">${e(item.english)}</span>`:''}${!plan.completed?icon('close'):icon('check')}</button></li>`;}).join('')}${!plan.order.length?`<li class="expedition-order-empty">${hint?'Your route begins here.':'Dein Weg beginnt hier.'}</li>`:''}</ol><div class="expedition-order-pieces">${shuffledExpeditionSteps(game,layoutSeed()).map(item=>`<button type="button" draggable="${!locked()&&!plan.order.includes(item.id)}" data-exp-add="${item.id}" data-game-action="plan-step-${item.id}" data-exp-focus="step:${item.id}" ${locked()||plan.order.includes(item.id)?'disabled':''}>${icon('parcel')}<strong lang="de">${e(item.label)}</strong>${hint?`<span class="caption">${e(item.english)}</span>`:''}</button>`).join('')}</div></div></div><div class="expedition-plan-feedback ${feedback?.correct||plan.completed?'good':feedback?'retry':''}" role="status" aria-live="polite">${plan.completed?`<h3>${icon('check')} Everyone can work from this plan.</h3><p>${e(game.note)}</p><blockquote lang="de">${e(expeditionAgreement(game,plan.values))}</blockquote><button class="text-button" data-speak="${e(expeditionAgreement(game,plan.values))}">${icon('volume')} Listen to your agreement</button>`:feedback?`<strong>Your plan needs a change.</strong><ul>${feedback.feedback.map(text=>`<li>${e(text)}</li>`).join('')}</ul>`:''}</div><footer class="expedition-game-actions">${!plan.completed?`<button class="primary-button" data-exp-check data-game-action="plan-check" ${submitting?'disabled':''}>${icon('check')} Test the plan</button>`:''}<button class="text-button" data-exp-reset data-game-action="plan-reset">${icon('refresh')} ${plan.completed?'Build another plan':'Start this plan again'}</button><button class="text-button" data-action="close-dialog">Keep exploring ${icon('arrow')}</button></footer><p class="expedition-save-note">Your completed agreements are remembered with your adventure. Completing a plan adds an agreement to your expedition notebook.</p></section>`;
    if(!paused&&!seenBriefs.has(currentLevel)){seenBriefs.add(currentLevel);expose(game.german[currentLevel],'brief');}
    if (focus) Array.from(root.querySelectorAll<HTMLButtonElement>('[data-exp-focus]')).find(button => button.dataset.expFocus===focus&&!button.disabled)?.focus({preventScroll:true});
  };
  const place = (fieldId:string,value:number) => {
    if (locked()) return;
    const field = game.fields.find(field => field.id===fieldId), option = field?.options.find(option => option.value===value);
    if (!field || !option) return;
    if(plan.values[fieldId]===value){speakPlacement(option.label,'placement');return;}
    const responseMs=performance.now()-placementStarted,revision=++placementRevision,level=currentLevel;
    plan.values[fieldId] = value; selectedField = fieldId; feedback = undefined;placementStarted=performance.now();
    persist(); speakPlacement(option.label,'placement'); redraw(`token:${fieldId}:${value}`);
    if(options.onPlacement){learningStatus='Saving supported recognition…';redraw(`token:${fieldId}:${value}`);void options.onPlacement({mapId:game.id,level,fieldId,value,label:option.label,responseMs}).then(result=>{if(!alive)return;if(revision===placementRevision)learningStatus=`${field.label}: ${result.message}`;redraw();},error=>{if(!alive)return;if(revision===placementRevision)learningStatus=error instanceof Error?error.message:'Learning save needs a connection.';redraw();});}
  };
  const addStep = (id:string) => {
    if (locked() || plan.order.includes(id)) return;
    const step = game.steps.find(step => step.id===id); if (!step) return;
    plan.order.push(id); feedback = undefined; persist(); speakPlacement(step.label,'sequence'); redraw(`remove:${id}`);
  };
  const reset = () => {
    if (submitting || !alive) return;
    plan = freshExpeditionPlan(game,currentLevel); selectedField = game.fields[0]?.id??''; layoutRevision++; placementRevision++;feedback = undefined;placementStarted=performance.now();learningStatus='';persist(); redraw();
  };
  const onClick = async (event:Event) => {
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!target||!root.contains(target)||target.disabled||submitting||paused) return;
    if (target.dataset.expLevel) { currentLevel=target.dataset.expLevel as Level;plan=selectPlan(currentLevel);layoutRevision++;placementRevision++;feedback=undefined;hint=currentLevel==='A1';placementStarted=performance.now();learningStatus='';options.onLevelChange?.(currentLevel);redraw();return; }
    if (target.hasAttribute('data-exp-hint')) { hint=!hint;redraw();return; }
    if (target.hasAttribute('data-exp-speak')) { options.speak(game.german[currentLevel]);expose(game.german[currentLevel],'brief');return; }
    if (target.dataset.expZone&&!plan.completed) { selectedField=target.dataset.expZone;placementRevision++;learningStatus='';placementStarted=performance.now();redraw(`zone:${selectedField}`);return; }
    if (target.dataset.expToken) { place(target.dataset.expToken,Number(target.dataset.expValue));return; }
    if (target.dataset.expAdd) { addStep(target.dataset.expAdd);return; }
    if (target.dataset.expRemove!==undefined&&!plan.completed) { const id=plan.order[Number(target.dataset.expRemove)];plan.order.splice(Number(target.dataset.expRemove),1);feedback=undefined;persist();redraw(`step:${id}`);return; }
    if (target.hasAttribute('data-exp-check')&&!plan.completed) {
      if (options.submitPlan) {
        submitting=true;redraw();
        try {
          const result=await options.submitPlan({...plan,values:{...plan.values},order:[...plan.order]});
          if (!alive) return;
          plan={version:1,...result.plan,values:{...result.plan.values},order:[...result.plan.order],completed:result.correct&&result.plan.completed};
          const explanation=checkExpeditionPlan(game,plan).feedback;
          feedback={correct:result.correct,feedback:result.feedback??(explanation.length?explanation:['The neighborhood needs a different agreement.']),meter:game.meter(plan.values)};
          if (!plan.completed) layoutRevision++;
          persist();if(plan.completed)options.onComplete();
        } catch(error) {
          if (alive) feedback={correct:false,feedback:[error instanceof Error?error.message:'The neighborhood could not save this plan. Try again.'],meter:game.meter(plan.values)};
        } finally { submitting=false;redraw(); }
      } else {
        plan.attempts++;feedback=checkExpeditionPlan(game,plan);plan.completed=feedback.correct;persist();redraw();if(plan.completed)options.onComplete();
      }
      return;
    }
    if (target.hasAttribute('data-exp-reset')) reset();
    if (target.hasAttribute('data-exp-retry-learning')&&options.retryLearning){try{const count=await options.retryLearning();if(alive)learningStatus=`${count} supported recognition answers saved.`;}catch(error){if(alive)learningStatus=error instanceof Error?error.message:'Learning save needs a connection.';}redraw();}
  };
  let dragged: {field:string;value:number} | {step:string} | undefined;
  const onDragStart = (event:DragEvent) => {
    if (locked()) {event.preventDefault();return;}
    const target=(event.target as HTMLElement).closest<HTMLButtonElement>('[draggable="true"]');if(!target||!root.contains(target))return;
    dragged=target.dataset.expToken?{field:target.dataset.expToken,value:Number(target.dataset.expValue)}:target.dataset.expAdd?{step:target.dataset.expAdd}:undefined;
    if(dragged&&event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',JSON.stringify(dragged));}
  };
  const onDragOver = (event:DragEvent) => {
    const target=(event.target as HTMLElement).closest<HTMLElement>('[data-exp-zone],[data-exp-sequence]');
    if(!locked()&&dragged&&target&&('field' in dragged?target.dataset.expZone===dragged.field:target.hasAttribute('data-exp-sequence')))event.preventDefault();
  };
  const onDrop = (event:DragEvent) => {
    const target=(event.target as HTMLElement).closest<HTMLElement>('[data-exp-zone],[data-exp-sequence]');
    if(!target||!dragged||locked())return;
    if('field' in dragged&&target.dataset.expZone===dragged.field){event.preventDefault();place(dragged.field,dragged.value);}
    else if('step' in dragged&&target.hasAttribute('data-exp-sequence')){event.preventDefault();addStep(dragged.step);}
    dragged=undefined;
  };
  const onDragEnd = () => {dragged=undefined;};
  const onKeyDown = (event:KeyboardEvent) => {
    if(locked()||event.altKey||event.ctrlKey||event.metaKey||!/^\d$/.test(event.key)||event.key==='0')return;
    const token=root.querySelectorAll<HTMLButtonElement>('[data-exp-token]')[Number(event.key)-1];
    if(token&&!token.disabled){event.preventDefault();event.stopPropagation();token.click();}
  };
  root.addEventListener('click',onClick);root.addEventListener('dragstart',onDragStart);root.addEventListener('dragover',onDragOver);root.addEventListener('drop',onDrop);root.addEventListener('dragend',onDragEnd);root.addEventListener('keydown',onKeyDown);const unbindInput=new MiniGameInput().bind(root);redraw();
  return {destroy(){alive=false;unbindInput();root.removeEventListener('click',onClick);root.removeEventListener('dragstart',onDragStart);root.removeEventListener('dragover',onDragOver);root.removeEventListener('drop',onDrop);root.removeEventListener('dragend',onDragEnd);root.removeEventListener('keydown',onKeyDown);root.replaceChildren();},pause(){if(paused)return;paused=true;placementPausedAt=performance.now();redraw();},resume(){if(!paused)return;placementStarted+=performance.now()-placementPausedAt;paused=false;redraw();},reset};
}
