import { describe, expect, it } from 'vitest';
import { courseLexicon, courseUnits, courseGrammar, courseExercises, courseExerciseById, lexemeById, courseSources, courseContextWordIds, courseActivityWordIds, courseNPCWordIds, courseReferenceCoverage } from './course';
import { quests, npcs } from './content';
import { answerMatches, gradeFeedback, modeFor } from './learning';
import { activityScenarios } from './activity-engine';
import manifest from '../../server/course.json';

const exerciseManifest = new Map(manifest.exercises.map(exercise => [exercise.id, exercise]));
const manifestUnits = new Map(manifest.units.map(unit => [unit.id, unit]));
const safeId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const check = (condition: unknown, context: string): void => { if (!condition) throw new Error(context); };
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

describe('German course identity, grading and coverage', () => {
  it('keeps every lexical identity stable, unique, attributed and useful', () => {
    expect(courseLexicon.length).toBeGreaterThan(3000);
    expect(lexemeById.size).toBe(courseLexicon.length);
    const sources = new Set(courseSources.map(source => source.id));
    for (const word of courseLexicon) {
      check(safeId.test(word.id) && word.id.length <= 70, `${word.id}: unsafe identity`);
      check(['A1', 'A2', 'B1'].includes(word.level), `${word.id}: invalid level`);
      check(word.lemma.trim() && word.english.trim(), `${word.id}: missing lemma/gloss`);
      check(!/agent noun of|verbal noun of|TODO|placeholder|translation pending/i.test(word.english), `${word.id}: unusable English gloss`);
      check(sources.has(word.sourceId) && /^https:\/\/(en|de)\.wiktionary\.org\/wiki\//.test(word.sourceUrl), `${word.id}: missing attribution`);
      check(!word.article || ['der','die','das'].includes(word.article), `${word.id}: invalid article`);
    }
    // The two genuine grammatical homonyms must not share their parent's memory identity.
    expect(lexemeById.get('sein-verb')?.english).toContain('to be');
    expect(lexemeById.get('sein-det')?.english).toContain('his');
    expect(lexemeById.get('ihr-det')?.english).toContain('her');
    expect(courseExerciseById.get('lex-sie-formal-pron-production')?.caseSensitive).toBe(true);
    expect(answerMatches(courseExerciseById.get('lex-sie-formal-pron-production')!, 'sie')).toBe(false);
    expect(answerMatches(courseExerciseById.get('lex-morgen-noun-production')!, 'morgen')).toBe(true);
    expect(gradeFeedback(courseExerciseById.get('lex-morgen-noun-production')!, 'morgen')).toContain('Accepted. Remember capitalization');
    expect(courseExerciseById.get('lex-morgen-noun-production')?.caseSensitive).toBe(true);
    expect(courseLexicon.some(word => word.lemma === 'h')).toBe(false);
    expect(courseExerciseById.get('lex-apfel-noun-production')?.caseSensitive).toBe(true);
    expect(answerMatches(courseExerciseById.get('lex-apfel-noun-production')!, 'Der Apfel')).toBe(true);
    expect(answerMatches(courseExerciseById.get('lex-apfel-noun-production')!, 'der apfel')).toBe(true);
    expect(gradeFeedback(courseExerciseById.get('lex-apfel-noun-production')!, 'der apfel')).toContain('Accepted. Remember capitalization');
    expect(courseExerciseById.get('lex-beamter-noun-listening')?.german).toBe('der Beamte');
    expect(courseExerciseById.get('lex-vorsitzender-noun-listening')?.german).toBe('der Vorsitzende');
  });

  it('gives every word independent recognition, listening and typed German retrieval', () => {
    for (const word of courseLexicon) {
      const drills = ['recognition', 'listening', 'production'].map(mode => courseExerciseById.get(`lex-${word.id}-${mode}`)!);
      check(drills.every(Boolean), `${word.id}: missing independent drill`);
      check(same(drills.map(modeFor),['recognition','listening','production']), `${word.id}: wrong modalities`);
      for (const exercise of drills) {
        check(exercise.itemId===`word-${word.id}` && exercise.targetWordId===word.id, `${exercise.id}: wrong direct target`);
        check(exercise.wordIds.includes(word.id) && exercise.level===word.level, `${exercise.id}: wrong word/level link`);
      }
      check(drills[2].answer===word.lemma, `${word.id}: production is not the German headword`);
    }
  });

  it('has one correct canonical answer and valid accepted variants for every offered task', () => {
    expect(courseExerciseById.size).toBe(courseExercises.length);
    for (const exercise of courseExercises) {
      check(safeId.test(exercise.id), `${exercise.id}: unsafe exercise identity`);
      check(answerMatches(exercise,exercise.answer), `${exercise.id}: canonical answer rejected`);
      check((exercise.acceptedAnswers??[]).every(accepted=>answerMatches(exercise,accepted)), `${exercise.id}: accepted variant rejected`);
      check(exercise.prompt.trim() && exercise.hint.trim() && exercise.explanation.trim(), `${exercise.id}: missing teaching text`);
      if(exercise.mode==='choice' || exercise.mode==='listen')check(exercise.options && exercise.options.length>=3 && exercise.options.includes(exercise.answer) && new Set(exercise.options).size===exercise.options.length, `${exercise.id}: unsolvable or duplicate choices`);
      if(exercise.mode==='sentence')check(exercise.tokens?.join(' ')===exercise.answer, `${exercise.id}: sentence tiles do not build the answer`);
      check(exercise.wordIds.every(id=>lexemeById.has(id)), `${exercise.id}: invented word link`);
    }
  });

  it('matches authoritative server answers, modes and exact completion evidence', () => {
    expect(exerciseManifest.size).toBe(courseExercises.length);
    expect(manifest.lexicon.map(word => word.id)).toEqual(courseLexicon.map(word => word.id));
    for (const exercise of courseExercises) {
      const server=exerciseManifest.get(exercise.id)!;
      check(server && server.itemId===exercise.itemId && server.answer===exercise.answer && server.mode===modeFor(exercise), `${exercise.id}: client/server answer or mode mismatch`);
      check(same(server.acceptedAnswers??[],exercise.acceptedAnswers??[]) && same(server.wordIds,exercise.wordIds), `${exercise.id}: client/server variant or word link mismatch`);
      check(('targetWordId' in server ? server.targetWordId:undefined)===exercise.targetWordId, `${exercise.id}: client/server direct target mismatch`);
      check(('caseSensitive' in server ? server.caseSensitive:false)===(exercise.caseSensitive??false), `${exercise.id}: client/server case sensitivity mismatch`);
    }
    for(const unit of courseUnits) {
      const server=manifestUnits.get(unit.id)!;
      check(server && same(server.requiredItemIds,unit.requiredItemIds) && same(server.requiredExerciseIds,unit.exerciseIds) && same(server.requiredWordIds,unit.requiredWordIds) && server.reward===unit.reward, `${unit.id}: client/server completion contract mismatch`);
    }
  });

  it('makes all words reachable through short routes and distinguishes productive completion', () => {
    const reachable = new Set<string>();
    const grammarIds=new Set(courseGrammar.map(guide=>guide.id));
    for(const unit of courseUnits) {
      check(new Set(unit.exerciseIds).size===unit.exerciseIds.length && unit.exerciseIds.every(id=>courseExerciseById.has(id)), `${unit.id}: duplicated or missing exercise`);
      check(unit.grammarIds.every(id=>grammarIds.has(id)) && unit.reward<=100, `${unit.id}: invalid guide or reward`);
      if(unit.requiredWordIds.length) {
        check(unit.requiredWordIds.length<=12, `${unit.id}: vocabulary run too large`);
        const requirements=new Set(unit.requiredExerciseIds);
        for(const id of unit.requiredWordIds) {
          reachable.add(id);
          check(['recognition','listening','production'].every(mode=>requirements.has(`lex-${id}-${mode}`)), `${unit.id}: a word modality can be skipped`);
        }
      }
    }
    expect(reachable.size).toBe(courseLexicon.length);
  });

  it('offers original connected text, guided writing and new transfer checkpoints at each level', () => {
    for (const level of ['A1', 'A2', 'B1']) {
      expect(courseGrammar.filter(guide => guide.level === level).length).toBeGreaterThanOrEqual(12);
      for (const kind of ['grammar', 'reading', 'writing', 'listening']) expect(courseExercises.some(exercise => exercise.level === level && exercise.kind === kind && !exercise.targetWordId)).toBe(true);
      const checkpoint = courseUnits.find(unit => unit.id === `course-${level.toLowerCase()}-checkpoint`)!;
      expect(checkpoint).toBeDefined();
      const tasks = checkpoint.exerciseIds.map(id => courseExerciseById.get(id)!);
      expect(tasks.map(task => task.kind)).toEqual(['reading', 'reading', 'listening', 'listening', 'writing', 'writing']);
      expect(tasks.filter(task => task.kind === 'writing').every(task => task.mode === 'type')).toBe(true);
    }
  });

  it('tracks old quests, actual custom activity scenes and NPCs as exposure only', () => {
    const legacy = quests.flatMap(quest => quest.exercises);
    expect(legacy).toHaveLength(126);
    expect(manifest.quests).toEqual([]);
    expect(courseContextWordIds).toEqual(manifest.contextWordIds);
    expect(Object.keys(courseContextWordIds)).toHaveLength(126);
    expect(legacy.every(exercise => courseContextWordIds[exercise.id]?.length)).toBe(true);
    for (const scenario of activityScenarios) expect(courseActivityWordIds[scenario.id]?.length).toBeGreaterThan(0);
    for (const npc of npcs) expect(courseNPCWordIds[npc.id]?.length).toBeGreaterThan(0);
    expect(courseActivityWordIds).toEqual(manifest.activityWordIds);
    expect(courseNPCWordIds).toEqual(manifest.npcWordIds);
    expect(courseContextWordIds['a1-arrival-exercise-2']).toContain('ich-pron');
    expect(courseContextWordIds['a1-arrival-exercise-2']).toContain('heissen-verb');
    expect(courseContextWordIds['a1-arrival-exercise-2']).not.toContain('heiss-adj');
    for (const id of ['du-pron','er-pron','es-pron','ihr-pron','sie-pron','wir-pron']) expect(courseContextWordIds['a1-arrival-exercise-2']).not.toContain(id);
    expect(courseContextWordIds['a1-arrival-exercise-2']).not.toContain('sein-det');
    expect(courseExerciseById.get('course-a1-pronouns-exercise-3')?.wordIds).toContain('bahnhofsvorsteher-noun');
    expect(courseExerciseById.get('course-b1-procedure-exercise-1')?.wordIds).toContain('abstimmung-noun');
  });

  it('reports mapped reference forms honestly and explains every remaining exception', () => {
    for (const audit of courseReferenceCoverage) {
      expect(audit.mappedForms + audit.remainingForms.length).toBe(audit.normalizedReferenceForms);
      expect(audit.mappedForms / audit.normalizedReferenceForms).toBeGreaterThan(0.99);
      expect(audit.remainingForms.every(form => audit.exclusions.some(exclusion => exclusion.form === form))).toBe(true);
    }
    expect(courseContextWordIds['a1-arrival-exercise-1']).toContain('morgen-noun');
    expect(courseContextWordIds['a1-arrival-exercise-1']).not.toContain('morgen-adv');
    const pronoun = lexemeById.get('sein-det')!;
    expect(pronoun.aliases?.some(alias => alias.form === 'seine')).toBe(true);
    expect(lexemeById.get('sein-verb')?.aliases?.some(alias => alias.form === 'seine')).toBeFalsy();
    for (const fragment of ['-weis', 'elektr-', 'wandrung', 'weltenweit', 'siebenzig']) expect(courseLexicon.some(word => word.lemma === fragment)).toBe(false);
  });
});
