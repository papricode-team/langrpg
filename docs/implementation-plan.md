# Complete language RPG implementation plan

Requested on 2026-10-08. This is one coordinated implementation, with independent work running in parallel.

## Product and learning contract

- Adults and older teens learn German from English through A1, A2 and B1 practice.
- The painted world, humorous mystery and recurring residents give every activity a practical purpose.
- Reading, listening and writing are in scope. Speaking remains excluded at the user's request.
- A reference vocabulary inventory is a coverage target, not a certificate of proficiency. Record exact source coverage, licensing, forms and unresolved ambiguities rather than claiming that XP establishes B1.
- Introduce words in context, practise individual retrieval, track recognition/listening/production separately and schedule later encounters with FSRS. Contextual exposure must not grant independent word mastery.
- Familiar expressions can appear in the world naturally. Required drills select new or due targets and have a short session budget, so exploration continues without a growing review barrier.

## Parallel ownership

| Work | Owner | Deliverable |
| --- | --- | --- |
| Lexicon, level/topic progression, grammar, comprehension and writing | curriculum_lore | Shared course data, canonical grading manifest, original instructional content, source/coverage audit and contract tests |
| Word evidence, persistence, course/activity validation and rewards | architecture_research | Go endpoints, transparent saved-state migration, typed API and adversarial/idempotency tests |
| Café, market, investigation and delivery gameplay | learning_research | Stateful game boards, 48 authored scenes across four activities and three levels, responsive controls and meaningful game-engine tests |
| Integration, world interactions, learning menus, audio, mobile and public preview | root | Native game panels, launch points, course progression, individual-word journal, in-world missions, browser verification and refreshed TryCloudflare build |

## Curriculum and content

Build a reusable German course whose language data is separate from the story. Stable IDs allow another language to be introduced later without discarding a player's progress. Keep the existing eighteen quest IDs and all existing saved phrase targets.

The lexical inventory contains real English meanings and grammatical metadata where available: article, plural, part of speech and verb forms. Audit it against the published Goethe references and label actual coverage. Every trainable lexical target has a server-gradable recognition, listening and independent production task. A structured topic/grammar course adds original sentence patterns, connected reading, listening comprehension and constrained writing. Display lesson explanations before practice and accept explicit valid alternatives.

Curriculum topics include personal information, numbers/time, family, everyday routines, food/shopping, travel/directions, home, education/work, leisure, weather, health, appointments, communication, services, past events, plans, problems, opinions, advice, conditions and social/environmental decisions. Progression includes main-clause order, questions, negation, gender/plural/cases, pronouns, present/separable/modal verbs, prepositions, past tense, comparison, subordinate/relative clauses, polite requests and connected explanations. Lessons and checks use more than one context; completion describes evidence achieved rather than certifying proficiency.

## Playable systems

The same activity types adapt to all three regions. Each run has clear instructions, a visible objective, manipulable items/evidence/routes, feedback for errors, a safe retry and a saved result.

- Café: read or hear an order, assemble the correct tray, handle quantities and substitutions, and follow preparation instructions. Customer outcomes depend on the delivered items.
- Market: build a shopping basket, respect quantities and a budget, compare offers and calculate change. Trading actions change stock/basket/coins.
- Investigation: inspect German witness statements, connect evidence, order events and support a conclusion. Successful reasoning reveals a story discovery.
- Delivery: interpret German route instructions, plan and follow a route, identify the destination and resolve delivery details. World launch points tie parcel missions to the actual region.

German determines actions. A successful action submits its corresponding canonical target to the Go server; the frontend cannot award itself XP or trust a self-reported result. Activity and course rewards are idempotent, require saved evidence and survive refresh. Hints are supported practice. Learners can pause, replay audio and leave without losing already saved learning.

## Integration and game interface

Keep exploration uncluttered: compact objective, contextual action, movement and one menu. Open activities from residents, objects and a game activity board; course topics and the lexicon are game panels. Preserve keyboard and tap controls, at least 44-pixel touch targets, focus containment, readable portrait/landscape layouts, reduced motion and editable text inputs. Avoid drag-only actions and mandatory reaction timers.

Retain the connected three-act lore. Rewards expose earned clues and consequences. Each region has independent multiplayer presence/chat; private learning progress stays server-owned. Add activities without changing travel acknowledgement, reconnect or origin protections. Keep painted character memory bounded and pause/cancel activity work when leaving or closing a panel.

New instructional text uses German audio through the existing audio system with a clearly functioning browser speech fallback when bundled audio is unavailable. No microphone permissions are requested.

## Verification and delivery

Verify data uniqueness, legitimate forms/alternatives, course/server parity, complete playable activity state transitions, wrong-answer/retry behavior, no reward farming, old-profile compatibility, word exposure versus recall evidence, bounded due sessions and region travel. Run frontend checks/build/tests and Go race tests/vet after the independent implementations are integrated.

Use the browser to verify real saves and mobile input at desktop, phone portrait and phone landscape sizes. Save screenshots of the actual game. Refresh the existing production preview served by TryCloudflare and check its API, assets and multiplayer connection. Preserve the user's temporary-hosting choice; do not recreate Cloudflare Pages deployment.

Keep educator validation and unsupported proficiency claims explicit in documentation. Report what was implemented and any concrete remaining source/content limitation honestly.

## Integrated verification — 2026-10-09

The coordinated implementation is complete: 3,283 lexical entries, 405 units, 39 guides, 10,266 canonical course exercises and 48 authored mini-game scenes. Vocabulary, course, activity and server manifests share stable identities. All course German text has packaged pronunciation audio; the audio manifest contains 3,888 clips (37.49 MiB), with synthetic-voice provenance.

The final frontend suite passed 105 tests; TypeScript and production builds passed. Go race tests, vet and 24 API tests passed. All three PostgreSQL 18 integration tests also passed with race detection, including durable paused-mission receipts; the disposable test container was removed. Both web and Go Docker images built successfully using the Compose build configuration.

Real-browser checks verified saved word recognition/listening/production, hidden-answer typing, correct adjectival-noun forms, a completed grammar route, growing rather than immediate retained memory, and saved progress after reload and a Go restart. All four mini-games saved through the real server and preserved pause/leave/resume state. Portrait checks at 390×844 and landscape checks at 844×390 found no horizontal overflow; checked controls met the 44-pixel minimum. Final screenshots are in `docs/screenshots/`.

The temporary public preview serves the final build at https://features-targeted-executed-engineer.trycloudflare.com. Its health API accepts the exact origin; the course bundle is compressed; MP3 assets load; multiplayer reconnects after the server refresh. The original local progress store was preserved. The URL depends on the local preview, Go server and tunnel remaining running.

Reference coverage and exceptions are recorded in [course-coverage.md](course-coverage.md); content licensing is recorded in [course-sources.md](course-sources.md). Educator validation and measured proficiency are still required before making a B1 attainment claim.
