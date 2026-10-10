import type { CourseGrammar } from './course';

export interface ContextualGrammar {
  guideId: string; german: string; english: string; clipId: string;
  title?: string; explanation?: string;
}
const notes: Record<string, Omit<ContextualGrammar, 'clipId'>> = {
  'a1-arrival': { guideId:'a1-requests', german:'Mit Sie ist deine Bitte höflich. Das Verb steht zuerst: Helfen Sie.', english:'With Sie your request is polite. Put the verb first: Helfen Sie.' },
  'a1-cafe': { guideId:'a1-modal', german:'Mit ich möchte bestellst du höflich. Der Kaffee wird einen Kaffee.', english:'Use ich möchte to order politely. Der Kaffee becomes einen Kaffee.' },
  'a1-market': { guideId:'a1-accusative', german:'Nach ich brauche kommt die Menge: zwei Äpfel. Ein Apfel wird einen Apfel.', english:'After ich brauche comes the amount: zwei Äpfel. Ein Apfel becomes einen Apfel.' },
  'a1-station': { guideId:'a1-questions', german:'Fragst du mit ja oder nein? Dann steht das Verb zuerst: Ist dieser Platz frei?', english:'For a yes-or-no question, put the verb first: Ist dieser Platz frei?' },
  'a1-workshop': { guideId:'a1-nouns', german:'Die Lampe ist weiblich. Darum sagst du eine Lampe. Das Wort bleibt eine.', english:'Lampe is feminine, so say eine Lampe. The article stays eine here.' },
  'a1-lost-parcel': { guideId:'a1-questions', german:'Wie fragt nach der Adresse. Nach wie kommt das Verb: Wie ist die Adresse?', english:'Wie asks for the address. After wie comes the verb: Wie ist die Adresse?' },
  'a2-apartment': { guideId:'a2-polite-could', german:'Könnten Sie macht eine Bitte höflich. Die Handlung steht am Ende: reparieren.', english:'Könnten Sie makes a request polite. The action, reparieren, goes at the end.' },
  'a2-evening-plans': { guideId:'a1-time', german:'Morgen heißt hier der nächste Tag. Bei einer Frage beginnt der Satz mit hast.', english:'Morgen means the next day here. In this question, the sentence begins with hast.' },
  'a2-rail-trip': { guideId:'a2-perfect', german:'Du erzählst, was passiert ist: habe steht vorne, verpasst am Ende.', english:'You report what happened: habe comes near the start and verpasst at the end.' },
  'a2-broken-clock': { guideId:'a2-object-pronouns', german:'Mir sagt, wer die Erklärung bekommt. Die Anleitung sagt, was erklärt wird.', english:'Mir tells us who receives the explanation. Die Anleitung tells us what is explained.' },
  'a2-clinic': { guideId:'a2-polite-could', german:'Sollten ist ein freundlicher Rat. Sich ausruhen steht am Ende des Satzes.', english:'Sollten gives friendly advice. Sich ausruhen goes at the end of the sentence.' },
  'a2-archive': { guideId:'a2-object-pronouns', german:'Mir zeigt, wem du etwas erklärst. Das Verb erklären bleibt am Ende.', english:'Mir shows whom you explain something to. The verb erklären stays at the end.' },
  'b1-witness': { guideId:'b1-indirect-questions', german:'Nach beschreiben folgt eine indirekte Frage. In was Sie gesehen haben steht haben am Ende.', english:'After beschreiben comes an indirect question. In was Sie gesehen haben, haben goes at the end.' },
  'b1-new-route': { guideId:'b1-relative', german:'Die bezieht sich auf die Lösung. Im Relativsatz steht passt am Ende.', english:'Die refers to die Lösung. In the relative clause, passt goes at the end.' },
  'b1-work': { guideId:'b1-duration', german:'Bevor verbindet die Schritte. Der Nebensatz endet mit anfange, danach kommt möchte.', english:'Bevor connects the steps. The subordinate clause ends in anfange; möchte starts the main clause.' },
  'b1-council': { guideId:'b1-hypothetical', german:'Wäre schlägt eine Möglichkeit vor. Nach dem Komma erklärt der Infinitiv, was der Kompromiss wäre.', english:'Wäre proposes a possibility. After the comma, the infinitive explains what the compromise would be.' },
  'b1-storm': { guideId:'b1-argument-links', german:'Nur gemeinsam betont die Bedingung. Mit können steht lösen am Ende.', english:'Nur gemeinsam stresses the condition. With können, lösen goes at the end.' },
  'b1-atlas': { guideId:'a2-because', german:'Dass führt die gemeinsame Zusage ein. Besprechen steht am Ende dieses Nebensatzes.', english:'Dass introduces the shared promise. Besprechen goes at the end of this subordinate clause.' },
};

export function grammarForQuest(questId: string, guides?: readonly CourseGrammar[]): ContextualGrammar | undefined {
  const note = notes[questId]; if (!note) return;
  const guide = guides?.find(guide => guide.id === note.guideId);
  return {...note, clipId:`grammar-${questId}`, title:guide?.title, explanation:guide?.explanation};
}
