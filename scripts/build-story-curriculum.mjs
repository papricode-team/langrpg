#!/usr/bin/env node
/** Author the story once; generate its server grading/completion contract. */
import {writeFile} from 'node:fs/promises';
import {quests} from '../web/src/content.ts';
const manifest = {
  quests:quests.map(quest => ({id:quest.id,reward:quest.reward,requiredItemIds:[...new Set(quest.exercises.map(exercise => exercise.itemId))]})),
  items:quests.flatMap(quest => quest.exercises.map(exercise => ({id:exercise.itemId,level:quest.level}))),
  exercises:quests.flatMap(quest => quest.exercises.map(exercise => ({id:exercise.id,itemId:exercise.itemId,mode:exercise.mode==='choice'?'recognition':exercise.mode==='listen'?'listening':'production',answer:exercise.answer,...(exercise.acceptedAnswers?.length?{acceptedAnswers:exercise.acceptedAnswers}:{}),...(exercise.caseSensitive?{caseSensitive:true}:{}),explanation:exercise.explanation}))),
};
await writeFile(new URL('../server/curriculum.json',import.meta.url), JSON.stringify(manifest,null,2)+'\n');
