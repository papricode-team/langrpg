import { validateDialogue, type DialogueLine, type QuestGraph } from './dialogue';

export interface StoryRule { questId: string; gateExerciseId: string; choiceIds: string[]; choices: { id: string; effects: unknown[] }[]; investigationObjectIds: string[]; }

/** Prompts that must not be reused across scenes: every scene names its own dilemma. */
const genericChoicePrompts = new Set(['Was möchtest du tun?', 'Wie sollen wir gemeinsam weitergehen?', 'Welche Zusage möchtest du dem Rat geben?']);
/** An NPC may not speak a tutorial instruction; the task lives in the objective chip. */
const metaInstruction = /(^|[.!?]\s+)(Bitte (mich|dich|ihn|sie|die Zeugin)\b|Frag (mich|ihn|sie|ihn bitte)\b|Frag mich\b|Sag (mir|ihm|ihr)\b|Erkläre (dem|den|am)\b|Schlage?\s+(einen|vor)\b|Gib (diesem|dem) (Satz|Wort)\b)|\b(Bitte mich um|Sag mir, dass|Sag ihm, dass|Frag mich (nach|ob)|Frag ihn:|Frag sie:|Sag es mir)\b/;
const informalAddress = /\b(du|dir|dich|dein[esnm]?r?)\b/i;
const formalAddress = /\b(Ihnen|Ihre[mnrs]?|Ihr)\b/;
const questionWord = /^(Wer|Was|Wo|Wohin|Woher|Wann|Warum|Wieso|Wie|Wem|Wen|Welche[rsnm]?|Womit|Wovon|Wozu)\b/;
const order = ['a1-arrival', 'a1-cafe', 'a1-market', 'a1-station', 'a1-workshop', 'a1-lost-parcel', 'a2-apartment', 'a2-evening-plans', 'a2-rail-trip', 'a2-broken-clock', 'a2-clinic', 'a2-archive', 'b1-witness', 'b1-new-route', 'b1-work', 'b1-council', 'b1-storm', 'b1-atlas'];

/** Reveals: the keyword must not appear in any quest earlier than the one named. */
const reveals: { word: RegExp; firstIn: string; label: string }[] = [
  { word: /\bElise\b/, firstIn: 'a1-lost-parcel', label: 'Elise is named (R6)' },
  { word: /Nachfolge/, firstIn: 'a2-archive', label: 'the successor reveal (R12)' },
  { word: /Handschrift/, firstIn: 'a2-broken-clock', label: 'the handwriting (R10)' },
  { word: /Frau Berg/, firstIn: 'a1-market', label: 'Frau Berg (R3)' },
  { word: /17:59/, firstIn: 'a2-rail-trip', label: 'the 17:59 connection (R9)' },
];

function allLines(graph: QuestGraph): { line: DialogueLine; where: string }[] {
  return [
    ...graph.nodes.flatMap(node => node.lines.map(line => ({ line, where: node.id }))),
    ...(graph.topics ?? []).flatMap(topic => topic.lines.map(line => ({ line, where: `topic:${topic.id}` }))),
  ];
}
const textOf = (graph: QuestGraph) => [
  ...allLines(graph).map(item => item.line.german),
  ...graph.investigations.map(item => item.german),
  ...graph.nodes.flatMap(node => (node.choices ?? []).map(choice => choice.german)),
  ...(graph.topics ?? []).map(topic => topic.german),
].join('\n');

