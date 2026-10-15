import { avatarColors, characterFrame } from './avatar-options';
import { paintAvatar, releaseAvatarPreview } from './avatar-baker';
import { characterCatalogue, catalogueForPose, normalizeAvatar, resolveRecipe, avatarTextureKey } from './character-recipe.mjs';
import type { AvatarRecipe } from './character-recipe.mjs';
import { characterPresets, randomAvatar } from './character-presets';
import { advanceWalkClock, type WalkClock } from './walk-animation';
import { advancePoseClock, availableCharacterPoses, poseColumn, type PoseClock } from './character-pose';
import { escapeHtml as e } from './icons';
import { t } from './i18n';
import featureThumbnails from './data/character-feature-thumbnails.json';
import './character-builder.css';
const thumbnails: Record<string, string> = featureThumbnails;
const tabs = [...new Set(characterCatalogue.slots.map(slot => slot.tab))];
const tabLabel = (tab: string) => ({ Body:t('Body'), Face:t('Face'), Hair:t('Hair'), Head:t('Head'), Top:t('Top'), Outer:t('Outer'), Bottom:t('Bottom'), Feet:t('Feet'), Extras:t('Extras') }[tab] ?? tab);
const colorLabel = (key: string) => key === 'skin' ? t('Skin tone') : key === 'hair' ? t('Hair colour') : key.endsWith('.secondary') ? t('Secondary colour') : t('Primary colour');
const swatches = (key: string) => key === 'skin' ? avatarColors.skin : key === 'hair' ? avatarColors.hair : avatarColors.outfit;
export function characterBuilderMarkup(): string {
  return `<section class="character-builder" aria-label="${e(t('Character builder'))}"><div class="builder-preview"><canvas width="256" height="384" data-main-preview aria-label="${e(t('Your assembled character'))}" role="img"></canvas><div class="builder-turns"><button type="button" data-turn="-1" aria-label="${e(t('Turn character left'))}">↶</button><select data-motion aria-label="${e(t('Character animation'))}"><option value="standing">${e(t('Standing'))}</option><option value="walking">${e(t('Walking'))}</option>${Object.entries(characterCatalogue.poseSets??{}).map(([id,pose])=>`<option value="${e(id)}">${e(t(pose.label))}</option>`).join('')}</select><button type="button" data-turn="1" aria-label="${e(t('Turn character right'))}">↷</button></div><div class="builder-facing-strip">${[t('Front view'),t('Right view'),t('Back view'),t('Left view')].map((label,index)=>`<canvas width="128" height="192" data-facing="${index}" aria-label="${e(label)}" role="img"></canvas>`).join('')}</div><p>${e(t('Make yourself at home.'))}</p></div><div class="builder-editor"><div class="builder-actions"><button type="button" data-random>${e(t('Randomise'))}</button><select data-preset aria-label="${e(t('Presets'))}"><option value="">${e(t('Presets'))}</option>${characterPresets.map(p=>`<option value="${e(p.name)}">${e(p.name)}</option>`).join('')}</select></div><div class="builder-browser"><div class="builder-tabs" role="tablist" aria-label="${e(t('Character parts'))}">${tabs.map((tab,index)=>`<button type="button" role="tab" data-tab="${e(tab)}" aria-selected="${index===0}" tabindex="${index===0?0:-1}">${e(tabLabel(tab))}</button>`).join('')}</div><div class="builder-panel" role="tabpanel"></div></div></div></section>`;
}
export interface CharacterBuilderValue { (): AvatarRecipe; applyPreset(name: string): void; }
export function bindCharacterBuilder(host: HTMLElement, initial: unknown): CharacterBuilderValue {
  const root=host.querySelector<HTMLElement>('.character-builder')!, canvas=root.querySelector<HTMLCanvasElement>('[data-main-preview]')!;
  const strip=[...root.querySelectorAll<HTMLCanvasElement>('[data-facing]')], panel=root.querySelector<HTMLElement>('.builder-panel')!;
  let draft=normalizeAvatar(initial), active=tabs[0], facing=0, motion='standing', clock:WalkClock={phase:0,lastTimeMs:null}, poseClock:PoseClock={elapsedMs:0,lastTimeMs:null};
  const motionSelect=root.querySelector<HTMLSelectElement>('[data-motion]')!;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const poseSet=()=>motion==='standing'||motion==='walking'?'walk':motion;
  const recipeIdentity=()=>avatarTextureKey(draft,catalogueForPose(poseSet()));
  let lastPaintKey='',pendingPaintKey='',stripKey='',pendingStripKey='',paintSerial=0,retryAfter=0,request=0,disposed=false;
  const visible=()=>!document.hidden&&(!root.closest('dialog')||root.closest('dialog')!.open);
  const paint=()=>{
    if(!visible())return;
    const action=characterCatalogue.poseSets?.[poseSet()];
    const frame=action?facing*9+(reducedMotion.matches?3:poseColumn(poseClock.elapsedMs,action.frameDurations)):characterFrame(facing,motion==='walking'&&!reducedMotion.matches?clock.phase:undefined);
    const recipeKey=recipeIdentity(),key=recipeKey+':'+frame;
    if((key===lastPaintKey&&!pendingPaintKey)||key===pendingPaintKey||performance.now()<retryAfter)return;
    const serial=++paintSerial;
    pendingPaintKey=key;
    const snapshot=structuredClone(draft);
    const options={poseSet:poseSet()},work=[paintAvatar(canvas,snapshot,frame,options)];
    if(stripKey!==recipeKey||(pendingStripKey&&pendingStripKey!==recipeKey)){pendingStripKey=recipeKey;work.push(...strip.map((target,index)=>paintAvatar(target,snapshot,index*9+(action?3:0),options)));}
    void Promise.all(work).then(()=>{if(serial===paintSerial&&recipeIdentity()===recipeKey){lastPaintKey=key;stripKey=recipeKey;canvas.setAttribute('aria-label',t('Your assembled character'));}}).catch(()=>{if(serial===paintSerial){retryAfter=performance.now()+1000;canvas.setAttribute('aria-label',t('Character artwork is reconnecting'));}}).finally(()=>{if(serial===paintSerial){pendingPaintKey='';pendingStripKey='';}});
  };
  const render=()=>{
    const available=availableCharacterPoses(draft);
    if(poseSet()!=='walk'&&!available.includes(motion)){motion='standing';poseClock={elapsedMs:0,lastTimeMs:null};}
    for(const option of motionSelect.options){
      const action=characterCatalogue.poseSets?.[option.value];if(!action)continue;
      option.disabled=!available.includes(option.value);
      option.textContent=option.disabled?t('{pose} (unavailable for this outfit)',{pose:t(action.label)}):t(action.label);
    }
    motionSelect.value=motion;
    const rules=resolveRecipe(draft), colorKeys=new Set<string>();
    if(active==='Body')colorKeys.add('skin');if(active==='Hair')colorKeys.add('hair');
    panel.setAttribute('aria-label',tabLabel(active));
    panel.innerHTML=characterCatalogue.slots.filter(slot=>slot.tab===active).map(slot=>{
      const options=characterCatalogue.components.filter(part=>part.slot===slot.id&&(slot.id==='body'||part.build===draft.build));
      const selected=slot.id==='body'?draft.build:draft.parts[slot.id],disabled=rules.disabled[slot.id];
      const piece=options.find(part=>part.optionId===selected);
      for(const key of Object.values(piece?.tints??{}))if(key&&key!=='skin'&&key!=='hair')colorKeys.add(key);
      const cause=disabled&&characterCatalogue.components.find(part=>part.id===disabled.by);
      const note=disabled?t('Unavailable while {piece} is selected.',{piece:t(cause?.label??'')}):rules.hidden.includes(slot.id)?t('Covered by your selected clothing.'):'';
      const tile=(id:string|null,label:string,thumbnail?:string)=>`<button type="button" class="builder-tile" data-slot="${e(slot.id)}" data-option="${e(id??'')}" aria-pressed="${selected===id}" ${disabled?'disabled':''}>${thumbnail?`<img src="${e(thumbnail)}" alt="" loading="lazy" width="88" height="96"/>`:'<span class="builder-none" aria-hidden="true">∅</span>'}<span>${e(t(label))}</span></button>`;
      return `<section class="builder-slot"><h3>${e(t(slot.label))}</h3>${note?`<p class="builder-rule" role="status">${e(note)}</p>`:''}<div class="builder-tiles">${slot.optional?tile(null,'None'):''}${options.map(part=>tile(part.optionId,part.label,thumbnails[part.id])).join('')}${!options.length&&!slot.optional?`<p>${e(t('No options for this build yet.'))}</p>`:''}</div></section>`;
    }).join('')+[...colorKeys].map(key=>`<fieldset><legend>${e(colorLabel(key))}</legend><div class="builder-colours">${swatches(key).map(([label,color])=>`<button type="button" data-colour-key="${e(key)}" data-colour="${color}" style="--swatch:${color}" aria-label="${e(t(label))}" aria-pressed="${(key==='skin'?draft.skin:key==='hair'?draft.hair:draft.colors[key])===color}"></button>`).join('')}<input type="color" data-custom-colour="${e(key)}" value="${e(key==='skin'?draft.skin:key==='hair'?draft.hair:draft.colors[key]??'#ffffff')}" aria-label="${e(t('Custom colour: {field}',{field:colorLabel(key)}))}"/></div></fieldset>`).join('');
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>{const selected=button.dataset.tab===active;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
    paint();
  };
  const setColor=(key:string,value:string)=>{if(key==='skin')draft.skin=value;else if(key==='hair')draft.hair=value;else draft.colors[key]=value;paint();};
  const applyPreset=(name:string)=>{const preset=characterPresets.find(p=>p.name===name);if(preset){draft=structuredClone(preset.recipe);render();}};
  root.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    if(button.dataset.tab){active=button.dataset.tab;render();}
    else if(button.dataset.slot){const slot=button.dataset.slot;if(slot==='body')draft.build=button.dataset.option!;else draft.parts[slot]=button.dataset.option||null;draft=normalizeAvatar(draft);for(const blocked of Object.keys(resolveRecipe(draft).disabled))draft.parts[blocked]=null;render();}
    else if(button.dataset.colourKey){setColor(button.dataset.colourKey,button.dataset.colour!);render();}
    else if(button.hasAttribute('data-random')){draft=randomAvatar();render();}
    else if(button.dataset.turn){facing=(facing+Number(button.dataset.turn)+4)%4;paint();}
  });
  root.addEventListener('keydown',event=>{
    if(!(event.target instanceof HTMLElement)||!event.target.matches('[data-tab]')||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const index=tabs.indexOf(active);active=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1)+tabs.length)%tabs.length];render();root.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`)?.focus();
  });
  root.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.dataset.customColour){setColor(input.dataset.customColour,input.value);panel.querySelectorAll<HTMLButtonElement>('[data-colour-key]').forEach(button=>{if(button.dataset.colourKey===input.dataset.customColour)button.setAttribute('aria-pressed',String(button.dataset.colour===input.value));});}});
  root.querySelector<HTMLSelectElement>('[data-preset]')!.onchange=event=>applyPreset((event.target as HTMLSelectElement).value);
  motionSelect.onchange=()=>{
    const requested=motionSelect.value;
    motion=['standing','walking',...availableCharacterPoses(draft)].includes(requested)?requested:'standing';
    clock={phase:0,lastTimeMs:null};poseClock={elapsedMs:0,lastTimeMs:null};motionSelect.value=motion;paint();
  };
  const stop=()=>{disposed=true;cancelAnimationFrame(request);request=0;document.removeEventListener('visibilitychange',visibilityChanged);for(const target of [canvas,...strip])releaseAvatarPreview(target);};
  const schedule=()=>{if(!root.isConnected){stop();return;}if(!disposed&&!document.hidden&&!request)request=requestAnimationFrame(tick);};
  const tick=(timestamp:number)=>{request=0;if(!root.isConnected){stop();return;}clock=advanceWalkClock(clock,timestamp,{active:motion==='walking'&&visible()&&!reducedMotion.matches});const action=characterCatalogue.poseSets?.[poseSet()];if(action)poseClock=advancePoseClock(poseClock,timestamp,action.frameDurations,visible()&&!reducedMotion.matches);paint();schedule();};
  const visibilityChanged=()=>{clock={...clock,lastTimeMs:null};poseClock={...poseClock,lastTimeMs:null};if(document.hidden){cancelAnimationFrame(request);request=0;}else schedule();};
  document.addEventListener('visibilitychange',visibilityChanged);render();schedule();
  return Object.assign(()=>structuredClone(draft),{applyPreset});
}
