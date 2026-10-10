import { describe, expect, it } from 'vitest';
import { grammarForQuest } from './contextual-grammar';
import { quests } from './content';
import { courseGrammar } from './course';

describe('grammar in a conversation', () => {
  it('connects every production scene to an existing grammar guide and a contextual German note', () => {
    for (const quest of quests) {
      const note = grammarForQuest(quest.id,courseGrammar)!;
      expect(note.german).toBeTruthy(); expect(note.english).toBeTruthy();
      expect(note.title).toBeTruthy(); expect(note.explanation).toBeTruthy();
      if(quest.level==='A1') for(const sentence of note.german.split(/[.!?]/)) expect(sentence.trim().split(/\s+/).length).toBeLessThanOrEqual(16);
    }
  });
});
