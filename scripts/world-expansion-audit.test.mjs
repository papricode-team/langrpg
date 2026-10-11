import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessExpansion} from './world-expansion-audit.mjs';

const baseline = [{id:'town',spawnConnectedCells:100,minExpandedConnectedArea:39200}];
const complete = {id:'town',width:3072,height:2048,cellSize:14,spawnConnectedCells:200,approxConnectedArea:39200};
test('requires doubled dimensions and doubled spawn-connected land independently', () => {
  assert.equal(assessExpansion([complete],baseline).passed,true);
  assert.equal(assessExpansion([{...complete,width:1536}],baseline).passed,false);
  assert.equal(assessExpansion([{...complete,height:1024}],baseline).passed,false);
  const disconnected = {...complete,totalWalkableCells:500,spawnConnectedCells:100,approxConnectedArea:19600};
  assert.equal(assessExpansion([disconnected],baseline).passed,false);
});
test('missing maps and incompatible sampling cannot accidentally pass', () => {
  assert.equal(assessExpansion([],baseline).passed,false);
  assert.equal(assessExpansion([complete,complete],baseline).passed,false);
  assert.equal(assessExpansion([{...complete,cellSize:28}],baseline).passed,false);
  assert.equal(assessExpansion([{...complete,approxConnectedArea:40000}],baseline).passed,false);
});
