import { baseLanguage } from './i18n';
import { escapeHtml as e, icon } from './icons';
import { renderNarrative, type TranslatedSentence } from './sentence-translations';

/** Authored, ungraded dialogue. Reading these lines does not earn a practice receipt. */
export interface InteriorConversationLine {
  sentenceId?: string;
  german: string;
  english: string;
  turkish: string;
}
export interface InteriorConversationChoice {
  id: string;
  line: InteriorConversationLine;
  next: string;
}
export interface InteriorConversationNode {
  id: string;
  line: InteriorConversationLine;
  choices: readonly InteriorConversationChoice[];
}
export interface InteriorConversation {
  objectId: string;
  npcId: string;
  name: string;
  role: { english: string; turkish: string };
  title: { english: string; turkish: string };
  start: string;
  nodes: Readonly<Record<string, InteriorConversationNode>>;
}
export interface InteriorConversationState {
  objectId: string;
  nodeId: string;
  /** Previous nodes and answers are local navigation history, never learning evidence. */
  history: readonly { nodeId: string; choiceId: string }[];
}

const line = (german: string, english: string, turkish: string): InteriorConversationLine => ({ german, english, turkish });
const choice = (id: string, value: InteriorConversationLine, next: string): InteriorConversationChoice => ({ id, line: value, next });
const node = (id: string, value: InteriorConversationLine, choices: readonly InteriorConversationChoice[] = []): InteriorConversationNode => ({ id, line: value, choices });
const copy = (english: string, turkish: string): string => baseLanguage() === 'tr' ? turkish : english;

interface ScriptSpec {
  objectId: string;
  npcId: string;
  name: string;
  role: [string, string];
  title: [string, string];
  greeting: InteriorConversationLine;
  first: { answer: InteriorConversationLine; response: InteriorConversationLine };
  second: { answer: InteriorConversationLine; response: InteriorConversationLine };
  question: InteriorConversationLine;
  answer: InteriorConversationLine;
  finish: InteriorConversationLine;
  goodbye: InteriorConversationLine;
}

/** Every route has a greeting, a branch response, and an ending; questions add one turn. */
function script(spec: ScriptSpec): InteriorConversation {
  const thanks = line('Danke, das ist alles.', 'Thank you, that is everything.', 'Teşekkür ederim, hepsi bu.');
  return {
    objectId: spec.objectId, npcId: spec.npcId, name: spec.name,
    role: { english: spec.role[0], turkish: spec.role[1] },
    title: { english: spec.title[0], turkish: spec.title[1] }, start: 'start',
    nodes: {
      start: node('start', spec.greeting, [choice('first', spec.first.answer, 'first'), choice('second', spec.second.answer, 'second')]),
      first: node('first', spec.first.response, [choice('finish', spec.finish, 'done'), choice('question', spec.question, 'question')]),
      second: node('second', spec.second.response, [choice('finish', spec.finish, 'done'), choice('question', spec.question, 'question')]),
      question: node('question', spec.answer, [choice('thanks', thanks, 'done')]),
      done: node('done', spec.goodbye, []),
    },
  };
}

