import catalogue from './data/character-portraits.json';
import {escapeHtml} from './icons';

/** Dedicated portrait paintings; walking-sprite crops cannot supply this detail. */
export function castPortraitMarkup(id:string,className='',expression='neutral'):string|null {
  const actor=(catalogue.actors as Record<string,{width:number;height:number;expressions:Record<string,string>}>)[id];
  if(!actor)return null;
  const src=actor.expressions[expression]??actor.expressions.neutral;
  return `<img class="portrait painted-portrait ${escapeHtml(className)}" src="${escapeHtml(src)}" width="${actor.width}" height="${actor.height}" alt="" aria-hidden="true"/>`;
}
