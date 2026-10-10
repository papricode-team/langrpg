import type { Progress, CourseLevel } from './api';
import type { CourseLexeme } from './course';
import type {Exercise} from './content';

export interface WordGloss { wordId:string; german:string; english:string; known:boolean; }
export type GlossLookup = (surface:string) => WordGloss | undefined;

/** Exact headwords win; uncertain imported inflections never gloss another word. */
export function createGlossLookup(lexicon:readonly CourseLexeme[], progress:Progress):GlossLookup {
  const exact=new Map<string,CourseLexeme[]>(), forms=new Map<string,CourseLexeme[]>();
  const add=(index:Map<string,CourseLexeme[]>,surface:string,word:CourseLexeme)=>{
    if(!/^\p{L}+$/u.test(surface))return;
    const key=surface.normalize('NFC'), entries=index.get(key)??[];
    if(!entries.some(entry=>entry.id===word.id))entries.push(word);
    index.set(key,entries);
  };
  for(const word of lexicon) {
    add(exact,word.lemma,word);
    if(word.pos!=='pron') for(const form of word.surfaceForms??[])add(forms,form,word);
    for(const alias of word.aliases??[])add(forms,alias.form,word);
    if(word.plural)add(forms,word.plural,word);
  }
  return surface=>{
    const key=surface.normalize('NFC');
    const entries=exact.get(key)??exact.get(key.toLocaleLowerCase('de'))??forms.get(key)??forms.get(key.toLocaleLowerCase('de'));
    if(entries?.length!==1)return;
    const word=entries[0], memory=progress.words[word.id];
    return {wordId:word.id,german:word.article?`${word.article} ${word.lemma}`:word.lemma,english:word.english,known:memory?.evidence?.recognition?.status==='retained'};
  };
}

export function glossesForLine(text:string,lookup:GlossLookup):Record<string,string> {
  const glosses:Record<string,string>={};
  for(const surface of text.match(/\p{L}+/gu)??[]) {
    const gloss=lookup(surface);
    if(gloss&&!gloss.known)glosses[surface.toLocaleLowerCase('de')]=`${gloss.german} — ${gloss.english}`;
  }
  return glosses;
}

export function inputCoverage(text:string,lookup:GlossLookup):{known:number;total:number;ratio:number} {
  const tokens=text.replace(/\{[^}]+\}/g,'').match(/\p{L}+/gu)??[];
  const known=tokens.filter(token=>lookup(token)?.known).length;
  return {known,total:tokens.length,ratio:tokens.length?known/tokens.length:1};
}

export function filterKnownGlosses(glosses:Record<string,string>,lookup:GlossLookup):Record<string,string> {
  return Object.fromEntries(Object.entries(glosses).filter(([surface])=>!lookup(surface)?.known));
}

export function selectInputVariant<T extends {german:string}>(variants:readonly T[],lookup:GlossLookup,target=.95):{
  variant:T;coverage:{known:number;total:number;ratio:number};requiresScaffolding:boolean;newWords:string[];glosses:Record<string,string>;
} {
  if(!variants.length)throw new Error('A conversation needs an authored line');
  const scored=variants.map((variant,index)=>({variant,index,coverage:inputCoverage(variant.german,lookup)}));
  const chosen=scored.find(item=>item.coverage.ratio>=target)??[...scored].sort((a,b)=>(a.coverage.total-a.coverage.known)-(b.coverage.total-b.coverage.known)||b.coverage.ratio-a.coverage.ratio||a.index-b.index)[0];
  const newWords=[...new Set((chosen.variant.german.replace(/\{[^}]+\}/g,'').match(/\p{L}+/gu)??[]).filter(word=>!lookup(word)?.known))];
  return {variant:chosen.variant,coverage:chosen.coverage,requiresScaffolding:chosen.coverage.ratio<target,newWords,glosses:glossesForLine(chosen.variant.german,lookup)};
}