export const interiorConversations: readonly InteriorConversation[] = [
  script({
    objectId: 'interior:cafe:coffee', npcId: 'marta', name: 'Marta', role: ['Host', 'Ev sahibi'], title: ['Order your favourite coffee', 'Sevdiğin kahveyi sipariş et'],
    greeting: line('Guten Morgen! Die Kaffeemaschine ist bereit. Was möchtest du trinken?', 'Good morning! The coffee machine is ready. What would you like to drink?', 'Günaydın! Kahve makinesi hazır. Ne içmek istersin?'),
    first: { answer: line('Einen Kaffee mit Milch, bitte.', 'A coffee with milk, please.', 'Sütlü bir kahve, lütfen.'), response: line('Gern. Hier ist dein Kaffee mit Milch. Möchtest du Zucker?', 'Of course. Here is your coffee with milk. Would you like sugar?', 'Elbette. İşte sütlü kahven. Şeker ister misin?') },
    second: { answer: line('Einen schwarzen Kaffee, bitte.', 'A black coffee, please.', 'Sade bir kahve, lütfen.'), response: line('Ein schwarzer Kaffee. Die kleine Tasse ist noch warm. Möchtest du Zucker?', 'A black coffee. The little cup is still warm. Would you like sugar?', 'Bir sade kahve. Küçük fincan hâlâ sıcak. Şeker ister misin?') },
    question: line('Was kostet der Kaffee?', 'How much is the coffee?', 'Kahve ne kadar?'), answer: line('Der Kaffee kostet drei Euro. Du kannst mit Karte bezahlen.', 'The coffee costs three euros. You can pay by card.', 'Kahve üç avro. Kartla ödeyebilirsin.'),
    finish: line('Nein, danke. Das ist alles.', 'No, thank you. That is everything.', 'Hayır, teşekkür ederim. Hepsi bu.'), goodbye: line('Bitte schön. Lass dir den Kaffee schmecken!', 'Here you are. Enjoy your coffee!', 'Buyur. Kahveni afiyetle iç!'),
  }),
  script({
    objectId: 'interior:cafe:tea', npcId: 'marta', name: 'Marta', role: ['Host', 'Ev sahibi'], title: ['Ask about drinks and prices', 'İçecekleri ve fiyatları sor'],
    greeting: line('Der Tee kostet drei Euro. Möchtest du auch ein Wasser?', 'The tea costs three euros. Would you also like some water?', 'Çay üç avro. Su da ister misin?'),
    first: { answer: line('Einen Tee, bitte.', 'A tea, please.', 'Bir çay, lütfen.'), response: line('Gern. Das Wasser im Kessel ist heiß. Dein Tee kommt gleich.', 'Of course. The water in the kettle is hot. Your tea will be ready soon.', 'Elbette. Kettledaki su sıcak. Çayın birazdan hazır.') },
    second: { answer: line('Einen Tee und ein Wasser, bitte.', 'A tea and some water, please.', 'Bir çay ve bir su, lütfen.'), response: line('Ein Tee und ein Wasser. Das macht fünf Euro.', 'A tea and some water. That comes to five euros.', 'Bir çay ve bir su. Toplam beş avro.') },
    question: line('Ist der Tee ohne Zucker?', 'Is the tea without sugar?', 'Çay şekersiz mi?'), answer: line('Ja, ohne Zucker. Der Zucker steht neben den Tassen.', 'Yes, without sugar. The sugar is beside the cups.', 'Evet, şekersiz. Şeker fincanların yanında.'),
    finish: line('Danke, das ist alles.', 'Thank you, that is everything.', 'Teşekkür ederim, hepsi bu.'), goodbye: line('Hier ist deine Bestellung. Vorsicht, der Tee ist heiß!', 'Here is your order. Be careful, the tea is hot!', 'İşte siparişin. Dikkat, çay sıcak!'),
  }),
  script({
    objectId: 'interior:cafe:pastries', npcId: 'marta', name: 'Marta', role: ['Host', 'Ev sahibi'], title: ['A small treat and a complete order', 'Bir tatlı al ve siparişini tamamla'],
    greeting: line('Die Croissants sind frisch. Möchtest du Kuchen oder ein Croissant?', 'The croissants are fresh. Would you like cake or a croissant?', 'Kruvasanlar taze. Kek mi, kruvasan mı istersin?'),
    first: { answer: line('Ein Stück Kuchen, bitte.', 'A slice of cake, please.', 'Bir dilim kek, lütfen.'), response: line('Ein Stück Kuchen. Dazu passt ein Kaffee.', 'A slice of cake. A coffee goes well with that.', 'Bir dilim kek. Yanına kahve iyi gider.') },
    second: { answer: line('Ein Croissant, bitte.', 'A croissant, please.', 'Bir kruvasan, lütfen.'), response: line('Ein Croissant. Möchtest du es hier essen?', 'A croissant. Would you like to eat it here?', 'Bir kruvasan. Burada yemek ister misin?') },
    question: line('Kann ich die Speisekarte sehen?', 'Can I see the menu?', 'Menüye bakabilir miyim?'), answer: line('Natürlich. Die Speisekarte liegt hier. Kuchen und Croissants kosten je drei Euro.', 'Of course. The menu is here. Cake and croissants each cost three euros.', 'Elbette. Menü burada. Kek ve kruvasan üçer avro.'),
    finish: line('Die Rechnung, bitte.', 'The bill, please.', 'Hesap, lütfen.'), goodbye: line('Hier ist die Rechnung. Danke und einen schönen Tag!', 'Here is the bill. Thank you and have a lovely day!', 'İşte hesap. Teşekkür ederim, iyi günler!'),
  }),
  script({
    objectId: 'interior:cafe:table', npcId: 'lina', name: 'Lina', role: ['Guest', 'Misafir'], title: ['Finish a café visit', 'Kafe ziyaretini tamamla'],
    greeting: line('Ein schöner Platz! Ist der Tisch am Fenster frei?', 'A lovely spot! Is the table by the window free?', 'Ne güzel bir yer! Pencere kenarındaki masa boş mu?'),
    first: { answer: line('Ja, hier ist noch ein Platz frei.', 'Yes, there is still a free seat here.', 'Evet, burada bir yer daha var.'), response: line('Danke! Meine Tasse ist schon leer. Ich möchte bezahlen.', 'Thank you! My cup is already empty. I would like to pay.', 'Teşekkür ederim! Fincanım boşaldı. Ödemek istiyorum.') },
    second: { answer: line('Ich möchte auch am Fenster sitzen.', 'I would also like to sit by the window.', 'Ben de pencere kenarında oturmak istiyorum.'), response: line('Setz dich gern. Ich bin gleich fertig und frage nach der Rechnung.', 'Please sit down. I will finish soon and ask for the bill.', 'Buyur, otur. Birazdan bitirip hesabı isteyeceğim.'), },
    question: line('Wie viel Trinkgeld gibst du?', 'How much do you give as a tip?', 'Ne kadar bahşiş veriyorsun?'), answer: line('Die Rechnung ist vier Euro. Ich gebe einen Euro Trinkgeld.', 'The bill is four euros. I give one euro as a tip.', 'Hesap dört avro. Bir avro bahşiş veriyorum.'),
    finish: line('Die Rechnung, bitte.', 'The bill, please.', 'Hesap, lütfen.'), goodbye: line('Marta bringt die Rechnung. Danke für das Gespräch!', 'Marta is bringing the bill. Thank you for the conversation!', 'Marta hesabı getiriyor. Sohbet için teşekkür ederim!'),
  }),
  script({
    objectId: 'interior:bakery:bread', npcId: 'emil', name: 'Emil', role: ['Baker', 'Fırıncı'], title: ['Ask for bread', 'Ekmek iste'],
    greeting: line('Guten Morgen! Wir haben frisches Brot und warme Brötchen.', 'Good morning! We have fresh bread and warm bread rolls.', 'Günaydın! Taze ekmeğimiz ve sıcak küçük ekmeklerimiz var.'),
    first: { answer: line('Ein Brot, bitte.', 'A loaf of bread, please.', 'Bir ekmek, lütfen.'), response: line('Gern. Dieses Brot kommt gerade aus dem Ofen.', 'Of course. This loaf just came out of the oven.', 'Elbette. Bu ekmek fırından yeni çıktı.') },
    second: { answer: line('Zwei Brötchen, bitte.', 'Two bread rolls, please.', 'İki küçük ekmek, lütfen.'), response: line('Zwei Brötchen. Sie sind noch warm.', 'Two bread rolls. They are still warm.', 'İki küçük ekmek. Hâlâ sıcaklar.') },
    question: line('Haben Sie auch Brezeln?', 'Do you also have pretzels?', 'Brezel de var mı?'), answer: line('Ja, die Brezeln liegen rechts neben dem Brot.', 'Yes, the pretzels are on the right, beside the bread.', 'Evet, brezeller ekmeğin sağında.'),
    finish: line('Eine Tüte, bitte.', 'A bag, please.', 'Bir poşet, lütfen.'), goodbye: line('Hier ist deine Tüte. Danke und guten Appetit!', 'Here is your bag. Thank you and enjoy your food!', 'İşte poşetin. Teşekkür ederim, afiyet olsun!'),
  }),
  script({
    objectId: 'interior:bakery:oven', npcId: 'emil', name: 'Emil', role: ['Baker', 'Fırıncı'], title: ['A drink while the bread bakes', 'Ekmek pişerken bir içecek al'],
    greeting: line('Das Brot braucht noch einen Moment. Einen Kaffee dazu?', 'The bread needs a little longer. Would you like a coffee with it?', 'Ekmeğin biraz daha pişmesi gerekiyor. Yanına kahve ister misin?'),
    first: { answer: line('Ja, einen Kaffee mit Milch, bitte.', 'Yes, a coffee with milk, please.', 'Evet, sütlü bir kahve, lütfen.'), response: line('Gern. Die Milch steht neben der Kaffeemaschine.', 'Of course. The milk is beside the coffee machine.', 'Elbette. Süt kahve makinesinin yanında.') },
    second: { answer: line('Nur ein Wasser, bitte.', 'Just some water, please.', 'Sadece bir su, lütfen.'), response: line('Ein Wasser. Der Backofen ist heute besonders heiß.', 'Some water. The oven is particularly hot today.', 'Bir su. Fırın bugün çok sıcak.') },
    question: line('Ist viel Mehl im Teig?', 'Is there a lot of flour in the dough?', 'Hamurda çok un var mı?'), answer: line('Ja, Mehl und Wasser. Der Teig braucht auch Zeit.', 'Yes, flour and water. The dough also needs time.', 'Evet, un ve su var. Hamurun zamana da ihtiyacı var.'),
    finish: line('Danke, ich warte hier.', 'Thank you, I will wait here.', 'Teşekkür ederim, burada bekleyeceğim.'), goodbye: line('Hier ist dein Getränk. Gleich ist auch das Brot fertig.', 'Here is your drink. The bread will be ready soon too.', 'İşte içeceğin. Ekmek de birazdan hazır olacak.'),
  }),
  script({
    objectId: 'interior:bakery:pastries', npcId: 'marta', name: 'Marta', role: ['Guest', 'Misafir'], title: ['A treat to take away', 'Yanına bir tatlı al'],
    greeting: line('Ich hole Gebäck für das Café. Möchtest du auch etwas mitnehmen?', 'I am getting pastries for the café. Would you like to take something too?', 'Kafe için hamur işi alıyorum. Sen de yanına bir şey almak ister misin?'),
    first: { answer: line('Einen Keks, bitte.', 'A biscuit, please.', 'Bir kurabiye, lütfen.'), response: line('Ein Keks passt gut in deine Tasche. Möchtest du etwas trinken?', 'A biscuit fits nicely in your bag. Would you like something to drink?', 'Bir kurabiye çantana kolayca sığar. Bir şey içmek ister misin?') },
    second: { answer: line('Eine Schnecke, bitte.', 'A swirl pastry, please.', 'Bir spiral çörek, lütfen.'), response: line('Die Schnecke ist süß und noch warm. Möchtest du etwas trinken?', 'The swirl pastry is sweet and still warm. Would you like something to drink?', 'Spiral çörek tatlı ve hâlâ sıcak. Bir şey içmek ister misin?') },
    question: line('Was kostet ein Wasser?', 'How much is a bottle of water?', 'Bir su ne kadar?'), answer: line('Ein Wasser kostet zwei Euro. Das Gebäck kostet drei Euro.', 'A bottle of water costs two euros. The pastry costs three euros.', 'Bir su iki avro. Hamur işi üç avro.'),
    finish: line('Ein Wasser für unterwegs, bitte.', 'Some water for the journey, please.', 'Yol için bir su, lütfen.'), goodbye: line('Hier, dein Gebäck und dein Wasser. Gute Reise!', 'Here are your pastry and water. Have a good journey!', 'İşte hamur işin ve suyun. İyi yolculuklar!'),
  }),
  script({
    objectId: 'interior:bakery:counter', npcId: 'emil', name: 'Emil', role: ['Baker', 'Fırıncı'], title: ['Pay for your bakery visit', 'Fırın alışverişini öde'],
    greeting: line('Das kostet fünf Euro fünfzig. Wie möchtest du bezahlen?', 'That costs five euros fifty. How would you like to pay?', 'Beş avro elli sent. Nasıl ödemek istersin?'),
    first: { answer: line('Mit Karte, bitte.', 'By card, please.', 'Kartla, lütfen.'), response: line('Sehr gern. Halte deine Karte hier an das Gerät.', 'Certainly. Hold your card here against the device.', 'Elbette. Kartını buradaki cihaza yaklaştır.') },
    second: { answer: line('Bar, bitte.', 'With cash, please.', 'Nakit, lütfen.'), response: line('Gern. Hier ist dein Wechselgeld.', 'Of course. Here is your change.', 'Elbette. İşte para üstün.') },
    question: line('Kann ich eine Tüte haben?', 'Can I have a bag?', 'Bir poşet alabilir miyim?'), answer: line('Natürlich. Die Tüte kostet nichts.', 'Of course. The bag is free.', 'Elbette. Poşet ücretsiz.'),
    finish: line('Danke, das ist alles.', 'Thank you, that is everything.', 'Teşekkür ederim, hepsi bu.'), goodbye: line('Danke für deinen Besuch. Bis bald!', 'Thank you for visiting. See you soon!', 'Ziyaretin için teşekkür ederim. Görüşmek üzere!'),
  }),
  script({
    objectId: 'interior:supermarket:produce', npcId: 'greta', name: 'Greta', role: ['Guest', 'Misafir'], title: ['Choose fresh ingredients', 'Taze malzemeler seç'],
    greeting: line('Die Tomaten sind heute frisch. Was brauchst du für die Suppe?', 'The tomatoes are fresh today. What do you need for the soup?', 'Domatesler bugün taze. Çorba için neye ihtiyacın var?'),
    first: { answer: line('Ein Kilo Kartoffeln, bitte.', 'A kilo of potatoes, please.', 'Bir kilo patates, lütfen.'), response: line('Die Kartoffeln liegen hier im Korb. Nimm auch eine Tomate.', 'The potatoes are here in the basket. Take a tomato too.', 'Patatesler burada, sepette. Bir domates de al.') },
    second: { answer: line('Zwei Tomaten, bitte.', 'Two tomatoes, please.', 'İki domates, lütfen.'), response: line('Diese zwei Tomaten sind gut für die Suppe. Sie sind schön rot.', 'These two tomatoes are good for the soup. They are a lovely red.', 'Bu iki domates çorba için iyi. Çok güzel kırmızılar.') },
    question: line('Wo sind die Äpfel?', 'Where are the apples?', 'Elmalar nerede?'), answer: line('Die Äpfel liegen links. Zwei Äpfel kosten einen Euro.', 'The apples are on the left. Two apples cost one euro.', 'Elmalar solda. İki elma bir avro.'),
    finish: line('Danke, ich gehe zur Kasse.', 'Thank you, I am going to the checkout.', 'Teşekkür ederim, kasaya gidiyorum.'), goodbye: line('Fritz wartet an der Kasse. Viel Spaß beim Kochen!', 'Fritz is waiting at the checkout. Enjoy cooking!', 'Fritz kasada bekliyor. Yemek yaparken iyi eğlenceler!'),
  }),
  script({
    objectId: 'interior:supermarket:shelves', npcId: 'fritz', name: 'Fritz', role: ['Shopkeeper', 'Esnaf'], title: ['Find what you need', 'İhtiyacın olanları bul'],
    greeting: line('Guten Tag! Suchst du Brot, Reis oder Nudeln?', 'Hello! Are you looking for bread, rice or pasta?', 'Merhaba! Ekmek, pirinç veya makarna mı arıyorsun?'),
    first: { answer: line('Wo ist das Brot?', 'Where is the bread?', 'Ekmek nerede?'), response: line('Das Brot liegt hier im ersten Regal. Es ist frisch von der Bäckerei.', 'The bread is here on the first shelf. It is fresh from the bakery.', 'Ekmek burada, ilk rafta. Fırından taze geldi.') },
    second: { answer: line('Ich brauche Reis und Nudeln.', 'I need rice and pasta.', 'Pirinç ve makarna gerekiyor.'), response: line('Reis und Nudeln stehen im zweiten Regal, gleich rechts.', 'Rice and pasta are on the second shelf, just on the right.', 'Pirinç ve makarna ikinci rafta, hemen sağda.') },
    question: line('Haben Sie auch Milch?', 'Do you also have milk?', 'Süt de var mı?'), answer: line('Ja. Die Milch steht im Kühlschrank hinten.', 'Yes. The milk is in the fridge at the back.', 'Evet. Süt arkadaki buzdolabında.'),
    finish: line('Danke, ich habe alles.', 'Thank you, I have everything.', 'Teşekkür ederim, her şeyi aldım.'), goodbye: line('Gut. Du kannst jetzt an der Kasse bezahlen.', 'Good. You can now pay at the checkout.', 'Güzel. Şimdi kasada ödeyebilirsin.'),
  }),
  script({
    objectId: 'interior:supermarket:scales', npcId: 'fritz', name: 'Fritz', role: ['Shopkeeper', 'Esnaf'], title: ['Quantities and prices', 'Miktarları ve fiyatları sor'],
    greeting: line('Die Waage ist bereit. Wie viele Äpfel möchtest du?', 'The scales are ready. How many apples would you like?', 'Terazi hazır. Kaç elma istersin?'),
    first: { answer: line('Ein Kilo, bitte.', 'One kilo, please.', 'Bir kilo, lütfen.'), response: line('Ein Kilo Äpfel kostet drei Euro.', 'One kilo of apples costs three euros.', 'Bir kilo elma üç avro.') },
    second: { answer: line('Ein halbes Kilo, bitte.', 'Half a kilo, please.', 'Yarım kilo, lütfen.'), response: line('Ein halbes Kilo kostet einen Euro fünfzig.', 'Half a kilo costs one euro fifty.', 'Yarım kilo bir avro elli sent.') },
    question: line('Ist das der Preis für heute?', 'Is that the price for today?', 'Bugünkü fiyat bu mu?'), answer: line('Ja. Der Preis steht auch auf dem Schild neben der Waage.', 'Yes. The price is also on the sign beside the scales.', 'Evet. Fiyat terazinin yanındaki tabelada da yazıyor.'),
    finish: line('Gut, das nehme ich.', 'Good, I will take that.', 'Tamam, bunu alıyorum.'), goodbye: line('Bitte schön. Die Tüte kannst du an der Kasse bezahlen.', 'Here you are. You can pay for the bag at the checkout.', 'Buyur. Torbadaki ürünleri kasada ödeyebilirsin.'),
  }),
  script({
    objectId: 'interior:supermarket:checkout', npcId: 'fritz', name: 'Fritz', role: ['Shopkeeper', 'Esnaf'], title: ['Finish the grocery shop', 'Market alışverişini tamamla'],
    greeting: line('Guten Tag! Das macht fünf Euro fünfzig. Wie möchtest du bezahlen?', 'Hello! That comes to five euros fifty. How would you like to pay?', 'Merhaba! Toplam beş avro elli sent. Nasıl ödemek istersin?'),
    first: { answer: line('Mit Karte, bitte.', 'By card, please.', 'Kartla, lütfen.'), response: line('Halte die Karte an das Gerät. Gut, die Zahlung ist fertig.', 'Hold the card against the device. Good, the payment is complete.', 'Kartını cihaza yaklaştır. Güzel, ödeme tamamlandı.') },
    second: { answer: line('Hier sind sechs Euro.', 'Here are six euros.', 'İşte altı avro.'), response: line('Danke. Hier sind fünfzig Cent zurück.', 'Thank you. Here are fifty cents in change.', 'Teşekkür ederim. İşte elli sent para üstün.') },
    question: line('Kann ich den Kassenbon haben?', 'Can I have the receipt?', 'Fişi alabilir miyim?'), answer: line('Natürlich. Auf dem Kassenbon steht jeder Preis.', 'Of course. Every price is on the receipt.', 'Elbette. Her fiyat fişte yazıyor.'),
    finish: line('Danke. Auf Wiedersehen!', 'Thank you. Goodbye!', 'Teşekkür ederim. Hoşça kalın!'), goodbye: line('Auf Wiedersehen! Lass den Korb bitte hier.', 'Goodbye! Please leave the basket here.', 'Hoşça kal! Lütfen sepeti burada bırak.'),
  }),
  script({
    objectId: 'interior:inn:welcome', npcId: 'greta', name: 'Greta', role: ['Host', 'Ev sahibi'], title: ['A friendly welcome', 'Sıcak bir karşılama'],
    greeting: line('Hallo! Schön, dich zu sehen. Dein Zimmer ist ruhig. Möchtest du einen Tee?', 'Hello! Lovely to see you. Your room is quiet. Would you like some tea?', 'Merhaba! Seni görmek güzel. Odan sessiz. Çay ister misin?'),
    first: { answer: line('Ja, einen Tee, bitte.', 'Yes, some tea, please.', 'Evet, bir çay, lütfen.'), response: line('Gern. Hier ist eine warme Tasse Tee. Setz dich an den Tisch.', 'Of course. Here is a warm cup of tea. Sit down at the table.', 'Elbette. İşte sıcak bir fincan çay. Masaya otur.') },
    second: { answer: line('Nein, danke. Ich möchte mich ausruhen.', 'No, thank you. I would like to rest.', 'Hayır, teşekkür ederim. Dinlenmek istiyorum.'), response: line('Natürlich. Dein Bett ist bereit. Die Lampe bleibt für dich an.', 'Of course. Your bed is ready. I will leave the lamp on for you.', 'Elbette. Yatağın hazır. Lambayı senin için açık bırakacağım.') },
    question: line('Wo kann ich meine Briefe lesen?', 'Where can I read my letters?', 'Mektuplarımı nerede okuyabilirim?'), answer: line('Am Schreibtisch. Deine Briefe und dein Atlas liegen dort.', 'At the desk. Your letters and your atlas are there.', 'Çalışma masasında. Mektupların ve atlasın orada.'),
    finish: line('Danke für deine Hilfe.', 'Thank you for your help.', 'Yardımın için teşekkür ederim.'), goodbye: line('Sehr gern. Hab einen ruhigen Abend!', 'You are welcome. Have a peaceful evening!', 'Rica ederim. Huzurlu bir akşam geçir!'),
  }),
];

