#!/usr/bin/env node
/** Explicit painted noun identities; abstract story motifs stay paired with their authored text. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// A subject is a visual disambiguation, never a translation rendered in the art.
const groups = [
  ['food', [
    ['apfel','one red apple with a green leaf'], ['tomate','one ripe red tomato with star-shaped green calyx'], ['brot','one brown crusty loaf of bread'], ['broetchen','one small round bread roll'],
    ['kaffee','white porcelain cup filled with dark black coffee'], ['tee','clear glass cup of amber tea with a tea bag string'], ['wasser','clear drinking glass filled with still water'], ['milch','clear bottle filled with white milk'],
    ['banane','one curved yellow banana'], ['birne','one green pear'], ['kartoffel','one brown unpeeled potato'], ['salat','white bowl of green leafy salad'],
    ['fisch','one whole silver fish lying on a plain small plate'], ['kuchen','one slice of simple yellow sponge cake'], ['bier','foamy amber beer in a tankard'], ['wein','red wine in a stemmed wine glass'],
  ]],
  ['pantry', [
    ['saft','clear glass of orange fruit juice'], ['reis','small bowl filled with white cooked rice'], ['butter','one rectangular pat of pale yellow butter on a small dish'], ['salz','small salt shaker with visible white grains'],
    ['zucker','small bowl of white sugar cubes'], ['kaese','one yellow cheese wedge with holes'], ['wurst','one curved reddish sausage'], ['haehnchen','one whole golden roast chicken'],
    ['schokolade','one brown segmented chocolate bar partly unwrapped'], ['zitrone','one yellow lemon'], ['orange','one round orange fruit with a green leaf'], ['ei','one plain white egg'],
    ['suppe','one bowl of orange vegetable soup with a spoon'], ['pizza','one whole round tomato and cheese pizza'], ['eis','two scoops of ice cream in a cone'], ['bohne','three green bean pods'],
  ]],
  ['kitchen', [
    ['tasse','one empty white porcelain cup with a handle'], ['glas','one empty clear drinking glass'], ['flasche','one empty green glass bottle'], ['teller','one empty white dinner plate'],
    ['gabel','one silver dinner fork'], ['messer','one silver table knife'], ['loeffel','one silver soup spoon'], ['topf','one brass cooking pot with two handles and a lid'],
    ['herd','one compact old-fashioned cooker with burners and oven'], ['kuehlschrank','one closed cream refrigerator'], ['speisekarte','one open restaurant menu with illegible ink strokes'], ['rechnung','one narrow restaurant bill with illegible printed ink strokes'],
    ['obst','small bowl of mixed fresh apple pear and banana fruit'], ['gemuese','small basket containing carrots leafy greens and cucumber'], ['fruehstueck','breakfast plate with bread roll egg butter and coffee'], ['mineralwasser','green sealed bottle of sparkling water with bubbles'],
  ]],
  ['furniture', [
    ['tisch','one plain round wooden table with no objects'], ['stuhl','one upright wooden chair with a green cushion'], ['sofa','one small green upholstered sofa'], ['bett','one single wooden bed with white blanket and pillow'],
    ['schrank','one wooden wardrobe with two closed doors'], ['lampe','one brass desk lamp with a green shade'], ['tuer','one freestanding wooden door in its frame'], ['fenster','one wooden window frame with clear glass'],
    ['bild','one framed painted landscape picture'], ['handtuch','one folded cream towel'], ['seife','one ivory bar of soap'], ['dusche','one shower head spraying water over a small shower tray'],
    ['toilette','one white toilet with closed lid'], ['heizung','one white cast iron radiator'], ['balkon','one small wrought iron balcony with its stone floor'], ['fahrkarte','one cream railway fare ticket with a red punched corner and illegible ink'],
  ]],
  ['clothing', [
    ['schuh','one brown leather shoe'], ['jacke','one short green jacket'], ['mantel','one long brown overcoat'], ['hemd','one pale blue collared shirt'],
    ['hose','one pair of brown trousers'], ['kleid','one red dress'], ['rock','one blue knee-length skirt'], ['t-shirt','one plain cream short-sleeve T-shirt'],
    ['pullover','one knitted mustard pullover'], ['muetze','one green knitted cap'], ['schal','one striped wool scarf'], ['stiefel','one brown leather boot'],
    ['jeans','one pair of blue denim jeans'], ['anzug','one charcoal suit jacket and matching trousers'], ['bluse','one cream blouse'], ['brille','one pair of round brass eyeglasses'],
  ]],
  ['station', [
    ['zug','one small vintage green passenger train engine'], ['bus','one cream and green city bus'], ['auto','one compact green car'], ['fahrrad','one black bicycle with basket'],
    ['flugzeug','one small silver passenger airplane'], ['schiff','one small red and cream ferry boat'], ['taxi','one cream taxi with a small blank roof sign'], ['lkw','one blue delivery truck'],
    ['koffer','one brown leather suitcase'], ['rucksack','one green canvas backpack'], ['ticket','one rectangular cream travel ticket with blue stripe and illegible ink'], ['pass','one closed burgundy passport booklet with small brass emblem'],
    ['fahrplan','one standing brass timetable board with rows of illegible ink'], ['gleis','one short piece of railway track with two rails and sleepers'], ['ampel','one freestanding traffic light showing red amber and green lamps'], ['reifen','one black rubber car tyre'],
  ]],
  ['post', [
    ['brief','one folded cream handwritten letter with illegible ink'], ['umschlag','one sealed cream envelope'], ['briefmarke','one postage stamp with a small bird portrait'], ['paket','one brown parcel tied with string'],
    ['postkarte','one picture postcard showing a harbour and a blank writing area'], ['papier','one blank cream paper sheet'], ['buch','one closed green leather book'], ['zeitung','one folded newspaper with illegible columns'],
    ['heft','one blue paper exercise notebook'], ['bleistift','one yellow wooden pencil'], ['kugelschreiber','one blue ballpoint pen'], ['schere','one pair of brass-handled scissors'],
    ['schluessel','one old brass door key'], ['geldboerse','one brown leather wallet'], ['kreditkarte','one blank blue bank card with small gold chip'], ['ausweis','one cream identity card with a small anonymous portrait and illegible marks'],
  ]],
  ['devices', [
    ['telefon','one black rotary telephone'], ['handy','one compact mobile phone with a dark blank screen'], ['computer','one desktop computer monitor with keyboard'], ['laptop','one open laptop with a dark blank screen'],
    ['kamera','one black camera with a round lens'], ['radio','one wood-cased radio'], ['drucker','one compact printer with a blank paper sheet'], ['fernsehen','one old television set with a dark screen'],
    ['uhr','one round brass wall clock with clearly visible clock hands'], ['kalender','one paper desk calendar with blank grid'], ['zahnrad','one brass cogwheel'], ['seil','one coil of thick brown rope'],
    ['glocke','one polished brass bell'], ['laterne','one small brass lantern with a warm flame'], ['bahnsteig','one small railway station platform strip with bench and blank platform sign'], ['geld','one small pile of brass coins beside two folded banknotes'],
  ]],
  ['garden', [
    ['blume','one white daisy flower with stem and leaves'], ['rose','one red rose with green stem'], ['pflanze','one leafy green plant in a terracotta pot'], ['baum','one full leafy green tree with visible trunk'],
    ['blatt','one green leaf'], ['sonne','one golden sun disk with soft rays'], ['wolke','one soft grey cloud'], ['regen','one grey cloud with falling blue raindrops'],
    ['schnee','one small snow-covered fir tree and a drift of white snow'], ['gewitter','one dark storm cloud with a yellow lightning bolt'], ['berg','one rocky mountain with snow peak'], ['fluss','one winding blue river strip with two grassy banks'],
    ['see','one small blue lake with grassy rim'], ['insel','one small green island surrounded by blue water'], ['bruecke','one short wooden bridge'], ['brunnen','one round stone fountain with flowing water'],
  ]],
  ['animals', [
    ['hund','one friendly brown dog sitting'], ['katze','one grey cat sitting'], ['pferd','one brown horse standing'], ['schwein','one pink pig standing'],
    ['vogel','one small brown sparrow perched'], ['rind','one brown and white cow standing'], ['ball','one plain red rubber ball'], ['fussball','one black and white football'],
    ['gitarre','one wooden acoustic guitar'], ['klavier','one upright brown piano'], ['zelt','one small green camping tent'], ['geschenk','one wrapped cream gift box tied with red ribbon'],
    ['ring','one gold finger ring'], ['kette','one gold necklace'], ['tasche','one green canvas shoulder bag'], ['foto','one small sepia photograph showing a harbour in a paper frame'],
  ]],
  ['body', [
    ['hand','one open human hand'], ['arm','one bent human arm from shoulder to fingertips'], ['bein','one human leg from thigh to ankle'], ['fuss','one bare human foot'],
    ['kopf','one anonymous human head in three quarter view'], ['auge','one human eye close-up'], ['ohr','one human ear close-up'], ['mund','one human mouth with lips'],
    ['zahn','one white tooth'], ['hals','one anonymous neck and shoulders'], ['ruecken','one anonymous human upper back'], ['bauch','one anonymous clothed human torso with a hand over the abdomen'],
    ['medikament','one small amber medicine bottle with an unlabelled white label'], ['tablette','one round white medicine tablet beside a small blister strip'], ['parfuem','one small clear perfume bottle with brass atomizer'], ['creme','one small open cream jar'],
  ]],
  ['extras', [
    ['torte','one layered cream cake with a red berry on top'], ['suessigkeit','one wrapped pink sweet'], ['stadtplan','one folded street map with illegible ink streets'], ['mehrwegbecher','one green reusable coffee travel cup with dark lid'],
  ]],
];

export const gamePropFrames = [
  ['prop-stamp','one brass rubber approval stamp with wooden handle'], ['prop-bin','one green open sorting bin'], ['prop-chute','one brass-rimmed parcel chute'], ['prop-lantern-off','one brass lantern with dark glass and no flame'],
  ['prop-lantern-lit','one brass lantern with a warm yellow flame'], ['prop-lantern-flare','one brass lantern with a bright golden flame and a small radiant flare'], ['prop-tray','one empty oval silver serving tray'], ['prop-bell','one small brass desk service bell'],
  ['prop-coins','one small pile of copper and brass coins'], ['prop-crate','one small empty wooden produce crate'], ['prop-tape-reel','one brass reel to reel tape spool'], ['prop-quill','one white feather quill beside a small dark ink pot'],
].map(([name,subject]) => ({name,subject,kind:'prop'}));

export const gameMotionFrames = [
  ['prop-lamp-walk-0','one quirky brass desk lamp with two short articulated brass legs, side view, left leg forward and right leg back'],
  ['prop-lamp-walk-1','the same quirky brass walking desk lamp, side view, legs together beneath its body'],
  ['prop-lamp-walk-2','the same quirky brass walking desk lamp, side view, right leg forward and left leg back'],
  ['prop-lamp-walk-3','the same quirky brass walking desk lamp, side view, both legs bent in a small jaunty step'],
  ['prop-flap-0','one brass-framed station flip-board cell, blank dark green face fully closed, front view'],
  ['prop-flap-1','the same brass-framed station flip-board cell, dark green upper flap tilted outward by twenty degrees'],
  ['prop-flap-2','the same brass-framed station flip-board cell, dark green upper flap tilted outward by forty degrees'],
  ['prop-flap-3','the same brass-framed station flip-board cell, dark green upper flap tilted outward by sixty degrees'],
  ['prop-flap-4','the same brass-framed station flip-board cell, dark green upper flap horizontal at ninety degrees'],
  ['prop-flap-5','the same brass-framed station flip-board cell, upper flap rotating downward past horizontal'],
  ['prop-flap-6','the same brass-framed station flip-board cell, upper flap almost against lower dark green half'],
  ['prop-flap-7','the same brass-framed station flip-board cell, upper flap completing its rotation downward'],
  ['prop-flap-8','the same brass-framed station flip-board cell, blank dark green face closed again after its flip'],
  ['prop-lever-red','one red-handled brass lever on a small square brass base'],
  ['prop-connection-blue','one blue electrical plug and socket connector joined by a short blue wire'],
].map(([name,subject])=>({name,subject,kind:'prop'}));

// Story motifs include abstract nouns; they accompany the German sentence, never replace its meaning.
export const storyItemSubjects = [
  ['karte','one folded cream map card showing painted paths without text'],
  ['adresse','one cream addressed envelope with a small house emblem and illegible ink'],
  ['bahnhof','one miniature warm sandstone railway station with a green roof'],
  ['reparatur','one broken brass cog beside a small wrench, repair motif'],
  ['anschluss','two connected brass railway track sections, connection motif'],
  ['fieber','one glass medical thermometer beside a folded cloth, fever motif'],
  ['rad','one red painted wooden wheel with brass hub'],
  ['erinnerung','one open small wooden keepsake box holding a sepia photograph, memory motif'],
  ['zeichen','one carved wooden sign bearing a simple painted golden sun symbol, no letters'],
  ['patient','one seated fully clothed adult patient with cream blanket, miniature painted figure'],
  ['linie','one coil of red cord laid out as a single straight line across cream paper'],
  ['werkzeug','one small open wooden toolbox with hammer and wrench'],
  ['tuete','one upright plain brown paper bag'],
  ['reihenfolge','three wooden beads of increasing size on a cord, sequence motif'],
  ['anleitung','one open cream instruction booklet showing simple lamp assembly pictures without text'],
  ['rat','one miniature semicircle of seven wooden council chairs'],
  ['bericht','one cream report folio with illegible ink and a brass paper clip'],
  ['muehle','one miniature warm sandstone watermill with wooden wheel'],
];
export const feedbackFrames = [
  ['prop-correct-seal','one forest green wax seal embossed with a golden linden leaf, approval motif, no check mark'],
  ['prop-miss-seal','one muted terracotta wax seal with a gently dented centre and small fallen leaf, retry motif, no cross'],
  ['prop-listening-horn','one small brass gramophone horn on a wooden base'],
  ['prop-placeholder','one closed cream linen drawstring pouch with a small brass sun clasp'],
].map(([name,subject])=>({name,subject,kind:'prop'}));

export async function createItemArtPlan(root = projectRoot) {
  const lexicon = JSON.parse(await readFile(resolve(root,'web/src/data/course-meta.json'),'utf8')).lexicon;
  const byId = new Map(lexicon.map(word=>[word.id,word]));
  const nouns = groups.flatMap(([topic,rows]) => rows.map(([id,subject]) => {
    const lexemeId = `${id}-noun`, word = byId.get(lexemeId);
    if (!word || word.pos!=='noun' || !['A1','A2'].includes(word.level)) throw new Error(`Concrete item is absent from A1/A2 course: ${lexemeId}`);
    return {name:`item-${lexemeId}`,lexemeId,lemma:word.lemma,article:word.article,plural:word.plural,level:word.level,topic:word.topic,domain:topic,subject,kind:'noun'};
  }));
  if (new Set(nouns.map(row=>row.lexemeId)).size !== nouns.length) throw new Error('Duplicate item noun');
  const meat=byId.get('fleisch-noun');
  const supplement=[{name:'item-fleisch-noun',lexemeId:meat.id,lemma:meat.lemma,article:meat.article,level:meat.level,topic:meat.topic,domain:'food',subject:'one thick raw red cut of meat with a white fat edge, lying on a plain small plate',kind:'noun'},...gameMotionFrames];
  const storyNouns = storyItemSubjects.map(([id,subject]) => {
    const word=byId.get(`${id}-noun`);
    if(!word || word.pos!=='noun')throw Error(`Missing story noun: ${id}`);
    return {name:`item-${word.id}`,lexemeId:word.id,lemma:word.lemma,article:word.article,plural:word.plural,level:word.level,topic:word.topic,domain:'story',subject,kind:'noun',pictureable:!['adresse','reparatur','anschluss','fieber','erinnerung','zeichen','linie','reihenfolge','rat','bericht'].includes(id)};
  });
  const frames = [...nouns,...gamePropFrames,...supplement,...storyNouns.slice(0,12),...feedbackFrames,...storyNouns.slice(12)];
  const sheets=[];
  for(let index=0;index<frames.length;index+=16){
    const rows=frames.slice(index,index+16), id=`items-${String(sheets.length+1).padStart(2,'0')}`;
    const prompt = `Use case: stylized-concept\nAsset type: transparent painterly game item sprite sheet\nPrimary request: Paint ${rows.length} distinct isolated object sprites for glotworld near-isometric RPG in an exact 4 by 4 regular grid. Canvas 2048 by 2048 pixels. Each cell is 512 by 512 pixels; one named subject per cell, read left to right then top to bottom.\nStyle/medium: detailed hand-painted storybook gouache and oil, softly textured materials, warm brass, cream ceramics, muted forest green, matching the existing café and supermarket interior object sheets. Three-quarter view, consistent top-left warm lighting.\nScene/backdrop: genuinely transparent alpha, no painted backdrop.\nComposition: one complete object centred in each cell, maximum object extent 380 pixels, generous transparent margins of at least 60 pixels, no overlap between cells, no cast shadows outside the object. Keep small details legible at 128 pixels.\nSubjects in row-major order:\n${rows.map((row,i)=>`${i+1}. ${row.subject}`).join('\n')}\nConstraints: exactly ${rows.length} objects, correct subject ordering, no labels, no legible text, no grid lines, no watermark, no emoji, no vector line icons. Transparent background; retain native alpha. Each silhouette must be identifiable without a written label.`;
    sheets.push({id,columns:4,rows:4,frames:rows,prompt});
  }
  return {version:1,nounCount:nouns.length+1+storyNouns.length,propCount:gamePropFrames.length+gameMotionFrames.length+feedbackFrames.length,styleReferences:['art/source/interiors/interior-cafe-objects.png','art/source/interiors/interior-supermarket-objects.png'],sheets};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const plan=await createItemArtPlan();
  await mkdir(resolve(projectRoot,'docs/prompts/minigames'),{recursive:true});
  await writeFile(resolve(projectRoot,'art/source/minigames/plan.json'),`${JSON.stringify(plan,null,2)}\n`);
  for(const sheet of plan.sheets) await writeFile(resolve(projectRoot,`docs/prompts/minigames/${sheet.id}.txt`),`${sheet.prompt}\n`);
  console.log(`${plan.nounCount} concrete A1/A2 nouns and ${plan.propCount} game props planned in ${plan.sheets.length} transparent sheets.`);
}
