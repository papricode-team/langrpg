import type { Level } from './content';
import type { MapId } from './maps';

export interface StoryAct {
  mapId: MapId;
  level: Level;
  number: string;
  title: string;
  premise: string;
  introduction: string[];
  goal: string;
  cliffhanger: string;
}
export const storyActs: StoryAct[] = [
  {
    mapId: 'lindenhafen', level: 'A1', number: 'I', title: 'The platform that should not exist',
    premise: 'A train arrives from a town everyone has forgotten. Its last passenger is a letter addressed to you.',
    introduction: [
      'Your train reaches Lindenhafen with an extra carriage full of sleeping pigeons. Otto calls this a minor timetable issue. Then a lantern lights a platform that is missing from every map.',
      'The Lantern Atlas once kept the towns connected. Someone has torn out a route. Addresses are fading. Letters arrive tomorrow, yesterday, or inside Marta’s refrigerator.',
      'Meet the locals, learn the German you need for everyday errands, and follow the little things that refuse to disappear. You do not need any German to begin. A little help is always available.',
    ],
    goal: 'Find the sender of the letter from the missing town.',
    cliffhanger: 'The blank page finally names a place: Waldruh. Under it, a message appears: “Before you erase us again, come.”',
  },
  {
    mapId: 'waldruh', level: 'A2', number: 'II', title: 'The village that lost an hour',
    premise: 'Autumn never quite ends here. Every clock avoids midnight, and the villagers remember more than their records do.',
    introduction: [
      'The forgotten route winds into Waldruh, an autumn village built around an old clockmill. Its waterwheel turns. Its clocks disagree. A small brass notice says the village has “voluntarily ceased to exist”. Nobody remembers volunteering.',
      'Marta has found an inn with a travelling upstairs room; Emil is trying to repair the lost hour. Each time the clockmill repeats it, another resident’s name fades from the records. Ada recognises the closure seal, and changes the subject rather quickly.',
      'The Brass Office insists the old records are correct. The Lamplighters want every route reopened. The villagers’ Unwritten Circle want someone to ask them first. Make plans, reconstruct what happened, and find whose promise was erased.',
    ],
    goal: 'Recover the lost hour and follow the signed order to Nebelstadt.',
    cliffhanger: 'Ada admits she signed the first closure record as an apprentice. The final order bears another name: Elise Sander, Keeper of the Atlas. The answer is waiting in Nebelstadt.',
  },
  {
    mapId: 'nebelstadt', level: 'B1', number: 'III', title: 'The promise in the mist',
    premise: 'A harbour council argues over a railway, a garden, and the right to be remembered. The missing keeper left evidence here.',
    introduction: [
      'Nebelstadt rises from the mist around a signal harbour and an observatory. The council has summoned the Brass Office, the Lamplighters, and the Unwritten Circle. Everyone brought evidence. Fritz brought soup, which is currently the only thing they agree on.',
      'The closure orders contradict one another. The keeper’s signal was heard in two places at once. Above the harbour, a lighthouse sends a dark beam toward Waldruh. A new order will become permanent when the great bell rings for the seventh time.',
      'Compare witnesses, follow the repair ledger, and help the harbour through a storm. Find what the dark signal is doing before the next great bell. A hurried accusation could bury the truth as thoroughly as a missing page.',
    ],
    goal: 'Bring the evidence together and write a promise the whole route can trust.',
    cliffhanger: 'Three towns return to the Atlas. Beyond the restored route, a faint coastline appears with no name. Someone, somewhere, is still waiting for an answer.',
  },
];