const conversationsByObject = new Map(interiorConversations.map(conversation => [conversation.objectId, conversation]));

export function interiorConversationFor(objectId: string): InteriorConversation | undefined {
  return conversationsByObject.get(objectId);
}

export function createInteriorConversationState(objectId: string): InteriorConversationState | undefined {
  const conversation = interiorConversationFor(objectId);
  return conversation ? { objectId, nodeId: conversation.start, history: [] } : undefined;
}

export function interiorConversationNode(state: InteriorConversationState): InteriorConversationNode | undefined {
  return interiorConversationFor(state.objectId)?.nodes[state.nodeId];
}

/** Invalid or stale UI actions leave the current turn intact. */
export function chooseInteriorConversation(state: InteriorConversationState, choiceId: string): InteriorConversationState {
  const answer = interiorConversationNode(state)?.choices.find(option => option.id === choiceId);
  if (!answer || (!interiorConversationFor(state.objectId)?.nodes[answer.next] && !answer.line.sentenceId)) return state;
  return { ...state, nodeId: answer.next, history: [...state.history, { nodeId: state.nodeId, choiceId }] };
}

export function backInteriorConversation(state: InteriorConversationState): InteriorConversationState {
  const previous = state.history.at(-1);
  return previous ? { ...state, nodeId: previous.nodeId, history: state.history.slice(0, -1) } : state;
}

