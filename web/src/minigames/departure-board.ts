import './departure-board.css';
import { escapeHtml as e } from '../icons';
import type { SpriteLibrary } from './sprite-library';

export interface DepartureField {
  id:string;
  label:string;
  values:string[];
  initialIndex:number;
  /** Owned by the host; never displayed or graded by this widget. */
  target?:string;
}
export interface DepartureBoardOptions {
  fields:DepartureField[];
  onConfirm(values:Record<string,string>):void;
  sprites:SpriteLibrary;
  reducedMotion:boolean;
  onFlap?():void;
}
export interface DepartureBoardController {pause():void;resume():void;destroy():void;}

/** A physical choice surface. Only the host may grade the submitted columns. */
export function mountDepartureBoard(root:HTMLElement,options:DepartureBoardOptions):DepartureBoardController {
  if(new Set(options.fields.map(field=>field.id)).size!==options.fields.length)throw new Error('Departure columns need unique IDs.');
  const fields=options.fields.map(field=>({id:field.id,label:field.label,values:[...field.values]}));
  const indices=fields.map((field,index)=>field.values.length?((Math.trunc(Number.isFinite(options.fields[index].initialIndex)?options.fields[index].initialIndex:0)%field.values.length)+field.values.length)%field.values.length:0);
  const timers=new Map<number,ReturnType<typeof setTimeout>>(),animationFrames=new Map<number,number>();
  let paused=false,alive=true;
  const allowed=()=>alive&&!paused&&!root.closest('[hidden],[aria-hidden="true"],[inert]')&&(!root.closest('dialog')||root.closest('dialog')!.open);
  root.innerHTML=`<form class="departure-board" aria-label="Departure announcement board"><div class="departure-board-rule" aria-hidden="true">ABFAHRT · VII</div><div class="departure-columns">${fields.map((field,index)=>`<fieldset class="departure-column"><legend>${e(field.label)}</legend><button type="button" class="departure-flap-control" data-game-control="flap" data-game-action="flap" data-flap-column="${index}" data-flap-direction="-1" aria-label="${e(field.label)}: previous value" ${field.values.length<2?'disabled':''}>▲</button><div class="departure-flap-cell" data-flap-cell="${index}"><div class="departure-flap-art" aria-hidden="true"></div><output class="departure-flap-value" data-flap-value="${index}" aria-label="${e(field.label)}" aria-live="polite" lang="de">${e(field.values[indices[index]]??'—')}</output><span class="departure-flap-seam" aria-hidden="true"></span></div><button type="button" class="departure-flap-control" data-game-control="flap" data-game-action="flap" data-flap-column="${index}" data-flap-direction="1" aria-label="${e(field.label)}: next value" ${field.values.length<2?'disabled':''}>▼</button></fieldset>`).join('')}</div><button type="submit" class="departure-lever" data-game-control="confirm" data-game-action="departure-confirm" ${!fields.length||fields.some(field=>!field.values.length)?'disabled':''}><span class="departure-lever-art" aria-hidden="true"></span><span>Abfahrt bestätigen</span></button></form>`;
  const cells=fields.map((_,index)=>root.querySelector<HTMLElement>(`[data-flap-cell="${index}"]`)!);
  for(const cell of cells){
    const art=cell.querySelector<HTMLElement>('.departure-flap-art')!;
    for(let frame=0;frame<9;frame++){
      const wrapper=document.createElement('span');wrapper.dataset.flapFrame=String(frame);wrapper.hidden=frame!==0;
      if(options.sprites.has(`prop-flap-${frame}`))wrapper.append(options.sprites.render(`prop-flap-${frame}`,'',160));
      art.append(wrapper);
    }
  }
  if(options.sprites.has('prop-lever-red'))root.querySelector('.departure-lever-art')?.append(options.sprites.render('prop-lever-red','',64));
  void options.sprites.preload([...Array.from({length:9},(_,index)=>`prop-flap-${index}`),'prop-lever-red']).catch(()=>{});
  const paintFrame=(column:number,frame:number)=>{
    cells[column].querySelectorAll<HTMLElement>('[data-flap-frame]').forEach((element,index)=>element.hidden=index!==frame);
    cells[column].classList.toggle('is-flipping',frame!==0);
  };
  const animate=(column:number,frame=1)=>{
    if(!alive||paused)return;
    if(options.reducedMotion||frame>8){animationFrames.delete(column);timers.delete(column);paintFrame(column,0);return;}
    animationFrames.set(column,frame);paintFrame(column,frame);
    timers.set(column,setTimeout(()=>animate(column,frame+1),20));
  };
  const onClick=(event:Event)=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-flap-column]');
    if(!button||!root.contains(button))return;
    event.preventDefault();event.stopPropagation();
    if(button.disabled||!allowed())return;
    const column=Number(button.dataset.flapColumn),direction=Number(button.dataset.flapDirection),field=fields[column];
    if(!field||![-1,1].includes(direction)||field.values.length<2)return;
    indices[column]=(indices[column]+direction+field.values.length)%field.values.length;
    root.querySelector<HTMLOutputElement>(`[data-flap-value="${column}"]`)!.textContent=field.values[indices[column]];
    const pending=timers.get(column);if(pending!==undefined)clearTimeout(pending);
    animate(column);options.onFlap?.();
  };
  const onSubmit=(event:Event)=>{
    if(event.target!==root.querySelector('form'))return;
    event.preventDefault();event.stopPropagation();
    if(!allowed()||!fields.length||fields.some(field=>!field.values.length))return;
    options.onConfirm(Object.fromEntries(fields.map((field,index)=>[field.id,field.values[indices[index]]])));
  };
  root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);
  return {
    pause(){if(!alive||paused)return;paused=true;for(const timer of timers.values())clearTimeout(timer);timers.clear();root.querySelector('form')?.classList.add('departure-board-paused');root.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);},
    resume(){if(!alive||!paused)return;paused=false;root.querySelector('form')?.classList.remove('departure-board-paused');root.querySelectorAll<HTMLButtonElement>('[data-flap-column]').forEach(button=>button.disabled=fields[Number(button.dataset.flapColumn)].values.length<2);root.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled=!fields.length||fields.some(field=>!field.values.length);for(const [column,frame]of animationFrames)animate(column,frame);},
    destroy(){if(!alive)return;alive=false;for(const timer of timers.values())clearTimeout(timer);timers.clear();animationFrames.clear();root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.replaceChildren();},
  };
}
