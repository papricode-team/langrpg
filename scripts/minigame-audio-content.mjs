/** Spoken set-piece instructions and expedition briefs; word audio stays word-<id>. */
import './register-content-loader.mjs';
import {readFile} from 'node:fs/promises';

export async function minigameAudioJobs(){
  const lines=[
    ['tray-coffee','Einen Kaffee, bitte.'],['tray-tea-bread','Einen Tee und zwei Brote, bitte.'],['tray-water','Ein Wasser, bitte.'],['tray-milk','Eine Milch, bitte.'],
    ['tray-coffee-bread','Zwei Kaffee und ein Brot, bitte.'],['tray-takeaway','Einen Tee zum Mitnehmen, bitte.'],['tray-without-milk','Einen Kaffee ohne Milch, bitte.'],['tray-with-milk','Einen Kaffee mit Milch, bitte.'],
    ['departure-two','Der Zug fährt um siebzehn Uhr von Gleis zwei.'],['departure-seven','Der Zug nach Waldruh fährt um achtzehn Uhr von Gleis sieben.'],['departure-delay','Der Zug hat zehn Minuten Verspätung.'],['departure-connection','Der Anschlusszug fährt um achtzehn Uhr.'],
    ['workbench-first','Zuerst das rote Zahnrad, dann die blaue Lampe.'],['workbench-lamp','Setze die Lampe auf den Tisch.'],['workbench-key','Nimm zuerst den Schlüssel.'],['workbench-sequence','Zuerst das Zahnrad, dann die Glocke und schließlich die Lampe.'],
    ['connection-arrival','Dein Zug kommt um siebzehn Uhr neunundfünfzig an.'],['connection-eighteen','Der Anschluss fährt um achtzehn Uhr von Gleis sieben.'],['connection-later','Der nächste Zug fährt um achtzehn Uhr fünfzehn.'],
    ['forecast-sun','Morgen scheint die Sonne.'],['forecast-rain','Morgen regnet es.'],['forecast-snow','Am Montag schneit es.'],['forecast-cloud','Am Dienstag ist es bewölkt.'],
    ['sort-articles','Sortiere nach dem Artikel: der, die oder das.'],['sort-alphabet','Ordne die Wörter alphabetisch.'],['delivery-left','Geh nach links.'],['delivery-right','Geh nach rechts.'],['delivery-forward','Geh geradeaus.'],
  ].map(([id,text])=>({id:`minigame-${id}`,text}));
  const {expeditionGames}=await import('../web/src/expedition-games.ts');
  for(const game of expeditionGames)for(const [level,text]of Object.entries(game.german))lines.push({id:`expedition-${game.id}-brief-${level.toLowerCase()}`,text});
  const story=JSON.parse(await readFile(new URL('../web/src/minigames/story-scripts.json',import.meta.url),'utf8'));
  for(const clip of story.audio)lines.push({id:clip.id,text:clip.text});
  const {expeditionRegions}=await import('../web/src/expeditions.ts');
  for(const region of expeditionRegions)for(const encounter of region.encounters)lines.push({id:`expedition-${encounter.id}`,text:encounter.german});
  return lines;
}
