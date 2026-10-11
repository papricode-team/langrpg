import { vocabulary } from './content';

/** Fallback glosses before the course lexicon loads: function words and story nouns. */
export const baseStoryGlossary: Readonly<Record<string, string>> = {
  ich:'I', du:'you', wir:'we', sie:'she / they / formal you', ihr:'her / their / you (plural)',
  der:'the (masculine)', die:'the (feminine / plural)', das:'the (neuter)', den:'the (accusative masculine)',
  ein:'a / one', eine:'a / one', einen:'a (accusative masculine)', ist:'is', sind:'are', hat:'has', haben:'have',
  bitte:'please', hilfe:'help', helfen:'to help', namen:'names', name:'name', adresse:'address', adressen:'addresses',
  fahrkarte:'ticket', zug:'train', bahnsteig:'platform', stadt:'town', städte:'towns', brief:'letter',
  lampe:'lamp', laterne:'lantern', glocke:'bell', siegel:'seal', schlüssel:'key', beweise:'evidence',
  heute:'today', morgen:'tomorrow / morning', gestern:'yesterday', zuerst:'first', dann:'then',
  hier:'here', dort:'there', noch:'still / yet', wieder:'again', gemeinsam:'together',
  fragen:'to ask', prüfen:'to check', öffnen:'to open', geschlossen:'closed', verloren:'lost',
  vergessen:'forgotten / to forget', auslöschen:'to erase', vertrauen:'trust', versprechen:'promise',
  amt:'office', messingamt:'Brass Office', rat:'council', kreis:'circle', stimmen:'voices',
  unterschrift:'signature', nachfolge:'succession / successor', bewohner:'residents',
  verbindung:'connection', strecke:'route', garten:'garden', sturm:'storm', zeugin:'witness',
};
/** Story-quest expressions add their own meanings (localized through the exercise overlay). */
export const storyGlossary: Record<string, string> = { ...baseStoryGlossary };
for (const word of vocabulary) storyGlossary[word.german.replace(/^(der|die|das) /, '').toLocaleLowerCase('de')] ??= word.english;