export interface StoryClue { questId: string; title: string; text: string; lead: string; }
export const storyClues: StoryClue[] = [
  { questId: 'a1-arrival', title: 'The extra platform', text: 'Otto’s passenger ledger has a blank line where a destination should be. The lantern above the extra platform still answers to that missing name.', lead: 'Marta kept a receipt from the mysterious passenger. Find her at the café.' },
  { questId: 'a1-cafe', title: 'Tomorrow’s receipt', text: 'Marta’s kettle whistles tomorrow’s rain. Her receipt is dated tomorrow too, and carries a brass seal. She once delivered messages for the Lamplighters; she has kept her old satchel.', lead: 'Fritz has seen that seal on a delivery at the market.' },
  { questId: 'a1-market', title: 'The numbered apple', text: 'The mark on Fritz’s apple is a Brass Office route number. His runaway list had crossed out an address he no longer remembers. Fritz keeps the soup club’s guest book because paper is harder to forget than people think.', lead: 'Ask Otto about the route number and the strange station announcement.' },
  { questId: 'a1-station', title: 'A name in the announcement', text: 'Under the ordinary departures, the board briefly says “Waldruh”. Otto remembers selling that ticket, though the official timetable insists the town was never there.', lead: 'Emil’s wandering lamp reacts to the same route number.' },
  { questId: 'a1-workshop', title: 'The lamp that remembers', text: 'Emil’s lamp follows erased addresses, not people. He built it from a retired Atlas signal. The symbol in its housing matches the numbered apple and Marta’s receipt.', lead: 'Lina has a parcel the lamp refuses to leave alone.' },
  { questId: 'a1-lost-parcel', title: 'A letter from the missing town', text: 'The parcel’s blank page lights up beside the station. It names Waldruh, then reveals a request: “Before you erase us again, come.” The missing town is still there. Someone has been waiting.', lead: 'Open the region atlas and travel to Waldruh.' },
  { questId: 'a2-apartment', title: 'Two addresses, one room', text: 'The inn’s upstairs room looks onto two towns because its lease still carries a promise between them. Even a refrigerator can remember an address when the record keepers cannot.', lead: 'Fritz’s lantern gathering could send a message beyond the village.' },
  { questId: 'a2-evening-plans', title: 'The Unwritten Circle', text: 'The festival signal reaches a group of villagers who call themselves the Unwritten Circle. They were never asked to close the route. Their first request is surprisingly ordinary: agree on a time, then show up.', lead: 'Otto has found the connection that brought the closure order here.' },
  { questId: 'a2-rail-trip', title: 'Closed from the inside', text: 'The railway was not destroyed. A keeper’s key closed it from within the Atlas. Someone chose the silence, and the Brass Office later described it as an agreement.', lead: 'Reconstruct Emil’s repairs at the clockmill.' },
  { questId: 'a2-broken-clock', title: 'The lost hour', text: 'Emil’s repair notes skip the hour before midnight. Each replay erases another resident’s name. His tools were borrowed to detach the route’s signal, then returned with a polite thank-you note. He objects to the sabotage, but appreciates the handwriting.', lead: 'Greta knows a villager whose memories survived the missing hour.' },
  { questId: 'a2-clinic', title: 'A memory no clock can erase', text: 'A patient remembers travelling to Waldruh before the records changed. Greta has kept seed packets from gardens along the old railway. Their handwritten addresses are independent evidence.', lead: 'Bring these accounts to Ada’s travelling archive.' },
  { questId: 'a2-archive', title: 'Ada’s signature', text: 'Ada admits signing the early closure record as Elise Sander’s apprentice. She thought it was temporary. The final order was signed by Elise in Nebelstadt, and Ada’s copy has a warning hidden under the official seal.', lead: 'Travel to Nebelstadt and compare the witnesses before drawing conclusions.' },
  { questId: 'b1-witness', title: 'The recorded echo', text: 'The keeper was not in two places at once. One witness heard an old signal recording. Lina separates what people saw from what they inferred; her delivery times now form a useful timeline.', lead: 'Work with Otto on a route the villagers can actually use.' },
  { questId: 'b1-new-route', title: 'A route with room for a garden', text: 'Reopening the old track exactly as it was would cut through the village garden. The Unwritten Circle support a connection that respects their daily lives. A faster train is not the same as a better promise.', lead: 'Emil needs help planning the restoration work.' },
  { questId: 'b1-work', title: 'The repair ledger', text: 'The restoration ledger proves the signal was disconnected deliberately. Elise believed isolation would stop a quarrel from becoming a crisis. The Brass Office turned her temporary measure into a convenient official truth.', lead: 'Bring the ledger to the council and explain what the evidence supports.' },
  { questId: 'b1-council', title: 'Protection without permission', text: 'The council finally hears why Elise erased the route. Protecting the village became deciding for it. Ada reads the omitted objections aloud. The dark lighthouse beam records every missing answer as consent; the seventh great bell would make that false agreement permanent.', lead: 'A storm is approaching. Help the harbour put its new cooperation into practice.' },
  { questId: 'b1-storm', title: 'A promise kept in the rain', text: 'People from all three towns protect the garden, move supplies, and restore the signal together. The Atlas lanterns respond to these small commitments. The signal carries the villagers’ replies before the bell can record silence. Trust is being rebuilt through things people actually do.', lead: 'Meet Ada at the observatory to write the final agreement.' },
  { questId: 'b1-atlas', title: 'The route returns', text: 'The new agreement records what happened, names the people affected, and promises a safe connection that protects the garden. The route returns to the Atlas. Elise’s choice is remembered honestly, rather than quietly excused.', lead: 'Explore the restored towns. A faint, unnamed coastline is appearing at the edge of the Atlas.' },
];

