// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountDepartureBoard, type DepartureBoardController, type DepartureField } from './departure-board';
import type { SpriteLibrary } from './sprite-library';

let controllers:DepartureBoardController[];
beforeEach(()=>{controllers=[];vi.useFakeTimers();});
afterEach(()=>{for(const controller of controllers)controller.destroy();document.body.replaceChildren();vi.useRealTimers();});
function surface(fields:DepartureField[]=[{id:'time',label:'Zeit',values:['08:00','09:00','10:00'],initialIndex:1,target:'SECRET TARGET'},{id:'platform',label:'Gleis',values:['1','2','7'],initialIndex:0},{id:'destination',label:'Nach',values:['Lindenhafen','Waldruh'],initialIndex:1},{id:'notice',label:'Hinweis',values:['pünktlich','Verspätung'],initialIndex:0}],reducedMotion=false){
  const dialog=document.createElement('dialog');dialog.open=true;const root=document.createElement('div');dialog.append(root);document.body.append(dialog);
  const sprites={has:vi.fn(()=>true),preload:vi.fn(async()=>{}),render:vi.fn((frame:string,alt:string)=>{const img=document.createElement('img');img.alt=alt;img.dataset.frame=frame;return img;})} as unknown as SpriteLibrary;
  const onConfirm=vi.fn(),onFlap=vi.fn();const controller=mountDepartureBoard(root,{fields,sprites,reducedMotion,onConfirm,onFlap});controllers.push(controller);
  const flap=(column:number,direction:number)=>root.querySelector<HTMLButtonElement>(`[data-flap-column="${column}"][data-flap-direction="${direction}"]`)!.click();
  const selected=(column:number)=>root.querySelector(`[data-flap-value="${column}"]`)!.textContent;
  const confirm=()=>root.querySelector<HTMLButtonElement>('[type="submit"]')!.click();
  return {root,dialog,controller,sprites,onConfirm,onFlap,flap,selected,confirm};
}

describe('native departure split-flap board',()=>{
  it('preserves exact selected values, cycles in both directions, and submits four columns',()=>{
    const {root,onConfirm,onFlap,flap,selected,confirm}=surface();
    expect(selected(0)).toBe('09:00');expect(selected(2)).toBe('Waldruh');
    flap(0,1);expect(selected(0)).toBe('10:00');flap(0,1);expect(selected(0)).toBe('08:00');flap(0,-1);expect(selected(0)).toBe('10:00');
    flap(1,-1);expect(selected(1)).toBe('7');flap(2,1);expect(selected(2)).toBe('Lindenhafen');
    expect(onConfirm).not.toHaveBeenCalled();confirm();
    expect(onConfirm).toHaveBeenCalledOnce();expect(onConfirm).toHaveBeenCalledWith({time:'10:00',platform:'7',destination:'Lindenhafen',notice:'pünktlich'});
    expect(onFlap).toHaveBeenCalledTimes(5);expect(root.innerHTML).not.toContain('SECRET TARGET');
    expect(root.querySelector('[data-target]')).toBeNull();expect(root.querySelector('[data-correct]')).toBeNull();
  });

  it('exposes labelled native controls and contains confirmation within its own root',()=>{
    const {root,flap,confirm,onConfirm}=surface();const parentSubmit=vi.fn(),parentClick=vi.fn();document.body.addEventListener('submit',parentSubmit);document.body.addEventListener('click',parentClick);
    expect(root.querySelector('[aria-label="Zeit: previous value"]')).not.toBeNull();expect(root.querySelector('[aria-label="Hinweis: next value"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-game-control="flap"]')).toHaveLength(8);
    flap(0,1);expect(parentClick).not.toHaveBeenCalled();confirm();expect(onConfirm).toHaveBeenCalledOnce();expect(parentSubmit).not.toHaveBeenCalled();
    document.body.removeEventListener('submit',parentSubmit);document.body.removeEventListener('click',parentClick);
  });

  it('animates all nine flap frames, freezes them while paused, and resumes without changing answers',async()=>{
    const {root,controller,flap,selected,onConfirm,confirm}=surface();
    const frame=()=>root.querySelector('[data-flap-cell="0"] [data-flap-frame]:not([hidden])')!.getAttribute('data-flap-frame');
    expect(frame()).toBe('0');flap(0,1);expect(frame()).toBe('1');await vi.advanceTimersByTimeAsync(40);expect(frame()).toBe('3');
    controller.pause();const paused=frame();await vi.advanceTimersByTimeAsync(1000);expect(frame()).toBe(paused);flap(0,1);confirm();expect(selected(0)).toBe('10:00');expect(onConfirm).not.toHaveBeenCalled();
    controller.resume();await vi.advanceTimersByTimeAsync(200);expect(frame()).toBe('0');expect(selected(0)).toBe('10:00');
    expect(root.querySelector('[data-flap-cell="0"]')!.classList.contains('is-flipping')).toBe(false);confirm();expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('keeps reduced motion static and allows a neutral ungraded column',()=>{
    const {root,flap,onFlap,selected,confirm,onConfirm}=surface([{id:'time',label:'Zeit',values:['09:00','10:00'],initialIndex:-1},{id:'notice',label:'Hinweis',values:['—'],initialIndex:999}],true);
    expect(selected(0)).toBe('10:00');expect(selected(1)).toBe('—');expect([...root.querySelectorAll<HTMLButtonElement>('[data-flap-column="1"]')].every(button=>button.disabled)).toBe(true);
    flap(0,1);expect(selected(0)).toBe('09:00');expect(root.querySelector('[data-flap-cell="0"]')!.classList.contains('is-flipping')).toBe(false);expect(vi.getTimerCount()).toBe(0);
    expect(onFlap).toHaveBeenCalledOnce();confirm();expect(onConfirm).toHaveBeenCalledWith({time:'09:00',notice:'—'});
  });

  it('does not handle hidden, inert, or closed-dialog input and releases timers on destruction',async()=>{
    const {root,dialog,controller,flap,confirm,onFlap,onConfirm}=surface();
    root.hidden=true;flap(0,1);confirm();root.hidden=false;root.setAttribute('inert','');flap(0,1);confirm();root.removeAttribute('inert');dialog.open=false;flap(0,1);confirm();
    expect(onFlap).not.toHaveBeenCalled();expect(onConfirm).not.toHaveBeenCalled();dialog.open=true;flap(0,1);expect(vi.getTimerCount()).toBe(1);
    const originalButton=root.querySelector<HTMLButtonElement>('[data-flap-column="0"]')!;controller.destroy();await vi.advanceTimersByTimeAsync(200);originalButton.click();
    expect(root.innerHTML).toBe('');expect(vi.getTimerCount()).toBe(0);expect(onFlap).toHaveBeenCalledOnce();expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not mutate host value arrays or grade targets, and rejects unusable duplicate columns',()=>{
    const values=['A','B'],fields=[{id:'destination',label:'Nach',values,initialIndex:0,target:'B'}];
    const {flap,confirm,onConfirm}=surface(fields);values.push('C');flap(0,1);confirm();flap(0,1);confirm();expect(onConfirm.mock.calls.map(call=>call[0])).toEqual([{destination:'B'},{destination:'A'}]);
    expect(fields[0].initialIndex).toBe(0);expect(values).toEqual(['A','B','C']);
    const root=document.createElement('div');expect(()=>mountDepartureBoard(root,{fields:[fields[0],fields[0]],sprites:{} as SpriteLibrary,reducedMotion:true,onConfirm:vi.fn()})).toThrow('unique IDs');
  });
});
