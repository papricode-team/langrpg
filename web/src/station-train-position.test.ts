import {describe, expect, it} from 'vitest';
import {stationTrainPosition} from './station-train-position';

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
});
