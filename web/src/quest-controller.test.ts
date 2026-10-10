// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestController } from './quest-controller';
import { emptyProgress, type Progress } from './api';
import { emptyStory } from './dialogue';
import { questGraphs } from './quest-graph';
import { quests } from './content';
import { answerMatches } from './learning';

let controller: QuestController | undefined;
afterEach(() => { controller?.destroy(); document.body.innerHTML = ''; });
function fixture(stage: 'intro' | 'gate' | 'choice' = 'intro', questId = 'a1-arrival') {
  let audioEnabled = true;
  let progress: Progress = {...emptyProgress(), story:emptyStory()};
  progress.story!.nodes[questId] = stage;
  const bump = () => { progress = {...progress,revision:progress.revision+1,story:structuredClone(progress.story)}; return progress; };
  const api = {
    request:vi.fn(async () => ({attemptId:'saved-reply',correct:true,progress:bump()})),
    inspectStory:vi.fn(async (input:{objectId:string}) => { progress.story!.inspections[questId] = [...(progress.story!.inspections[questId]??[]),input.objectId]; return {story:progress.story!,progress:bump()}; }),
    storyTransition:vi.fn(async (input:{nodeId:string}) => { progress.story!.nodes[questId] = input.nodeId === 'intro' ? 'gate' : input.nodeId === 'gate' ? 'choice' : 'complete'; if(input.nodeId==='choice'){progress.completedQuestIds.push(questId);progress.xp+=40;} return {story:progress.story!,progress:bump()}; }),
  };
  const options = {api:api as never,progress:()=>progress,playerName:()=>'<Willow>',portrait:()=>'',speak:vi.fn(),audioEnabled:()=>audioEnabled,setAudioEnabled:vi.fn((enabled:boolean)=>{audioEnabled=enabled;}),stopSpeech:vi.fn(),onOpen:vi.fn(),onClose:vi.fn(),onProgress:(next:Progress)=>{progress=next;},onInvestigate:vi.fn(),onComplete:vi.fn(),expose:vi.fn()};
  controller = new QuestController(options);
  const click = (selector:string) => document.querySelector<HTMLButtonElement>(selector)!.click();
  return {api,options,controller,get progress(){return progress;},click};
}