export function replayInteriorConversation(state: InteriorConversationState): InteriorConversationState {
  return createInteriorConversationState(state.objectId) ?? state;
}

/** Use the shared delayed hover/focus and immediate touch translation controller. */
export function interiorLineNarrative(value: InteriorConversationLine): readonly TranslatedSentence[] {
  if (value.sentenceId) return [value];
  return [{ german: value.german, english: copy(value.english, value.turkish), localized: true }];
}

export function renderInteriorConversation(state: InteriorConversationState, options: { portraitMarkup?: string } = {}): string {
  const conversation = interiorConversationFor(state.objectId), current = interiorConversationNode(state);
  if (!conversation || !current) return '';
  const speaker = (value: InteriorConversationLine) => `<button class="icon-button" data-speak="${e(value.german)}" aria-label="${e(copy('Listen', 'Dinle'))}">${icon('volume')}</button>`;
  return `<div class="interior-encounter interior-conversation" data-conversation-object="${e(state.objectId)}"><header class="interior-encounter-heading">${options.portraitMarkup ?? ''}<div><h2>${e(conversation.name)}</h2><p class="encounter-role">${e(copy(conversation.role.english, conversation.role.turkish))}</p></div></header><blockquote class="interior-dialogue">${renderNarrative(interiorLineNarrative(current.line))}${speaker(current.line)}</blockquote>${current.choices.length ? `<div class="conversation-choices">${current.choices.map(answer => answer.line.sentenceId ? `<div class="conversation-choice">${renderNarrative(interiorLineNarrative(answer.line))}<button class="outline-button" data-interior-choice="${e(answer.id)}">${e(copy('Say it', 'Söyle'))}</button>${speaker(answer.line)}</div>` : `<div class="conversation-choice"><button class="outline-button" data-interior-choice="${e(answer.id)}">${renderNarrative(interiorLineNarrative(answer.line))}</button>${speaker(answer.line)}</div>`).join('')}</div>` : `<button class="primary-button" data-interior-conversation="replay">${icon('refresh')} ${e(copy('Talk again', 'Yeniden konuş'))}</button>`}<div class="encounter-secondary conversation-controls">${state.history.length ? `<button class="text-button" data-interior-conversation="back">${e(copy('Back', 'Geri'))}</button>` : ''}<button class="text-button" data-interior-conversation="encounter">${e(copy('Back to the encounter', 'Karşılaşmaya dön'))}</button><button class="text-button" data-action="close-dialog">${e(copy('Leave', 'Ayrıl'))}</button></div></div>`;
}
