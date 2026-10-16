import {describe, expect, it} from 'vitest';
import {MapEditStore, type StoreFailure} from './map-edit-store';
import {sceneDocument} from './scene-data';
import type {WorldSceneDocument} from './scene-schema';
import {applyEditOps, type WorldEditOp} from './world-edit-ops';
import {WorldEditRequestError, type EditResult} from './world-edit-session';
import {groundFingerprint, paintGround} from './ground';

const document = (): WorldSceneDocument => ({version: 4, maps: {waldruh: structuredClone(sceneDocument.maps.waldruh)}});

/** A server that answers when told to, so tests can look at the view in between. */
function harness(initial = document()) {
  let published = initial, version = 1;
  const waiting: {ops: WorldEditOp[]; resolve: (value: EditResult) => void; reject: (error: Error) => void}[] = [];
  const failures: StoreFailure[] = [];
  let stale = 0, saving = false, onStale: (() => void) | undefined;
  const store = new MapEditStore(initial, 'v1', {send: ops => new Promise((resolve, reject) => waiting.push({ops, resolve, reject}))},
    {changed: () => undefined, failed: failure => failures.push(failure), stale: () => { stale++; onStale?.(); }, saving: active => { saving = active; }});
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  return {
    store, failures, get stale() { return stale; }, get saving() { return saving; }, waiting,
    /** What the editor does when told its base is stale, such as reloading the world. */
    set onStale(value: () => void) { onStale = value; },
    async accept() {
      const next = waiting.shift()!, from = `v${version}`;
      published = applyEditOps(published, next.ops).document; version++;
      next.resolve({revision: `r${version}`, from, contentVersion: `v${version}`, applied: next.ops, warnings: []});
      await flush();
    },
    async refuse(message = 'Players could not reach the baker there.', code: 'blocks-route' | 'stale' = 'blocks-route') {
      waiting.shift()!.reject(new WorldEditRequestError(message, code === 'stale' ? 409 : 422, [{code, map: 'waldruh', message, objectIds: [], severity: 'error'}]));
      await flush();
    },
    /** Another admin publishes behind our back. */
    external(ops: WorldEditOp[]) { published = applyEditOps(published, ops).document; version++; return {document: published, version: `v${version}`}; },
  };
}
const lampOf = (value: WorldSceneDocument) => value.maps.waldruh.scenery.find(item => item.asset === 'lamp')!;

