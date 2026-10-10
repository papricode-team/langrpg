import { describe, expect, it } from 'vitest';
import { cinematicBeats, endingIds } from './cinematic-content';

describe('earned cinematic finales',()=>{
  it('stages three distinct resolutions with unique voices, camera beats and stable clips',()=>{
    const finales=endingIds.map(ending=>cinematicBeats('bell','nebelstadt',ending));
    expect(new Set(finales.map(beats=>beats.map(beat=>beat.german).join(' '))).size).toBe(3);
    expect(new Set(finales.map(beats=>beats[0].speaker)).size).toBe(3);
    expect(new Set(finales.flat().map(beat=>beat.clipId)).size).toBe(6);
    expect(new Set(finales.map(beats=>`${beats[0].x}:${beats[0].y}`)).size).toBe(3);
  });
  it('keeps legacy saves and ordinary travel playable without an ending',()=>{
    expect(cinematicBeats('bell','nebelstadt','unknown')).toEqual(cinematicBeats('bell','nebelstadt'));
    expect(cinematicBeats('travel','waldruh','towns-consent')).toEqual(cinematicBeats('travel','waldruh'));
  });
});
