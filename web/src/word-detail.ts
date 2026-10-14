import type { CourseLexeme } from './course';
import { baseLanguage, hasLexemeMeaning, lexemeMeaning, localizedLexemeForm, supportLang, type BaseLanguage } from './i18n';
import { escapeHtml as e, icon } from './icons';
import type { InteriorObjectSpec } from './interiors';
import { interiorConversationFor, interiorLineNarrative, type InteriorConversationLine } from './interior-conversations';
import { renderNarrative, type Narrative } from './sentence-translations';

export interface WordDetailModel {
  id: string;
  article: string;
  lemma: string;
  meaning: string;
  meaningLang?: BaseLanguage;
  plural?: string;
  forms?: readonly string[];
  example?: Narrative;
  details?: readonly { label: string; value: string | number }[];
  practice?: { kind: 'word' | 'interior' | 'phrase'; id: string };
}
export interface CourseWordDetailExtras {
  example?: Narrative;
  /** Memory evidence is supplied by the caller so this view cannot change learning state. */
  details?: readonly { label: string; value: string | number }[];
}

const copy = (english: string, turkish: string): string => baseLanguage() === 'tr' ? turkish : english;
const hasValue = (value: string | number | undefined): boolean => value !== undefined && value !== 0 && !/^(?:\s*|—|-|0)$/.test(String(value).trim());

const interiorMeanings: Readonly<Record<string, string>> = {
  Kaffee: 'kahve', Milch: 'süt', Zucker: 'şeker', Tee: 'çay', Wasser: 'su', Tasse: 'fincan',
  Kuchen: 'kek', Croissant: 'kruvasan', Speisekarte: 'menü', Tisch: 'masa', Rechnung: 'hesap', Trinkgeld: 'bahşiş',
  Brot: 'ekmek', Brötchen: 'küçük ekmek', Brezel: 'brezel', Backofen: 'fırın', Teig: 'hamur', Mehl: 'un',
  Gebäck: 'hamur işi', Keks: 'kurabiye', Schnecke: 'spiral çörek', Theke: 'tezgâh', Karte: 'kart', Tüte: 'poşet',
  Apfel: 'elma', Kartoffel: 'patates', Tomate: 'domates', Reis: 'pirinç', Nudel: 'makarna', Waage: 'terazi',
  Kilo: 'kilo', Preis: 'fiyat', Kasse: 'kasa', Korb: 'sepet', Kassenbon: 'fiş', Zimmer: 'oda',
  Bett: 'yatak', Lampe: 'lamba', Brief: 'mektup',
};

const extraInteriorExamples: Readonly<Record<string, [string, string, string]>> = {
  Theke: ['Die Tüte liegt auf der Theke.', 'The bag is on the counter.', 'Poşet tezgâhın üzerinde.'],
  Kasse: ['Ich bezahle an der Kasse.', 'I pay at the checkout.', 'Kasada ödüyorum.'],
  Bett: ['Das Bett ist bereit.', 'The bed is ready.', 'Yatak hazır.'],
  Lampe: ['Die Lampe steht auf dem Tisch.', 'The lamp is on the table.', 'Lamba masanın üzerinde.'],
  Brief: ['Der Brief liegt auf dem Schreibtisch.', 'The letter is on the desk.', 'Mektup çalışma masasının üzerinde.'],
};

export function courseWordDetail(word: CourseLexeme, extras: CourseWordDetailExtras = {}): WordDetailModel {
  return {
    id: word.id, article: word.article ?? '', lemma: word.article ? word.articleForm ?? word.lemma : word.lemma,
    meaning: lexemeMeaning(word), meaningLang: hasLexemeMeaning(word) ? supportLang() : 'en', plural: word.plural, forms: word.forms?.map(localizedLexemeForm),
    example: extras.example, details: extras.details, practice: { kind: 'word', id: word.id },
  };
}

