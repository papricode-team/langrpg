import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessExpansion,townSizeTargets} from './world-expansion-audit.mjs';

const baseline = Object.keys(townSizeTargets).map(id=>({id,spawnConnectedCells:100,approxConnectedArea:19600}));
const complete = Object.entries(townSizeTargets).map(([id,size])=>({id,...size,cellSize:8,spawnConnectedCells:400,
  approxConnectedArea:25600,walkableSamples:1000,reachableSamples:1000}));
const withFirst = value => [value,...complete.slice(1)];

test('requires planned town sizes, original connected area and reachable ground independently', () => {
  assert.equal(assessExpansion(complete,baseline).passed,true);
  assert.equal(assessExpansion(withFirst({...complete[0],width:3072}),baseline).passed,false);
  assert.equal(assessExpansion(withFirst({...complete[0],height:1024}),baseline).passed,false);
  assert.equal(assessExpansion(withFirst({...complete[0],spawnConnectedCells:300,approxConnectedArea:19200}),baseline).passed,false);
  assert.equal(assessExpansion(withFirst({...complete[0],reachableSamples:995}),baseline).passed,true);
  assert.equal(assessExpansion(withFirst({...complete[0],reachableSamples:994}),baseline).passed,false);
});

test('finer cells are compared through area rather than the historical node count', () => {
  const report=assessExpansion(complete,[...baseline,{id:'retired',approxConnectedArea:1000000}]);
  assert.equal(report.passed,true);
  assert.equal(report.maps.length,3);
  assert.equal(report.maps[0].minimum.connectedArea,19600);
});

test('missing maps, duplicates, retired maps and inconsistent sampling cannot accidentally pass', () => {
  assert.equal(assessExpansion([],baseline).passed,false);
  assert.equal(assessExpansion([...complete,complete[0]],baseline).passed,false);
  assert.equal(assessExpansion([...complete,{...complete[0],id:'saffroncourt'}],baseline).passed,false);
  assert.equal(assessExpansion(withFirst({...complete[0],cellSize:14}),baseline).passed,false);
  assert.equal(assessExpansion(withFirst({...complete[0],approxConnectedArea:40000}),baseline).passed,false);
  assert.equal(assessExpansion(withFirst({...complete[0],walkableSamples:0}),baseline).passed,false);
  assert.equal(assessExpansion(withFirst({...complete[0],reachableSamples:1001}),baseline).passed,false);
});