describe('conversation scene lifecycle', () => {
  it('reveals Marta’s accepted repair request and fills it without submitting automatically', async () => {
    const f = fixture('gate', 'a2-apartment');
    const exercise = quests.find(q => q.id === 'a2-apartment')!.exercises.find(ex => ex.id === 'a2-apartment-exercise-6')!;
    f.options.setAudioEnabled(false);
    await f.controller.open('a2-apartment');
    document.querySelector<HTMLInputElement>('#dialogue-answer')!.value = 'Könnten Sie der Tür reparieren?';
    expect(document.querySelector('.dialogue-answer-help')).toBeNull();
    f.click('[data-dialogue-action="show-answer"]');
    expect(document.querySelector('.dialogue-answer-help p')?.textContent).toBe('Könnten Sie das bitte reparieren?');
    expect(document.querySelector<HTMLInputElement>('#dialogue-answer')!.value).toBe('Könnten Sie der Tür reparieren?');
    expect(f.options.expose).toHaveBeenCalledWith(exercise.id);
    expect(f.options.speak).not.toHaveBeenCalled();
    expect(f.api.request).not.toHaveBeenCalled();
    expect(f.api.storyTransition).not.toHaveBeenCalled();
    f.click('[data-dialogue-action="use-answer"]');
    const input = document.querySelector<HTMLInputElement>('#dialogue-answer')!;
    expect(input.value).toBe(exercise.answer);
    expect(answerMatches(exercise, input.value)).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(f.api.request).not.toHaveBeenCalled();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(f.api.storyTransition).toHaveBeenCalled());
    expect(f.api.request.mock.calls[0]).toMatchObject(['/attempt', {answer:exercise.answer,hinted:true,sceneAttempt:true,questId:'a2-apartment'}]);
    expect(f.api.storyTransition.mock.calls[0][0]).toMatchObject({nodeId:'gate',attemptId:'saved-reply'});
  });

  it('keeps revealed help while replaying a line, hides it on request, and resets it for another conversation', async () => {
    const f = fixture('gate');
    await f.controller.open('a1-arrival');
    f.click('[data-dialogue-action="show-answer"]');
    f.click('[data-dialogue-action="listen"]');
    expect(document.querySelector('.dialogue-answer-help')).not.toBeNull();
    f.click('[data-dialogue-action="show-answer"]');
    expect(document.querySelector('.dialogue-answer-help')).toBeNull();
    f.click('[data-dialogue-action="show-answer"]');
    f.controller.close();
    f.progress.story!.nodes['a2-apartment'] = 'gate';
    await f.controller.open('a2-apartment');
    expect(document.querySelector('.dialogue-answer-help')).toBeNull();
    expect(document.querySelector('[data-dialogue-action="show-answer"]')?.getAttribute('aria-expanded')).toBe('false');
    f.click('[data-dialogue-action="show-answer"]');
    expect(document.querySelector('.dialogue-answer-help p')?.textContent).toBe('Könnten Sie das bitte reparieren?');
  });

  it('stays quiet while audio is off, enables the current line and stops playback when disabled', async () => {
    const f = fixture('gate');
    f.options.setAudioEnabled(false);
    await f.controller.open('a1-arrival');
    expect(f.options.speak).not.toHaveBeenCalled();
    const text = document.querySelector('.dialogue-line')!.textContent;
    document.querySelector<HTMLInputElement>('#dialogue-answer')!.value = 'Helfen Sie mir bitte.';
    f.click('[aria-label="Meaning of Bitte"]');
    const translation = document.querySelector('.dialogue-translation')!.textContent;
    f.click('[data-dialogue-action="audio"]');
    expect(f.options.setAudioEnabled).toHaveBeenLastCalledWith(true);
    expect(f.options.speak).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-dialogue-action="audio"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector<HTMLInputElement>('#dialogue-answer')!.value).toBe('Helfen Sie mir bitte.');
    expect(document.querySelector('.dialogue-line')!.textContent).toBe(text);
    expect(document.querySelector('.dialogue-translation')!.textContent).toBe(translation);
    f.click('[data-dialogue-action="audio"]');
    expect(f.options.setAudioEnabled).toHaveBeenLastCalledWith(false);
    expect(f.options.stopSpeech).toHaveBeenCalledTimes(1);
    expect(f.options.speak).toHaveBeenCalledTimes(1);
    // A preference changed elsewhere also updates the open dialogue without speaking.
    f.options.setAudioEnabled(true); f.controller.refreshAudio();
    expect(document.querySelector('[data-dialogue-action="audio"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(f.options.speak).toHaveBeenCalledTimes(1);
  });

  it('plays German one line at a time, then returns to the physical investigation', async () => {
    const f=fixture(); await f.controller.open('a1-arrival');
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.querySelector('.dialogue-line')!.textContent).toContain('<Willow>');
    expect(document.querySelector('.dialogue-line')!.innerHTML).not.toContain('<Willow>');
    for(let line=0;line<7;line++) f.click('[data-dialogue-action="next"]');
    expect(f.options.onInvestigate).toHaveBeenCalledWith(questGraphs[0]);
    expect(f.api.storyTransition).not.toHaveBeenCalled();
    expect(f.controller.isOpen).toBe(false);
  });
  it('records the read object with the server before returning to the canvas', async () => {
    const f=fixture();f.controller.inspect('a1-arrival','lindenhafen-platform-ticket');f.click('[data-dialogue-action="next"]');
    await vi.waitFor(()=>expect(f.options.onInvestigate).toHaveBeenCalled());
    expect(f.api.inspectStory.mock.calls[0][0]).toMatchObject({questId:'a1-arrival',objectId:'lindenhafen-platform-ticket'});
    expect(f.progress.story!.inspections['a1-arrival']).toContain('lindenhafen-platform-ticket');
  });
  it('grades the gate through a receipt before offering a consequence choice', async () => {
    const f=fixture('gate');await f.controller.open('a1-arrival');
    f.click('[data-dialogue-action="translate"]');
    document.querySelector<HTMLInputElement>('#dialogue-answer')!.value='Helfen Sie mir bitte.';
    document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await vi.waitFor(()=>expect(f.api.storyTransition).toHaveBeenCalled());
    expect(f.api.request.mock.calls[0]).toMatchObject(['/attempt',{exerciseId:'a1-arrival-exercise-6',mode:'production',hinted:true,questId:'a1-arrival',sceneAttempt:true}]);
    expect(f.api.storyTransition.mock.calls[0][0]).toMatchObject({nodeId:'gate',attemptId:'saved-reply'});
    f.click('[data-dialogue-action="next"]');f.click('[data-dialogue-choice="protect"]');
    await vi.waitFor(()=>expect(f.options.onComplete).toHaveBeenCalled());
    expect(f.progress.completedQuestIds).toContain('a1-arrival');
  });
  it('keeps the investigation stage when its transition is temporarily rejected', async () => {
    const f=fixture();f.progress.story!.inspections['a1-arrival']=questGraphs[0].investigations.map(item=>item.objectId);
    f.api.storyTransition.mockRejectedValueOnce(new Error('Move closer to Otto.'));
    await f.controller.open('a1-arrival');
    expect(document.querySelector('#dialogue-answer')).toBeNull();
    expect(document.querySelector('.dialogue-feedback')?.textContent).toContain('Move closer');
    f.click('[data-dialogue-action="next"]');
    await vi.waitFor(()=>expect(document.querySelector('#dialogue-answer')).not.toBeNull());
    expect(f.api.storyTransition.mock.calls[0][0]).toEqual(f.api.storyTransition.mock.calls[1][0]);
  });
  it('marks requested contextual grammar as a hint while preserving the typed reply', async () => {
    const f=fixture('gate');await f.controller.open('a1-arrival');
    document.querySelector<HTMLInputElement>('#dialogue-answer')!.value='Helfen Sie mir bitte.';
    f.click('[data-dialogue-action="grammar"]');
    expect(document.querySelector('.dialogue-grammar')?.textContent).toContain('Mit Sie');
    expect(document.querySelector<HTMLInputElement>('#dialogue-answer')!.value).toBe('Helfen Sie mir bitte.');
    expect(f.options.expose).toHaveBeenCalledWith('a1-arrival-exercise-6');
    document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await vi.waitFor(()=>expect(f.api.request).toHaveBeenCalled());
    expect(f.api.request.mock.calls[0]).toMatchObject(['/attempt',{hinted:true}]);
  });
  it('records word lookup as assistance before submitting the preserved gate reply', async () => {
    const f=fixture('gate');await f.controller.open('a1-arrival');
    document.querySelector<HTMLInputElement>('#dialogue-answer')!.value='Helfen Sie mir bitte.';
    f.click('[aria-label="Meaning of Bitte"]');
    expect(document.querySelector('.dialogue-translation')?.textContent).toBe('Ask me for help. Then we will look at the sign.');
    expect(document.querySelector<HTMLInputElement>('#dialogue-answer')!.value).toBe('Helfen Sie mir bitte.');
    expect(f.options.expose).toHaveBeenCalledTimes(1);
    expect(f.options.expose).toHaveBeenCalledWith('a1-arrival-exercise-6');
    document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await vi.waitFor(()=>expect(f.api.request).toHaveBeenCalled());
    expect(f.api.request.mock.calls[0]).toMatchObject(['/attempt',{hinted:true,sceneAttempt:true}]);
  });
  it('retries a failed gate transition with the saved receipt and the same action ID', async () => {
    const f=fixture('gate'), send=f.api.storyTransition.getMockImplementation()!;
    f.api.storyTransition.mockRejectedValueOnce(new Error('route reconnecting')).mockImplementation(send);
    await f.controller.open('a1-arrival');document.querySelector<HTMLInputElement>('#dialogue-answer')!.value='Helfen Sie mir bitte.';
    document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await vi.waitFor(()=>expect(document.querySelector('.dialogue-feedback')?.textContent).toContain('route reconnecting'));
    document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    await vi.waitFor(()=>expect(f.api.storyTransition).toHaveBeenCalledTimes(2));
    expect(f.api.request).toHaveBeenCalledTimes(1);
    expect(f.api.storyTransition.mock.calls[0][0]).toEqual(f.api.storyTransition.mock.calls[1][0]);
  });
  it('replays a completed scene without awarding items or submitting answers again', async () => {
    const f=fixture();f.progress.completedQuestIds.push('a1-arrival');await f.controller.open('a1-arrival');
    for(let line=0;line<8;line++)f.click('[data-dialogue-action="next"]');
    f.click('[data-dialogue-action="next"]');f.click('[data-dialogue-choice="report"]');
    expect(f.api.request).not.toHaveBeenCalled();expect(f.api.storyTransition).not.toHaveBeenCalled();
  });
});
