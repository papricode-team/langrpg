import { describe, expect, it, vi } from 'vitest';
import { DialogSession, openAsyncDialog, trackDialogClose, type AsyncDialogHost } from './dialog-session';

/** A dialog stand-in: like the real element, its close event is dispatched a task after close(). */
function fakeDialog() {
  const target = new EventTarget();
  const dialog = Object.assign(target, {
    open: false, innerHTML: '',
    close(this: { open: boolean }) {
      if (!this.open) return;
      this.open = false;
      setTimeout(() => target.dispatchEvent(new Event('close')));
    },
  });
  return dialog as unknown as HTMLDialogElement & { innerHTML: string };
}
function host(owner = { id: 'player-1' }) {
  const session = new DialogSession(() => owner.id), dialog = fakeDialog();
  const value: AsyncDialogHost = { session, dialog: () => dialog, open: html => { session.invalidate(); dialog.innerHTML = html; dialog.open = true; } };
  return { host: value, session, dialog, owner };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('async dialog openers', () => {
  it('mounts when nothing else happened while loading', async () => {
    const { host: dialogs, dialog } = host();
    const mount = vi.fn();
    expect(await openAsyncDialog(dialogs, 'Loading', 'activity-dialog', async () => 'game', mount, vi.fn())).toBe(true);
    expect(mount).toHaveBeenCalledWith('game', dialog);
  });

  it('never paints a slow load over a dialog opened while it loaded', async () => {
    const { host: dialogs, dialog } = host();
    const load = deferred<string>(), mount = vi.fn(), fail = vi.fn();
    const pending = openAsyncDialog(dialogs, 'Loading', 'activity-dialog', () => load.promise, mount, fail);
    dialogs.open('A conversation', 'npc-dialog');
    load.resolve('activity');
    expect(await pending).toBe(false);
    expect(mount).not.toHaveBeenCalled();
    expect(dialog.innerHTML).toBe('A conversation');
  });

  it('lets the newest of two openers win and silences the older one’s errors', async () => {
    const { host: dialogs } = host();
    const first = deferred<string>(), firstMount = vi.fn(), firstFail = vi.fn(), secondMount = vi.fn();
    const older = openAsyncDialog(dialogs, 'Loading', 'a', () => first.promise, firstMount, firstFail);
    const newer = openAsyncDialog(dialogs, 'Loading', 'b', async () => 'second', secondMount, vi.fn());
    expect(await newer).toBe(true);
    first.reject(new Error('offline'));
    expect(await older).toBe(false);
    expect(firstMount).not.toHaveBeenCalled();
    expect(firstFail).not.toHaveBeenCalled();
    expect(secondMount).toHaveBeenCalledOnce();
  });

  it('drops a load that finishes after the player changed account', async () => {
    const { host: dialogs, owner } = host();
    const load = deferred<string>(), mount = vi.fn();
    const pending = openAsyncDialog(dialogs, 'Loading', 'a', () => load.promise, mount, vi.fn());
    owner.id = 'player-2';
    load.resolve('game');
    expect(await pending).toBe(false);
    expect(mount).not.toHaveBeenCalled();
  });

  it('reports load and mount failures to the opener that still owns the dialog', async () => {
    const { host: dialogs } = host();
    const fail = vi.fn();
    await openAsyncDialog(dialogs, 'Loading', 'a', async () => { throw new Error('offline'); }, vi.fn(), fail);
    await openAsyncDialog(dialogs, 'Loading', 'a', async () => 1, () => { throw new Error('mount'); }, fail);
    expect(fail.mock.calls.map(call => (call[0] as Error).message)).toEqual(['offline', 'mount']);
  });
});

describe('dialog closing', () => {
  it('cancels loads as the dialog starts closing, not when its close event arrives', async () => {
    const { session, dialog } = host();
    const consumed = trackDialogClose(dialog, session);
    let invalidatedByEvent = false;
    dialog.addEventListener('close', () => { if (!consumed()) { invalidatedByEvent = true; session.invalidate(); } });
    dialog.open = true;
    const before = session.begin();
    dialog.close();
    expect(before()).toBe(false);
    // "Close this, then open the next scene": the next opener survives the earlier close's event.
    const next = session.begin();
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(next()).toBe(true);
    expect(invalidatedByEvent).toBe(false);
  });

  it('treats Escape (the cancel event) like close()', () => {
    const { session, dialog } = host();
    const consumed = trackDialogClose(dialog, session);
    const loading = session.begin();
    dialog.dispatchEvent(new Event('cancel'));
    expect(loading()).toBe(false);
    expect(consumed()).toBe(true);
    expect(consumed()).toBe(false);
  });
});
