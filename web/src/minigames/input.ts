import { gamepadInput } from '../world-gamepad';
import type { GameInput } from './types';
/** DOM targets stay available to screen readers, touch, keys and standard controllers. */
export class MiniGameInput implements GameInput {
  bind(root: HTMLElement): () => void {
    let raf = 0, lastPad = false, lastMove = 0, active = true;
    const visible = (button: HTMLButtonElement) => !button.closest('[hidden],[aria-hidden="true"],[inert]');
    const targets = () => [...root.querySelectorAll<HTMLButtonElement>('[data-game-option]:not(:disabled),[data-game-action]:not(:disabled),[data-game-key]:not(:disabled),[data-game-quantity]:not(:disabled),[data-game-umlaut]:not(:disabled),button[type="submit"]:not(:disabled)')].filter(visible);
    const move = (delta: number) => { const buttons = targets(); if(!buttons.length)return; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[index<0?(delta<0?buttons.length-1:0):(index+delta+buttons.length)%buttons.length].focus(); };
    const key = (event: KeyboardEvent) => {
      if(event.ctrlKey || event.metaKey || event.altKey || event.repeat || !root.closest('dialog')?.open)return;
      const target=event.target;
      if(target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable))return;
      if(target instanceof HTMLElement && target.closest('[data-sentence-word-index],[data-dialogue-word-index]'))return;
      if(target instanceof HTMLElement && !root.contains(target) && target!==document.body)return;
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-game-option]:not(:disabled)')].filter(visible);
      if(/^[1-6]$/.test(event.key)){event.preventDefault();buttons[Number(event.key)-1]?.click();}
      else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){event.preventDefault();move(event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1);}
      else if(event.key==='Enter'&&root.contains(document.activeElement)){const button=(document.activeElement as HTMLElement)?.closest<HTMLButtonElement>('button');if(button&&!button.disabled){event.preventDefault();button.click();}}
    };
    const poll = (time:number) => {
      if(!active)return;
      const pad = gamepadInput(navigator.getGamepads?.() ?? []);
      if(root.closest('dialog')?.open){
        if((Math.abs(pad.x)>.6||Math.abs(pad.y)>.6)&&time-lastMove>220){move((Math.abs(pad.x)>=Math.abs(pad.y)?pad.x:pad.y)>0?1:-1);lastMove=time;}
        if(pad.interact&&!lastPad&&root.contains(document.activeElement)){const button=(document.activeElement as HTMLElement)?.closest<HTMLButtonElement>('button');if(button&&!button.disabled&&visible(button))button.click();}
      }
      lastPad=pad.interact; raf=requestAnimationFrame(poll);
    };
    document.addEventListener('keydown',key);raf=requestAnimationFrame(poll);
    return () => {active=false;cancelAnimationFrame(raf);document.removeEventListener('keydown',key);};
  }
}