export const objectStories: Record<string, { detail: string; secret: string }> = {
  'lindenhafen-fountain': { detail: 'Coins in the fountain land on yesterday’s wishes. One brass token bears a route number that nobody in the square can explain.', secret: 'Marta says the fountain once carried messages between Lamplighter cafés. She insists the plumbing bill was entirely ordinary.' },
  'lindenhafen-noticeboard': { detail: 'A departure slip has a clean rectangular gap where its destination should be. The pin is still warm.', secret: 'Otto leaves the gap on display. Removing it would be tidier, which is precisely what makes him suspicious.' },
  'lindenhafen-parcel': { detail: 'The label is addressed to tomorrow. When you turn the parcel, its ink tries to spell a town you have never visited.', secret: 'Lina has delivered to yesterday twice. This is the first parcel that asked her to deliver an apology.' },
  'lindenhafen-workbench': { detail: 'A small lamp tilts toward the railway instead of toward the nearest person. Its casing has the same mark as the fountain token.', secret: 'Emil filed it under “mostly working”. The lamp appears to disagree with the word “mostly”.' },
  'lindenhafen-garden': { detail: 'A row of labelled herbs includes a packet addressed to an erased railway stop. Greta has underlined the address in green.', secret: 'The plants remember where they came from. Greta is keeping their paperwork in case the officials come to inspect the fern.' },
  'waldruh-clock': { detail: 'The clockmill moves from 23:59 to 01:00. Between those times, one wheel turns without touching another.', secret: 'Emil’s notes call the missing gear an “administrative decision”. He has circled that phrase rather forcefully.' },
  'waldruh-housing-board': { detail: 'One room is advertised at two addresses. The notice asks tenants to knock before changing the view.', secret: 'Its lease is still an agreement between towns. That small, unbroken promise has kept a narrow route alive.' },
  'waldruh-herb-garden': { detail: 'The beds are arranged along the shape of the old railway. Every seed packet has a handwritten place name.', secret: 'Greta kept the original addresses after the Brass Office issued “corrected” labels. The garden is a quiet counter-archive.' },
  'waldruh-route-sign': { detail: 'The old route sign points toward Nebelstadt. A newer plaque says there was never a route here.', secret: 'The older paint is beneath the newer plaque. Someone revised the story without removing the evidence.' },
  'waldruh-memory-stone': { detail: 'The stone lists names from the last lantern gathering. A space near the bottom has been polished smooth.', secret: 'The villagers leave flowers beside the gap. An erased name can still have people waiting for it.' },
  'nebelstadt-council-board': { detail: 'Three notices argue for speed, safety, and a voice in the decision. A fourth advertises Fritz’s soup.', secret: 'The Unwritten Circle’s old objections are pinned beside Ada’s copies. For once, the missing voices are on the same board.' },
  'nebelstadt-signal-lantern': { detail: 'The signal catches a warm pulse from Waldruh. Its rhythm changes whenever someone answers.', secret: 'A route is a conversation in both directions. The signal cannot stay lit by orders from only one end.' },
  'nebelstadt-observatory': { detail: 'A brass instrument projects three incomplete routes. A fourth faint line reaches toward an unnamed coast.', secret: 'The Atlas records promises, not possession. Even its most beautiful line can fade if nobody means to keep it.' },
  'nebelstadt-evidence-crate': { detail: 'Delivery slips, a seed packet, and a repair ledger sit beside a recorded signal. They tell similar stories with different gaps.', secret: 'Lina labels what each source proves. Her final label reads “A suspicion is not a witness”.' },
  'nebelstadt-harbor-chart': { detail: 'The fastest proposed track crosses the village garden. A slower curve follows an existing road.', secret: 'Otto has drawn the slower line twice. On the second version, he has added a stop close to the clinic.' },
};

export function actFor(mapId: MapId): StoryAct { return storyActs.find(act => act.mapId === mapId)!; }
export function clueFor(questId: string): StoryClue | undefined { return storyClues.find(clue => clue.questId === questId); }
export function discoveredClues(completedQuestIds: readonly string[]): StoryClue[] {
  return storyClues.filter(clue => completedQuestIds.includes(clue.questId));
}
