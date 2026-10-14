/** Private authoring audits install real examples; production starts from presentation only. */
import { readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import {fileURLToPath} from 'node:url';
import {transpileModule,ModuleKind} from 'typescript';
import {installAuthoringFixtures} from './content-fixtures';
import {quests,npcs} from '../content';
import {seededShuffle} from '../game-shuffle';
import {installExpeditionRegions,type ExpeditionRegion} from '../expeditions';
import {installExpeditionGames,type ExpeditionGame} from '../expedition-games';
import {installInteriors,type InteriorSpec} from '../interiors';
import {clearExpeditionLearning,installExpeditionLearning} from '../expedition-learning';
import {installInteriorConversations,clearInteriorConversations,type InteriorConversation,type InteriorConversationLine} from '../interior-conversations';
import {interiors} from '../interiors';

const directory=resolve(dirname(fileURLToPath(import.meta.url)),'../../../content/source');
function module<T>(name:string):T {
  const source=readFileSync(resolve(directory,name),'utf8').replace(/^import .*;\s*$/gm,'');
  const exports={};
  new Function('exports','quests','npcs','seededShuffle',transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText)(exports,quests,npcs,seededShuffle);
  return exports as T;
}
export function installExpeditionFixtures():void {
  installAuthoringFixtures();
  installExpeditionRegions(module<{expeditionRegions:ExpeditionRegion[]}>('expeditions.ts').expeditionRegions);
  const games=module<{expeditionGames:ExpeditionGame[];expeditionAgreement:(game:ExpeditionGame,values:Record<string,number>)=>string}>('expedition-games.ts');
  for(const game of games.expeditionGames)game.formatAgreement=values=>games.expeditionAgreement(game,values);
  installExpeditionGames(games.expeditionGames);
  installInteriors(module<{interiors:InteriorSpec[]}>('interiors.ts').interiors);
  const conversations=module<{interiorConversations:InteriorConversation[]}>('interior-conversations.ts').interiorConversations;
  const offsets=(text:string)=>[...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’ʼ-][\p{L}\p{M}\p{N}]+)*/gu)].map(match=>[match.index!,match.index!+match[0].length] as [number,number]);
  const align=(value:InteriorConversationLine,id:string)=>{value.aligned={id,de:{text:value.german,tokens:offsets(value.german)},support:{en:{text:value.english,tokens:offsets(value.english),align:[]},tr:{text:value.turkish,tokens:offsets(value.turkish),align:[]}}};};
  for(const conversation of conversations)for(const node of Object.values(conversation.nodes)){align(node.line,`${conversation.objectId}:${node.id}`);for(const choice of node.choices)align(choice.line,`${conversation.objectId}:${node.id}:${choice.id}`);}
  clearInteriorConversations();installInteriorConversations(conversations);
  const facts=module<{interiorWordMeanings:Record<string,string>;interiorWordExamples:Record<string,[string,string,string]>}>('word-detail.ts');
  for(const room of interiors)for(const object of room.objects)for(const [index,word] of object.vocabulary.entries()){
    const turkish=facts.interiorWordMeanings[word.lemma],german=[word.article,word.lemma].filter(Boolean).join(' ');
    word.aligned={id:`${object.id}:word:${index}`,de:{text:german,tokens:offsets(german)},support:{en:{text:word.english,tokens:offsets(word.english),align:[]},...(turkish?{tr:{text:turkish,tokens:offsets(turkish),align:[]}}:{})}};
    const conversation=conversations.find(value=>value.objectId===object.id),forms=new Set([word.lemma,...(word.plural.match(/\p{L}+/gu)??[]).filter(word=>word!=='die')].map(word=>word.toLocaleLowerCase('de')));
    const example=conversation?Object.values(conversation.nodes).flatMap(node=>[node.line,...node.choices.map(choice=>choice.line)]).find(line=>(line.german.match(/\p{L}+/gu)??[]).some(word=>forms.has(word.toLocaleLowerCase('de')))):undefined;
    const extra=facts.interiorWordExamples[word.lemma];
    if(example)word.example=[{german:example.german,english:example.english,turkish:example.turkish,aligned:example.aligned} as never];
    else if(extra){const value:InteriorConversationLine={german:extra[0],english:extra[1],turkish:extra[2]};align(value,`${object.id}:example:${index}`);word.example=[{german:value.german,english:value.english,aligned:value.aligned}];}
  }
  clearExpeditionLearning();
  const data=JSON.parse(readFileSync(resolve(directory,'expedition-learning.json'),'utf8'));
  installExpeditionLearning(data);
}
installExpeditionFixtures();