export interface InputLevelAudit {aboveLevelWords:string[];unmappedWords:string[];advancedGrammar:string[];longSentences:number;}
/** Lexical tags and sentence patterns are an editorial check, not CEFR proof. */
export function auditInputLevel(text:string,level:CourseLevel,lexicon:readonly CourseLexeme[]):InputLevelAudit {
  const lookup=createGlossLookup(lexicon,{words:{}} as Progress),byId=new Map(lexicon.map(word=>[word.id,word]));
  const rank:Record<CourseLevel,number>={A1:0,A2:1,B1:2};
  const aboveLevelWords=new Set<string>(),unmappedWords=new Set<string>();
  for(const token of text.replace(/\{[^}]+\}/g,'').match(/\p{L}+/gu)??[]) {
    const gloss=lookup(token),word=gloss?byId.get(gloss.wordId):undefined;
    if(!word)unmappedWords.add(token);
    else if(rank[word.level]>rank[level])aboveLevelWords.add(token);
  }
  const advancedGrammar=level==='A1'?['dass','obwohl','während','würde','würden','hätte','hätten'].filter(form=>new RegExp(`\\b${form}\\b`,'iu').test(text)):[];
  const max=level==='A1'?16:level==='A2'?24:36;
  const longSentences=text.split(/[.!?]+/).filter(sentence=>(sentence.match(/\p{L}+/gu)??[]).length>max).length;
  return {aboveLevelWords:[...aboveLevelWords],unmappedWords:[...unmappedWords],advancedGrammar,longSentences};
}

export function recommendedScaffolding(progress:Progress):'more'|'standard'|'lighter' {
  const attempts=Object.values(progress.recentAttempts).filter(attempt=>!attempt.hinted).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,24);
  if(attempts.length<6)return 'more';
  const success=attempts.filter(attempt=>attempt.correct).length/attempts.length;
  return success<.6?'more':success>=.85?'lighter':'standard';
}

export const placementExerciseIds=[
  'a1-arrival-exercise-1','a1-cafe-exercise-6','a1-lost-parcel-exercise-2',
  'a2-evening-plans-exercise-4','a2-archive-exercise-4','a2-apartment-exercise-6',
  'b1-council-exercise-5','b1-witness-exercise-3',
] as const;
export interface PlacementExercise extends Exercise {level:CourseLevel;}
export const placementDialogue:Record<typeof placementExerciseIds[number],{speaker:string;german:string;english:string}>={
  'a1-arrival-exercise-1':{speaker:'Otto',german:'Willkommen! Es ist früh.',english:'Welcome! It is early.'},
  'a1-cafe-exercise-6':{speaker:'Marta',german:'Möchten Sie jetzt bezahlen?',english:'Would you like to pay now?'},
  'a1-lost-parcel-exercise-2':{speaker:'Lina',german:'Ich schicke das Paket. Was brauchen Sie?',english:'I will send the parcel. What do you need?'},
  'a2-evening-plans-exercise-4':{speaker:'Fritz',german:'Wir essen heute zusammen. Kommst du?',english:'We are eating together today. Are you coming?'},
  'a2-archive-exercise-4':{speaker:'Ada',german:'Eine Karte ist aus dem Jahr 1900, die andere aus dem Jahr 2000.',english:'One map is from 1900, the other from 2000.'},
  'a2-apartment-exercise-6':{speaker:'Emil',german:'Das Fenster geht nicht auf.',english:'The window will not open.'},
  'b1-council-exercise-5':{speaker:'Greta',german:'Wir kennen noch nicht alle Fakten. Trotzdem will der Rat entscheiden.',english:'We do not know all the facts yet. The council still wants to decide.'},
  'b1-witness-exercise-3':{speaker:'Elise',german:'Der Zeuge sagt, der Zug sei schon um fünf Uhr abgefahren.',english:'The witness says the train had already left at five.'},
};
export function placementExercises(exercises:readonly PlacementExercise[]):PlacementExercise[] {
  const byId=new Map(exercises.map(exercise=>[exercise.id,exercise]));
  return placementExerciseIds.map(id=>{const exercise=byId.get(id);if(!exercise)throw new Error(`Missing placement exercise ${id}`);return exercise;});
}
export interface PlacementEvidence {level:CourseLevel;correct:boolean;hinted:boolean;}
export function placementRecommendation(results:readonly PlacementEvidence[]):CourseLevel {
  const count=(level:CourseLevel)=>results.filter(result=>result.level===level&&result.correct&&!result.hinted).length;
  if(count('A1')>=2&&count('A2')>=2)return count('B1')>=2?'B1':'A2';
  return 'A1';
}