/** Interior facts stay tied to their authored sense, even when an unrelated course sense exists. */
export function interiorWordDetail(object: InteriorObjectSpec, index: number, lexeme?: CourseLexeme): WordDetailModel | undefined {
  const word = object.vocabulary[index];
  if (!word) return undefined;
  const conversation = interiorConversationFor(object.id);
  const lines = conversation ? Object.values(conversation.nodes).flatMap(node => [node.line, ...node.choices.map(choice => choice.line)]) : [];
  const forms = new Set([word.lemma, ...(word.plural.match(/\p{L}+/gu) ?? []).filter(token => token !== 'die')].map(form => form.toLocaleLowerCase('de')));
  const example = lines.find(line => (line.german.match(/\p{L}+/gu) ?? []).some(token => forms.has(token.toLocaleLowerCase('de'))));
  const extra = extraInteriorExamples[word.lemma] as [string, string, string] | InteriorConversationLine | undefined;
  return {
    id: `${object.id}:${index}`, article: word.article, lemma: word.lemma,
    meaning: baseLanguage() === 'tr' ? interiorMeanings[word.lemma] ?? word.english : word.english,
    meaningLang: baseLanguage() === 'tr' && !interiorMeanings[word.lemma] ? 'en' : supportLang(),
    plural: word.plural, forms: lexeme?.forms?.map(localizedLexemeForm),
    example: example ? interiorLineNarrative(example) : extra ? interiorLineNarrative(Array.isArray(extra) ? { german: extra[0], english: extra[1], turkish: extra[2] } : extra) : undefined,
    practice: lexeme ? { kind: 'word', id: lexeme.id } : { kind: 'interior', id: object.id },
  };
}

/** A single detail surface is a side pane on desktop and a full-width sheet on phones. */
export function renderWordDetail(word: WordDetailModel, options: { backAction?: string } = {}): string {
  const spoken = [word.article, word.lemma].filter(Boolean).join(' ');
  const comparable = (value: string) => value.trim().replace(/[.!?]+$/, '').toLocaleLowerCase('de');
  const example = word.example?.filter(sentence => sentence.german.trim() && comparable(sentence.german) !== comparable(spoken));
  const forms = word.forms?.filter(hasValue);
  const rows = [
    ...(hasValue(word.plural) ? [{ label: copy('Plural', 'Çoğul'), value: word.plural! }] : []),
    ...(forms?.length ? [{ label: copy('Forms', 'Biçimler'), value: forms.join(' · ') }] : []),
    ...(word.details ?? []).filter(detail => hasValue(detail.value)),
  ];
  const practiceAttribute = word.practice?.kind === 'word' ? 'data-word-practice'
    : word.practice?.kind === 'interior' ? 'data-practice-interior' : 'data-practice-phrase';
  return `<section class="word-detail" data-word-detail="${e(word.id)}"><header class="word-detail-heading"><div><h2 lang="de">${e(spoken)}</h2><p lang="${word.meaningLang ?? supportLang()}">${e(word.meaning)}</p></div><button class="icon-button" data-speak="${e(spoken)}" aria-label="${e(copy('Listen', 'Dinle'))}">${icon('volume')}</button></header>${rows.length ? `<dl class="word-detail-facts">${rows.map(row => `<div><dt>${e(row.label)}</dt><dd>${e(row.value)}</dd></div>`).join('')}</dl>` : ''}${example?.length ? `<blockquote class="word-detail-example">${renderNarrative(example)}<button class="icon-button" data-speak="${e(example.map(sentence => sentence.german).join(' '))}" aria-label="${e(copy('Listen to the example', 'Örneği dinle'))}">${icon('volume')}</button></blockquote>` : ''}<div class="word-detail-actions">${word.practice ? `<button class="primary-button" ${practiceAttribute}="${e(word.practice.id)}">${icon('leaf')} ${e(copy('Practise this word', 'Bu sözcüğü çalış'))}</button>` : ''}<button class="text-button word-detail-close" data-word-detail-back="${e(options.backAction ?? 'close')}">${e(copy('Back', 'Geri'))}</button></div></section>`;
}
