# Language learning research and design decisions

Research checked on 2026-10-08. This is a fresh concept for Lantern Atlas; no prior implementation is treated as a design constraint.

## Evidence that informs the game

**Retrieval matters after the first success.** Karpicke and Roediger's experiment used foreign-language vocabulary pairs. Repeated retrieval after initial learning benefited delayed recall; extra study without retrieval did not produce the same benefit in that experiment. The result supports later recall opportunities rather than permanently retiring a phrase after one correct click. It does not establish an exact timetable for this game. [Original study, author-hosted PDF](https://learninglab.psych.purdue.edu/downloads/2008/2008_Karpicke_Roediger_Science.pdf), [publisher record](https://doi.org/10.1126/science.1152408)

**Spacing should adapt to the retention goal.** Cepeda and colleagues studied factual learning over long gaps and test delays. The best spacing interval depended on when memory was tested; excessively short or long gaps were worse than an appropriate gap. Use learner history and delayed recall to tune the schedule, rather than describe a universal 1/3/7/30-day rule as scientifically optimal. [Original study, university repository](https://digitalcommons.usf.edu/psy_facpub/1766/)

**Games can help vocabulary, but the genre is not a guarantee.** Tsai and Tsai's meta-analysis covered 26 studies and separated different comparison designs; estimated effects varied with the comparison. Its evidence supports purposeful digital language activities, with important limits on transferring findings to a specific commercial MMORPG. It does not establish that more combat, higher visual fidelity or multiplayer alone creates faster German acquisition. [Original meta-analysis, publisher](https://doi.org/10.1016/j.compedu.2018.06.020)

**The task must require the language.** The CEFR uses an action-oriented view with communicative activities including reception, production, interaction and mediation. The design inference for this project is to make understanding and expressing German useful for accomplishing an in-world goal, and to assess more than recognition. [Council of Europe CEFR overview](https://www.coe.int/en/web/portfolio/the-common-european-framework-of-reference-for-languages-learning-teaching-assessment-cefr-), [official descriptor index](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors)

**A1–B1 represents capability, not a vocabulary counter.** Goethe's level descriptions move from supported simple interaction through routine practical exchanges to explaining problems, recounting experiences and giving reasons. Its A1 and A2 examinations include listening, reading, writing and speaking; B1 has modules for those four skills. The current microphone-free game cannot demonstrate the full speaking component. [Goethe level descriptions](https://www.goethe.de/en/m/spr/kur/stu.html), [Goethe examination competencies](https://www.goethe.de/en/spr/prf.html)

**Everyday topics can sustain a story.** DW's original Nicos Weg material covers A1–B1 using characters and situations, with topics such as food, travel, health, housing, work, relationships and advice. It is a useful coverage reference. Our plot, prose, characters, exercises and translations are original; we do not copy its curriculum assets. [DW's official teacher workbook](https://static.dw.com/downloads/69399815/Arbeitsbuch-Nicos-Weg-A1-bis-B1-Deutsche-Welle.pdf)

## Recommended game loops

These recommendations are design inferences from learning evidence and communicative goals, not independently validated claims that this exact set is the best possible language game.

| Loop | Why German is necessary | Appropriate practice |
| --- | --- | --- |
| Market and café errands | Understand an order, request an item, handle quantities and prices | A1 requests, noun chunks, numbers; later substitutions and explanations |
| Railway routing | Understand a board or announcement, compare journeys, solve a disruption | Listening, time, directions and clarification |
| Cooperative map expedition | Partners hold different useful information and must explain it | Purposeful interaction and communication repair; NPC partner when alone |
| Workshop commission | Follow or give instructions that affect an assembly | Objects, location, sequence and supported production |
| Witness investigation | Compare accounts and reconstruct an event | Reading/listening, past narration, uncertainty and reasons |
| Town council | Suggest an alternative and respond to other people's concerns | Connected writing, opinions, justification and compromise |

Café assembly and preparation, market basket/budget/trade/change, witness evidence boards and parcel route boards now implement four of these loops with actual manipulable state. Their original German scenes scale across A1, A2 and B1 and reveal earned story clues. Workshop and council themes also appear in authored story or writing tasks; asymmetric cooperative puzzles and unrestricted dialogue assessment are not implemented. Social chat is valuable for the MMORPG experience, but an ordinary chat message is not automatically a graded learning attempt.

## Memory policy

1. Treat an initial exposure as teaching, not mastery. Make meaning available through context, an example and concise explanation.
2. Ask for recall, then give useful feedback. Support novice learners without pretending a hint-assisted answer was independent retrieval.
3. Revisit due targets in short mixed encounters. Use another NPC, task or input modality when possible instead of replaying an identical answer path.
4. Extend intervals after delayed independent successes. Strong targets should receive less review pressure, while natural use in dialogue remains welcome.
5. Keep recognition and production evidence separate. Word tiles are more supported than retrieving a complete response from memory.
6. Pause new-target intake when review load exceeds a reasonable session budget. Reward meaningful progress rather than identical same-session repetitions.

The implementation uses the upstream `go-fsrs/v4` 4.0.0 scheduler with separate cards per item and modality, a 90% retention target, and a maximum interval of 365 days. The game's `Good`/`Again` mapping, hint policy and presentation still need empirical calibration. Default scheduler parameters have not been individually optimized for these players. Neither published spacing findings nor the software can guarantee remembering every word forever. The package and configuration are recorded in `server/go.mod` and `server/srs.go`.

## Validation plan

Validate teaching effectiveness with learners by measuring delayed recall of taught items, comprehension of new examples, unsupported written responses, time spent actively processing German, task completion and return-session review burden. Include learners who start with different abilities and report hint usage. Compare a narrative version with equivalent learning content and time in a simpler presentation to test what the game adds.

A full curriculum requires qualified German review and assessment across skills. Bundled German MP3 clips are synthesized with the macOS Anna voice, so playback does not depend on a German voice being installed on the player's device. These are machine-generated prototype recordings; human speech and varied speakers should follow when audio production is possible. Revealing a transcript changes an audio task into supported reading. Mobile typing, accessibility and unfamiliar keyboards must not be mistaken for low language proficiency. See [art and audio provenance](art.md).

The first 126 targets are useful whole phrases, not a claim that learners know 126 unique dictionary words, have reached B1, or have mastered every word contained in those sentences. The expanded course now tracks attributed lexical identities, articles, plurals, forms and separate recognition/listening/production evidence alongside contextual utterances. Phrase or board success records constituent word exposure; it does not grant word mastery. This inventory is audited against A1–B1 reference forms and the German shown in authored encounters; it remains distinct from educator validation or assessment of unrestricted communication.