describe('map edit store', () => {
  it('shows an edit before the server answers and keeps it once accepted', async () => {
    const server = harness(), lamp = lampOf(server.store.document);
    server.store.commit([{kind: 'move', map: 'waldruh', id: lamp.id, x: lamp.x + 40, y: lamp.y}], 'Move lamp');
    expect(lampOf(server.store.document).x).toBe(lamp.x + 40);
    expect(server.store.busy).toBe(true);
    expect(server.saving).toBe(true);
    await server.accept();
    expect(lampOf(server.store.document).x).toBe(lamp.x + 40);
    expect(server.store.version).toBe('v2');
    expect(server.store.busy).toBe(false);
    expect(server.saving).toBe(false);
  });

  it('takes a refused edit back out, keeps later edits and drops it from undo', async () => {
    const server = harness(), lamp = lampOf(server.store.document);
    server.store.commit([{kind: 'move', map: 'waldruh', id: lamp.id, x: lamp.x + 40, y: lamp.y}], 'Move lamp');
    server.store.commit([{kind: 'update', map: 'waldruh', id: lamp.id, flipX: !lamp.flipX}], 'Flip lamp');
    await server.refuse();
    expect(server.failures).toHaveLength(1);
    expect(server.failures[0].problems[0].code).toBe('blocks-route');
    // The flip still shows; the move is gone.
    expect(lampOf(server.store.document)).toMatchObject({x: lamp.x});
    expect(!!lampOf(server.store.document).flipX).toBe(!lamp.flipX);
    await server.accept();
    expect(server.store.undoLabel).toBe('Flip lamp');
    server.store.undo();
    expect(server.store.canUndo).toBe(false);
  });

  it('undoes and redoes through the server', async () => {
    const server = harness(), lamp = lampOf(server.store.document);
    server.store.commit([{kind: 'move', map: 'waldruh', id: lamp.id, x: lamp.x + 40, y: lamp.y + 8}], 'Move lamp');
    await server.accept();
    expect(server.store.undo()).toBe('Move lamp');
    expect(lampOf(server.store.document)).toMatchObject({x: lamp.x, y: lamp.y});
    await server.accept();
    expect(server.store.canRedo).toBe(true);
    expect(server.store.redo()).toBe('Move lamp');
    expect(lampOf(server.store.document)).toMatchObject({x: lamp.x + 40, y: lamp.y + 8});
    await server.accept();
    expect(server.store.canUndo).toBe(true);
    expect(server.store.canRedo).toBe(false);
  });

  it('a new edit clears redo', async () => {
    const server = harness(), lamp = lampOf(server.store.document);
    server.store.commit([{kind: 'move', map: 'waldruh', id: lamp.id, x: lamp.x + 40, y: lamp.y}], 'Move lamp');
    server.store.undo();
    server.store.commit([{kind: 'update', map: 'waldruh', id: lamp.id, flipX: true}], 'Flip lamp');
    expect(server.store.canRedo).toBe(false);
  });

  it('refuses operations that do not apply without changing anything', () => {
    const server = harness();
    expect(() => server.store.commit([{kind: 'move', map: 'waldruh', id: 'no-such-object', x: 1, y: 1}], 'Move')).toThrow();
    expect(server.store.canUndo).toBe(false);
    expect(server.waiting).toHaveLength(0);
  });

  it('reports a stale base and keeps waiting edits when rebased', async () => {
    const server = harness(), lamp = lampOf(server.store.document);
    const bench = server.store.document.maps.waldruh.scenery.find(item => item.asset === 'bench')!;
    const newer = server.external([{kind: 'move', map: 'waldruh', id: bench.id, x: bench.x + 5, y: bench.y}]);
    server.store.commit([{kind: 'move', map: 'waldruh', id: lamp.id, x: lamp.x + 40, y: lamp.y}], 'Move lamp');
    server.store.rebase(newer.document, newer.version);
    expect(lampOf(server.store.document).x).toBe(lamp.x + 40);
    expect(server.store.document.maps.waldruh.scenery.find(item => item.id === bench.id)!.x).toBe(bench.x + 5);
    // The server answers from a version this client never saw.
    const next = server.waiting.shift()!;
    next.resolve({revision: 'r9', from: 'v8', contentVersion: 'v9', applied: next.ops, warnings: []});
    await Promise.resolve(); await Promise.resolve();
    expect(server.stale).toBe(1);
  });

  it('catches up and sends an edit again when the server says the world moved on', async () => {
    const server = harness(), lamp = lampOf(server.store.document);
    server.store.commit([{kind: 'move', map: 'waldruh', id: lamp.id, x: lamp.x + 40, y: lamp.y}], 'Move lamp');
    await server.refuse('The world changed while saving.', 'stale');
    expect(server.stale).toBe(1);
    expect(server.failures).toHaveLength(0);
    // The same edit is on its way again and still shows.
    expect(server.waiting).toHaveLength(1);
    expect(lampOf(server.store.document).x).toBe(lamp.x + 40);
    await server.refuse('The world changed while saving.', 'stale');
    // A second refusal is reported instead of retrying for ever.
    expect(server.failures).toHaveLength(1);
    expect(lampOf(server.store.document).x).toBe(lamp.x);
  });

  it('does not send a ground edit again when the reloaded world no longer matches it', async () => {
    const server = harness(), scene = server.store.document.maps.waldruh;
    const painted = paintGround(scene.ground, scene.width, scene.height, {material: 'cobble', radius: 20, strength: 1, points: [[40, 40]]});
    server.store.commit([{kind: 'ground', map: 'waldruh', ground: painted, expected: groundFingerprint(scene.ground)}], 'Edit ground pieces');
    // Another admin painted meanwhile; the reload adopts their ground, which the edit was not based on.
    const newer = server.external([{kind: 'paint', map: 'waldruh', material: 'earth', radius: 20, strength: 1, points: [[200, 200]]}]);
    server.onStale = () => server.store.rebase(newer.document, newer.version);
    await server.refuse('The ground changed since you started.', 'stale');
    expect(server.stale).toBe(1);
    expect(server.waiting).toHaveLength(0);
    expect(server.failures).toHaveLength(1);
    expect(server.store.document.maps.waldruh.ground).toBe(newer.document.maps.waldruh.ground);
    expect(server.store.canUndo).toBe(false);
  });
});
