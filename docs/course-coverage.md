# German course coverage

Edition `de-en-a1-b1-2026-10-09` adds a broad German-for-English curriculum alongside the original 18 story quests and 126 contextual targets. It contains **3,283 lexical entries**, **405 units**, **39 grammar guides**, and **10,266 exercises**. Counts describe implemented material, not assessed CEFR proficiency or educator validation. Speaking is excluded by the product brief.

| Placement | Lexical entries |
| --- | ---: |
| A1 | 811 |
| A2 | 639 |
| B1 | 1,833 |

There are 3,281 distinct exact headword spellings. The two additional identities are genuine grammatical homonyms: verb/possessive `sein` and personal/possessive `ihr`. Capitalized formal `Sie` and language/noun homographs also have distinct meanings. Inflections, Swiss/regional spellings, abbreviations and stems do not inflate lexical counts. The catalog includes reference-linked vocabulary and 122 additional headwords needed by the game's original scenarios and texts.

## Playable coverage

Every entry has three independent tasks: German-to-English recognition, audio-to-meaning listening, and typed English-to-German retrieval. Vocabulary routes contain at most 12 words; completing a route requires successful unaided evidence for all three modalities, accumulated across sessions. Listening tasks pronounce nouns with their article. Noun spelling and formal `Sie` are case-sensitive; articles may be omitted, and natural initial article capitalization is accepted. Adjectival nouns record their correct article form, such as `der Beamte` for headword `Beamter`.

The course also includes 36 core grammar guides, three word-building guides, 18 original connected reading texts, 18 original listening texts, 18 guided writing units, and one six-task transfer checkpoint at each level. Checkpoints use new connected texts and require comprehension plus typed responses. These tasks practise communication patterns and transfer; canonical answers and listed alternatives assess constrained responses, not unrestricted essays.

Grammar progresses from present tense, questions, gender, cases, negation, time, separable verbs and requests through past events, subordinate clauses, comparisons, relative clauses and polite requests to reported accounts, passive constructions, hypothetical reasoning, concessions, purpose and formal argument. Topics include cafés, travel, housing, health, work, relationships, weather, public decisions and the Atlas mystery. All instructional examples and passages are original.

## Reference audit

The comparison uses the published Goethe references via [DWDS's Goethe headword API](https://www.dwds.de/d/api#wb-list-goethe), retrieved 2026-10-09. It compares distinct reference spellings, normalized for case, Swiss `ß/ss`, and terminal abbreviation periods. A mapped form has a headword, linked variant/inflection, or an authored abbreviation/word-building task. It need not be a separately counted word.

| Reference | Distinct spellings | Normalized forms | Mapped | Explicit exceptions |
| --- | ---: | ---: | ---: | ---: |
| A1 | 844 | 835 | 831 | 4 |
| A2 | 616 | 611 | 610 | 1 |
| B1 | 1,850 | 1,840 | 1,835 | 5 |

The remaining normalized strings are A1 `ander`, `best`, `letzt`, `siebenzig`; A2 `händetuch`; B1 `-weis`, `eck`, `elektr-`, `wandrung`, `weltenweit`. The data records a reason for every exception. Bound stems are taught in complete grammatical or word-building forms; apparent anomalous spellings are excluded while their standard forms are taught. They are not offered as standalone words to memorize. The API's spelling rows differ from the publisher's approximately 650 A1 words and 2,400 B1 lexical-unit accounting: themed groups, compounds, variants and families are counted differently. This audit therefore establishes reference-form coverage, not complete coverage of every PDF section, every sense, or every CEFR skill.

See the primary [A1](https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf), [A2](https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_A2_Wortliste.pdf), and [B1](https://www.goethe.de/pro/relaunch/prf/de/Goethe-Zertifikat_B1_Wortliste.pdf) lists. The [CEFR level descriptions](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions) concern communicative ability across skills. This course has not been certified or reviewed by Goethe, DWDS or a language educator.

## Identity, evidence and rebuilding

`web/src/course.ts` exports typed lexemes, units, guides, exercises, sources and ID maps. `web/src/data/course.json` and `server/course.json` are generated together by `node scripts/build-course.mjs`, using the checked-in lexical snapshot, editorial supplement and `scripts/course-lessons.mjs`. Normal builds need no external download. The server manifest includes the exact answers, permitted alternatives, case sensitivity, modes, direct word targets and unit completion requirements.

Stable identities are `word-<lexeme-id>` and `lex-<lexeme-id>-recognition|listening|production`. Contextual `wordIds` mean exposure only; `targetWordId` identifies an independent vocabulary test. The 126 legacy exercises, 48 custom activity scenes plus 12 activity/level pools, and seven NPC greetings are mapped to encountered lemmas/forms. Proper names are excluded from memorization. Inflected and separated verbs link to their parent; recognizing a contextual sentence does not establish independent word recall. Exposure mapping is conservative morphology matching, not a full German semantic parser.

Run `npm run test --workspace web -- src/course.test.ts` and `npm run check --workspace web` after rebuilding. Integrity tests verify every independent modality, canonical answer, accepted variant, short unit, checkpoint, legacy mapping and authoritative server/client grading match. Imported lexical meanings/forms have [documented CC BY-SA attribution](course-sources.md); original instructional writing is kept separate.

## Practical limits

The catalog prioritizes ordinary senses and useful forms. It does not exhaust every meaning of a polysemous word or every German inflection; some compounds use original component-based glosses identified in their provenance. Educator review, learner studies and further authentic listening material remain necessary. Bundled audio uses one synthetic Anna voice rather than a range of speakers. Reading, listening and constrained writing evidence can guide practice, but neither inventory size nor task completion proves B1 competence.