export function lintStory(graphs: QuestGraph[], rules: StoryRule[]): string[] {
  const errors: string[] = [];
  const prompts = new Map<string, string>();
  if (graphs.map(graph => graph.questId).join() !== order.join()) errors.push('graphs are not in canonical quest order');
  for (const graph of graphs) {
    const id = graph.questId, lines = allLines(graph), index = order.indexOf(id);
    errors.push(...validateDialogue(graph));
    // Server contract: wording may change, ids, effects and targets may not.
    const rule = rules.find(item => item.questId === id);
    if (!rule) { errors.push(`${id}: no server rule`); continue; }
    if (rule.gateExerciseId !== graph.gateExerciseId) errors.push(`${id}: gate exercise differs from server rule`);
    const choiceNode = graph.nodes.find(node => node.id === 'choice')!;
    if (JSON.stringify(rule.choiceIds) !== JSON.stringify((choiceNode.choices ?? []).map(choice => choice.id))) errors.push(`${id}: choice ids differ from server rule`);
    for (const choice of choiceNode.choices ?? []) {
      const expected = rule.choices.find(item => item.id === choice.id);
      if (expected && JSON.stringify(expected.effects) !== JSON.stringify(choice.effects)) errors.push(`${id}: effects for ${choice.id} differ from server rule`);
    }
    if (JSON.stringify(rule.investigationObjectIds) !== JSON.stringify(graph.investigations.map(item => item.objectId))) errors.push(`${id}: evidence objects differ from server rule`);

    // No tutorial instructions in NPC mouths before the gate.
    for (const { line, where } of lines.filter(item => ['intro', 'gate'].includes(item.where))) if (metaInstruction.test(line.german)) errors.push(`${id}/${line.id}: NPC gives a tutorial instruction (${where}): ${line.german}`);

    // Each scene names its own dilemma.
    const choiceLines = choiceNode.lines;
    const prompt = choiceLines[choiceLines.length - 1];
    if (!prompt.german.trim().endsWith('?')) errors.push(`${id}: choice prompt is not a question`);
    if (genericChoicePrompts.has(prompt.german)) errors.push(`${id}: generic choice prompt "${prompt.german}"`);
    if (prompts.has(prompt.german)) errors.push(`${id}: choice prompt repeated from ${prompts.get(prompt.german)}`);
    prompts.set(prompt.german, id);

    // Variety and depth.
    if (index > 0 && !lines.some(item => item.line.condition)) errors.push(`${id}: no callback to earlier choices (needs a conditional line)`);
    const topics = graph.topics ?? [];
    if (topics.length < 1 || topics.length > 3) errors.push(`${id}: needs 1–3 topics`);
    for (const topic of topics) {
      if (!questionWord.test(topic.german) || !topic.german.trim().endsWith('?')) errors.push(`${id}: topic "${topic.german}" must be a W-question`);
      if (topic.lines.length < 1 || topic.lines.length > 4) errors.push(`${id}: topic ${topic.id} needs 1–4 lines`);
    }
    if (graph.nodes.reduce((sum, node) => sum + node.lines.length, 0) < 12) errors.push(`${id}: scene is too thin (fewer than 12 lines)`);
    const maxWords = graph.level === 'A1' ? 16 : 19;
    for (const { line } of lines) if (line.german.split(/\s+/).length > maxWords) errors.push(`${id}/${line.id}: over ${maxWords} words`);

    // Address: Voss says Sie until the confession; residents never say Sie to the player.
    for (const { line } of lines) {
      if (line.speaker === 'inspector' && index < order.indexOf('b1-work') && informalAddress.test(line.german)) errors.push(`${id}/${line.id}: Voss must use Sie before his confession`);
      if (!['inspector', 'ada'].includes(line.speaker) && line.speaker !== 'elise' && formalAddress.test(line.german.replace(/^Ihre\b/, '')) && !/\b(Ihr|Ihre|Ihnen)\b.*\bVoss\b/.test(line.german)) errors.push(`${id}/${line.id}: residents say du, not Sie: ${line.german}`);
    }

    // Reveals appear no earlier than their row of the reveal map.
    const text = textOf(graph);
    for (const reveal of reveals) if (index < order.indexOf(reveal.firstIn) && reveal.word.test(text)) errors.push(`${id}: mentions ${reveal.label} before ${reveal.firstIn}`);
    if (index < order.indexOf('a2-archive') && lines.some(item => item.line.speaker === 'ada') && id !== 'a2-archive') errors.push(`${id}: Ada speaks before her archive scene`);
  }
  const finale = textOf(graphs[graphs.length - 1]);
  for (const needle of ['Wasserkocher', 'Schlüssel', '{name}', 'meinen ersten Fehler']) if (!finale.includes(needle)) errors.push(`b1-atlas: finale must pay off "${needle}"`);
  return errors;
}
