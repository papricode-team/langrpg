import { avatarColors, characterFrame, normalizeParts, partOptions } from './avatar-options';
import { paintCharacter, type ModularAvatar } from './modular-character';
import { advanceWalkClock, type WalkClock } from './walk-animation';
import './character-builder.css';
const labels={face:'Face',hairstyle:'Hair & headwear',jacket:'Jacket',bottom:'Trousers',build:'Build'};
export function characterBuilderMarkup(){return `<section class="character-builder" aria-label="Character builder"><div class="builder-preview"><canvas width="256" height="384" aria-label="Your assembled character" role="img"></canvas><div class="builder-turns"><button type="button" data-turn="-1" aria-label="Turn character left">↶</button><button type="button" data-walk aria-pressed="true">Walking</button><button type="button" data-turn="1" aria-label="Turn character right">↷</button></div><p>Make yourself at home.</p></div><div class="builder-controls">${Object.entries(partOptions).map(([field,options])=>`<label>${labels[field as keyof typeof labels]}<select data-piece="${field}">${options.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>`).join('')}${['skin','hair','outfit','pants'].map(field=>`<fieldset><legend>${{skin:'Skin tone',hair:'Hair / headwear colour',outfit:'Jacket colour',pants:'Trouser colour'}[field]}</legend><div class="builder-colours">${(field==='pants'?avatarColors.outfit:avatarColors[field as keyof typeof avatarColors]).map(([label,color])=>`<button type="button" data-colour-field="${field}" data-colour="${color}" style="--swatch:${color}" aria-label="${label}" title="${label}" aria-pressed="false"></button>`).join('')}<input type="color" data-custom-colour="${field}" aria-label="Custom ${field} colour"/></div></fieldset>`).join('')}</div></section>`;}
export function bindCharacterBuilder(host:HTMLElement,initial:ModularAvatar):()=>ModularAvatar {
 const root=host.querySelector<HTMLElement>('.character-builder')!,canvas=root.querySelector<HTMLCanvasElement>('canvas')!;
 const draft={...initial,...normalizeParts(initial)};let facing=0,walking=false,clock:WalkClock={phase:0,lastTimeMs:null},lastPaintKey='';
 root.querySelectorAll<HTMLSelectElement>('[data-piece]').forEach(select=>{select.closest('label')!.hidden=select.options.length<2;});
 const walkButton=root.querySelector<HTMLButtonElement>('[data-walk]')!;walkButton.textContent='Standing';walkButton.setAttribute('aria-pressed','false');
 const visible=()=>!document.hidden&&(!root.closest('dialog')||root.closest('dialog')!.open);
 const paint=()=>{if(!visible())return;const frame=characterFrame(facing,walking?clock.phase:undefined),key=[frame,draft.face,draft.hairstyle,draft.jacket,draft.bottom,draft.build,draft.skin,draft.hair,draft.outfit,draft.pants].join('|');if(key===lastPaintKey)return;lastPaintKey=key;void paintCharacter(canvas,draft,frame).catch(()=>canvas.setAttribute('aria-label','Character artwork could not load'));};
 const sync=()=>{root.querySelectorAll<HTMLSelectElement>('[data-piece]').forEach(select=>{select.value=draft[select.dataset.piece as keyof typeof partOptions];});root.querySelectorAll<HTMLButtonElement>('[data-colour-field]').forEach(b=>b.setAttribute('aria-pressed',String(draft[b.dataset.colourField as keyof typeof draft]===b.dataset.colour)));root.querySelectorAll<HTMLInputElement>('[data-custom-colour]').forEach(input=>input.value=draft[input.dataset.customColour as keyof typeof draft]);paint();};
 root.querySelectorAll<HTMLSelectElement>('[data-piece]').forEach(select=>select.onchange=()=>{draft[select.dataset.piece as keyof typeof partOptions]=select.value;sync();});
 root.querySelectorAll<HTMLButtonElement>('[data-colour-field]').forEach(b=>b.onclick=()=>{draft[b.dataset.colourField as keyof typeof draft]=b.dataset.colour!;sync();});
 root.querySelectorAll<HTMLInputElement>('[data-custom-colour]').forEach(input=>input.oninput=()=>{draft[input.dataset.customColour as keyof typeof draft]=input.value;sync();});
 root.querySelectorAll<HTMLButtonElement>('[data-turn]').forEach(b=>b.onclick=()=>{facing=(facing+Number(b.dataset.turn)+4)%4;paint();});
 root.querySelector<HTMLButtonElement>('[data-walk]')!.onclick=event=>{walking=!walking;clock={phase:0,lastTimeMs:null};const b=event.currentTarget as HTMLButtonElement;b.textContent=walking?'Walking':'Standing';b.setAttribute('aria-pressed',String(walking));paint();};
 let request=0,disposed=false;
 const stop=()=>{disposed=true;cancelAnimationFrame(request);request=0;document.removeEventListener('visibilitychange',visibilityChanged);};
 const schedule=()=>{if(!root.isConnected){stop();return;}if(!disposed&&!document.hidden&&!request)request=requestAnimationFrame(tick);};
 const tick=(timestamp:number)=>{request=0;if(!root.isConnected){stop();return;}clock=advanceWalkClock(clock,timestamp,{active:walking&&visible()});paint();schedule();};
 const visibilityChanged=()=>{clock={...clock,lastTimeMs:null};if(document.hidden){cancelAnimationFrame(request);request=0;}else schedule();};
 document.addEventListener('visibilitychange',visibilityChanged);sync();schedule();
 return ()=>({...draft});
}
