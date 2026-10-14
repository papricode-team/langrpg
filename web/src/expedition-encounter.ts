import {escapeHtml as e,icon} from './icons';
import {shuffledExpeditionChoices,type ExpeditionEncounter} from './expeditions';
import {encounterLearning,ExpeditionLearning,type ExpeditionAttempt} from './expedition-learning';
import type {ExpeditionAnswerResult,Progress} from './api';
import {MiniGameInput} from './minigames/input';
import {renderAlignedLine,installAlignedLineInteractions,alignedLineFromElement,alignedSupport,renderAlignedMeaning} from './aligned-line';
import {t} from './i18n';
export interface EncounterCommand {id:string;selected:number;mode:'recognition'|'listening';isCurrent:()=>boolean;learning?:ExpeditionAttempt;learningSaved?:boolean;storySaved?:boolean;learningError?:string;feedback?:string;}
/** Pending receipts survive closing and reopening a dialog. */
export const pendingEncounterCommands=new Map<string,EncounterCommand>();
export function mountExpeditionEncounter(root:HTMLElement,encounter:ExpeditionEncounter,options:{learning:ExpeditionLearning;progress:()=>Progress;saveStory:(selected:number,id:string)=>Promise<ExpeditionAnswerResult>;onProgress:(progress:Progress)=>void;speak:(text:string,path:string)=>Promise<void>;stopSpeech:()=>void;silent:boolean;initialPaused?:boolean;previouslyAnswered:boolean}){
 const mapping=encounterLearning.get(encounter.id);if(!mapping)throw new Error('Missing authored expedition encounter mapping.');
 for(const [id,command] of pendingEncounterCommands)if(!command.isCurrent())pendingEncounterCommands.delete(id);
 const currentPlayer=options.learning.captureOwner();
 const pending=pendingEncounterCommands.get(encounter.id);
 let alive=true,paused=options.initialPaused===true,busy=false,mode:'recognition'|'listening'|undefined=options.silent?'recognition':pending?.mode,hinted=options.previouslyAnswered||mapping.supported,transcript=false,printedSeen=mode==='recognition',english=false,heard=false,spoken=false,status=pending?.learningError??'',selected:number|undefined=pending?.selected,feedback=pending?.feedback,started=performance.now(),pausedAt=paused?performance.now():0,generation=0,audioPresentations=0;
 let choices=shuffledExpeditionChoices(encounter,crypto.randomUUID());
 const wordSelections=new Map<string,number>();
 const alignedOptions=(id:string)=>({showMeaning:english||wordSelections.has(id),selectedToken:wordSelections.get(id)});
 const ready=()=>options.learning.ready(mapping.exerciseIds[mode??'recognition']);
 const render=()=>{
  if(!alive)return;
  const command=pendingEncounterCommands.get(encounter.id),locked=busy||paused;
  root.innerHTML=`<section class="expedition-encounter-learning" ${paused?'inert':''}><nav class="expedition-levels" aria-label="Recall modality"><button type="button" data-enc-mode="recognition" data-game-action="encounter-read" aria-pressed="${mode==='recognition'}" ${busy||command&&(!command.storySaved||command.learningError)?'disabled':''}>Read the message</button><button type="button" data-enc-mode="listening" data-game-action="encounter-listen" aria-pressed="${mode==='listening'}" ${options.silent||busy||command&&(!command.storySaved||command.learningError)?'disabled':''}>Listen to the message</button></nav><p>${e(encounter.prompt)}</p><blockquote class="expedition-brief"><span lang="de">${mode==='recognition'||transcript?encounter.aligned?renderAlignedLine(encounter.aligned,alignedOptions(encounter.aligned.id)):e(encounter.german):mode==='listening'?'Listen to the neighbor’s German message.':'Choose reading or listening to begin.'}</span>${mode?`<button type="button" class="icon-button" data-enc-audio data-game-action="encounter-audio" aria-label="${spoken?'Replay':'Play'} the German message" ${locked?'disabled':''}>${icon('volume')}</button>`:''}</blockquote>${mode==='listening'?`<button type="button" class="text-button" data-enc-transcript data-game-action="encounter-transcript" ${locked?'disabled':''}>${transcript?'Transcript shown · supported recall':'Show transcript · counts as help'}</button>`:''}<button type="button" class="text-button" data-enc-english data-game-action="encounter-english" ${locked?'disabled':''}>${english?'Hide':'Show'} English support</button>${english&&!encounter.aligned?`<p class="expedition-translation">${e(encounter.translation)}</p>`:''}<p class="expedition-learning-state" aria-live="polite">${!mode?'Choose how to receive the German message.':ready()?mode==='listening'&&!heard&&!transcript?'Hear the complete message before choosing.':'Each reply saves recognition or listening to your word memory.':'Exposure only · restore the message and reply words before this can count as recall. Your neighborhood agreement can still be saved.'}</p><div class="expedition-encounter-choices">${(mode?choices:[]).map(({choice,index},position)=>`<div class="expedition-reply"><div class="expedition-reply-line">${choice.aligned?renderAlignedLine(choice.aligned,alignedOptions(choice.aligned.id)):`<span lang="de">${e(choice.text)}</span>`}</div><button type="button" data-enc-answer="${index}" data-game-option="${position}" aria-label="${e(choice.text)}" class="${selected===index?'chosen':''}" ${locked||command&&(!command.storySaved||command.learningError)?'disabled':''}>${e(t('Say it'))} ${icon('arrow')}</button></div>`).join('')}</div>${command&&(!command.storySaved||command.learningError)?`<button type="button" class="primary-button" data-enc-retry data-game-action="encounter-retry" ${locked?'disabled':''}>Retry the saved reply</button>`:''}<div class="expedition-encounter-result" role="status" aria-live="polite">${e(status)}${feedback?`<p>${e(feedback)}</p>`:''}</div></section>`;
 };
 const play=async()=>{if(paused||busy||!mode)return;if(audioPresentations++>0){hinted=true;choices=shuffledExpeditionChoices(encounter,crypto.randomUUID());}if(mode==='recognition')hinted=true;spoken=true;heard=false;status='Playing the German message…';render();const version=++generation;try{await options.speak(encounter.german,mapping.audio);if(!alive||paused||version!==generation)return;heard=true;started=performance.now();status='Audio finished. Choose your reply.';render();}catch(error){if(alive&&!paused&&version===generation){status=error instanceof Error?error.message:'Audio could not play. Open the transcript for supported recognition.';render();}}};
 const save=async(command:EncounterCommand)=>{
  if(busy||paused)return;if(!command.isCurrent()){pendingEncounterCommands.delete(encounter.id);status='The player account changed. Open this message for your current adventure.';render();return;}busy=true;selected=command.selected;feedback=command.feedback;status='Saving your reply…';render();
  if(command.learning&&!command.learningSaved){try{await options.learning.submit(command.learning);command.learningSaved=true;command.learningError=undefined;}catch(error){command.learningError=error instanceof Error?error.message:'Learning save needs a connection.';}}
  try{if(!command.isCurrent())throw new Error('The player account changed before this reply was saved.');if(!command.storySaved){const result=await options.saveStory(command.selected,command.id);if(!command.isCurrent())throw new Error('The player account changed before this reply was saved.');options.onProgress(result.progress);command.feedback=result.feedback;command.storySaved=true;}
   if(command.storySaved&&!command.learningError){pendingEncounterCommands.delete(encounter.id);choices=shuffledExpeditionChoices(encounter,crypto.randomUUID());}
   if(!alive)return;const outcome=options.progress().story?.expeditions?.[encounter.id];feedback=command.feedback;hinted=true;status=command.learningError??(command.learning?'Reply and word recall saved.':'Neighborhood reply saved · exposure only until its words are restored.');
   if(outcome?.correct)status+= ' A connection made.';
  }catch(error){if(alive)status=error instanceof Error?error.message:'Your reply is safe. Retry keeps the same IDs.';}finally{busy=false;render();}
 };
 const click=(event:Event)=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||!root.contains(button)||button.disabled||paused||busy||!currentPlayer())return;event.stopPropagation();
  if(button.dataset.encMode){mode=button.dataset.encMode as typeof mode;if(mode==='recognition'){printedSeen=true;if(audioPresentations)hinted=true;}else if(printedSeen)hinted=true;transcript=false;heard=false;spoken=false;feedback=undefined;status='';generation++;options.stopSpeech();started=performance.now();render();if(mode==='listening')void play();else void options.learning.expose(mapping.exerciseIds.recognition);return;}
  if(button.hasAttribute('data-enc-audio')){void play();return;}
  if(button.hasAttribute('data-enc-transcript')){transcript=true;printedSeen=true;hinted=true;heard=true;mode='recognition';generation++;options.stopSpeech();void options.learning.expose(mapping.exerciseIds.recognition);render();return;}
  if(button.hasAttribute('data-enc-english')){english=!english;if(english)hinted=true;render();return;}
  if(button.hasAttribute('data-enc-retry')){const command=pendingEncounterCommands.get(encounter.id);if(command)void save(command);return;}
  if(button.dataset.encAnswer!==undefined){
   if(!mode)return;
   if(mode==='listening'&&!heard){status='Listen to the complete message first, or show its transcript.';render();return;}
   const selected=Number(button.dataset.encAnswer);if(!encounter.choices[selected])return;
   let command=pendingEncounterCommands.get(encounter.id);
   if(!command){const exerciseId=mapping.exerciseIds[mode??'recognition'];command={id:crypto.randomUUID(),selected,mode,isCurrent:currentPlayer,...(options.learning.ready(exerciseId)?{learning:options.learning.create(exerciseId,encounter.choices[selected].text,{hinted,responseMs:performance.now()-started})}:{})};pendingEncounterCommands.set(encounter.id,command);if(!command.learning)void options.learning.expose(exerciseId);}
   void save(command);
  }
 };
 const wordKeys=(event:KeyboardEvent)=>{if(event.target instanceof HTMLElement&&event.target.closest('[data-aligned-token]')&&['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))event.stopPropagation();};
 const unbindAligned=installAlignedLineInteractions(root);root.addEventListener('keydown',wordKeys);const alignedHelp=(event:Event)=>{
  if(paused||busy||!currentPlayer())return;
  const surface=event.target instanceof HTMLElement?event.target.closest<HTMLElement>('.aligned-line'):null,line=surface&&alignedLineFromElement(surface);
  if(!surface||!line)return;
  const token=(event as CustomEvent<{token?:number}>).detail.token;
  if(token===undefined)wordSelections.delete(line.id);else wordSelections.set(line.id,token);
  let meaning=surface.querySelector<HTMLElement>('.aligned-line-meaning');
  if(!english&&token===undefined){meaning?.remove();return;}
  if(!meaning){meaning=document.createElement('span');meaning.className='aligned-line-meaning';meaning.lang=alignedSupport(line).lang;meaning.setAttribute('role','status');surface.append(meaning);}
  meaning.innerHTML=renderAlignedMeaning(line,{selectedToken:token});
  hinted=true;if(mode)void options.learning.expose(mapping.exerciseIds[mode]);
 };root.addEventListener('aligned-line-select',alignedHelp);root.addEventListener('click',click);const unbind=new MiniGameInput().bind(root);render();if(!paused&&mode==='listening')void play();else if(!paused&&mode==='recognition')void options.learning.expose(mapping.exerciseIds.recognition);
 return {destroy(){alive=false;generation++;options.stopSpeech();unbind();unbindAligned();root.removeEventListener('keydown',wordKeys);root.removeEventListener('aligned-line-select',alignedHelp);root.removeEventListener('click',click);root.replaceChildren();},pause(){if(paused)return;paused=true;pausedAt=performance.now();generation++;options.stopSpeech();render();},resume(){if(!paused)return;started+=performance.now()-pausedAt;paused=false;if(mode==='listening'&&!heard){hinted=true;void play();}else render();},reset(){if(busy)return;hinted=true;choices=shuffledExpeditionChoices(encounter,crypto.randomUUID());feedback=undefined;status='';selected=undefined;render();}};
}
