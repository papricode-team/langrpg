import { seededShuffle } from '../game-shuffle';
import type { GameItem } from './types';

const numerals:Record<string,number>={eins:1,zwei:2,drei:3,vier:4,fünf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwölf:12,dreizehn:13,vierzehn:14,fünfzehn:15,sechzehn:16,siebzehn:17,achtzehn:18,neunzehn:19,zwanzig:20};
const destinations=new Set(['bahnhof-noun','hotel-noun','flughafen-noun','haltestelle-noun','bahnsteig-noun','deutschland-name','europa-name','see-noun']);
const notices=new Set(['puenktlich-adj','verspaetung-noun','ankunft-noun','abfahrt-noun','heute-adv','morgen-adv','gestern-adv','bald-adv']);
export interface DepartureField {id:string;label:string;values:string[];initialIndex:number;}
export interface DepartureTarget {field:string;item:GameItem;options:Map<string,GameItem>;}
export interface DepartureRound {fields:DepartureField[];targets:DepartureTarget[];}
export const isDepartureVocabulary=(item:GameItem)=>numerals[item.lemma]!==undefined||destinations.has(item.lexemeId)||notices.has(item.lexemeId);

/** Displayed digits retain the actual lexical choices used by authoritative grading. */
export function departureRound(pool:GameItem[],focus:GameItem,seed:number):DepartureRound {
  const numbers=pool.filter(item=>numerals[item.lemma]!==undefined);
  const specs=[
    {id:'time',label:'Zeit',items:numbers,display:(item:GameItem)=>`${String(numerals[item.lemma]).padStart(2,'0')}:00`},
    {id:'platform',label:'Gleis',items:numbers,display:(item:GameItem)=>String(numerals[item.lemma])},
    {id:'destination',label:'Nach',items:pool.filter(item=>destinations.has(item.lexemeId)),display:(item:GameItem)=>item.lemma},
    {id:'notice',label:'Hinweis',items:pool.filter(item=>notices.has(item.lexemeId)),display:(item:GameItem)=>item.lemma},
  ];
  const round:DepartureRound={fields:[],targets:[]};
  for(const [index,spec]of specs.entries()){
    const available=[...new Map(spec.items.map(item=>[spec.display(item),item])).values()];
    if(available.length<2){round.fields.push({id:spec.id,label:spec.label,values:['—'],initialIndex:0});continue;}
    const ranked=seededShuffle(available,seed+index*73);
    const previous=round.targets.find(target=>target.field==='time')?.item;
    const target=available.includes(focus)&&index!==1?focus:index===1?ranked.find(item=>item!==previous)??ranked[0]:ranked[(index+1)%ranked.length];
    const chosen=[target,...ranked.filter(item=>item!==target).slice(0,3)];
    const choices=seededShuffle(chosen,seed+index*193);
    const values=choices.map(spec.display);
    round.fields.push({id:spec.id,label:spec.label,values,initialIndex:Math.abs(seed+index*37)%values.length});
    round.targets.push({field:spec.id,item:target,options:new Map(choices.map(item=>[spec.display(item),item]))});
  }
  // Early learners may only have general station vocabulary. It still belongs
  // on a real board, without invented number or destination evidence.
  if(!round.targets.length){
    const options=seededShuffle([focus,...pool.filter(item=>item.lexemeId!==focus.lexemeId).slice(0,3)],seed);
    const field=round.fields[3];field.values=options.map(item=>item.lemma);field.initialIndex=Math.abs(seed)%options.length;
    round.targets.push({field:'notice',item:focus,options:new Map(options.map(item=>[item.lemma,item]))});
  }
  return round;
}
