import {describe, expect, it} from 'vitest';
import {stageBeats} from './cinematic-staging';
import {findStation, stationArrival, stationTrainPosition} from './station-train-position';

describe('station train landmark', () => {
  it('uses the independent locomotive chimney after the station is assembled from pieces', () => {
    const train={frame:'railway-locomotive',x:1000,y:2000,width:1254};
    expect(stationTrainPosition(train)).toEqual({x:744,y:1361});
    expect(stationTrainPosition({...train,flipX:true,width:627})).toEqual({x:1128,y:1680.5});
  });
  it('follows the moved and enlarged station instead of the original town coordinate', () => {
    expect(stationTrainPosition({x: 1000, y: 2000, width: 1222})).toEqual({x: 1128, y: 1621});
    expect(stationTrainPosition({x: 3000, y: 5000, width: 4888})).toEqual({x: 3512, y: 3484});
  });

  it('keeps the steam on the train when the station is mirrored', () => {
    expect(stationTrainPosition({x: 1000, y: 2000, width: 1222, flipX: true})).toEqual({x: 872, y: 1621});
  });

  it('finds the placed locomotive before the combined station building', () => {
    const building={id:'station',asset:'station',x:1840,y:404,width:280};
    const locomotive={id:'loco',asset:'terrain-object',frame:'railway-locomotive',x:900,y:600,width:300};
    expect(findStation([building] as never)).toBe(building);
    expect(findStation([building, locomotive] as never)).toBe(locomotive);
    expect(findStation([{id:'house',asset:'house',x:0,y:0,width:100}] as never)).toBeUndefined();
  });

  it('lets the passenger off on the forecourt in front of the station', () => {
    expect(stationArrival({x: 1840, y: 404, width: 280})).toEqual({x: 1840, y: 460});
  });

  it('aims the arrival at the live station and then at the spot the player stands on', () => {
    const authored = [{x: 1245, y: 320, zoom: 1.7, speaker: 'Otto', german: 'Der Zug ist da.', seconds: 3}, {x: 1170, y: 355, zoom: 2.2, speaker: 'Otto', german: 'Seit zwölf Jahren.', seconds: 3}];
    const stage = {station: {x: 1850, y: 370}, arrival: {x: 1840, y: 460}};
    expect(stageBeats('arrival', authored, stage)).toMatchObject([{x: 1850, y: 370, zoom: 1.7}, {x: 1840, y: 460, zoom: 2.2}]);
    expect(stageBeats('travel', authored.slice(0, 1), stage)).toMatchObject([{x: 1850, y: 370}]);
    expect(stageBeats('recording', authored, stage)).toBe(authored);
    expect(stageBeats('arrival', authored, undefined)).toBe(authored);
  });
});
